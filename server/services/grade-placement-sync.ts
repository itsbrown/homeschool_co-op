/**
 * Grade Placement sync: place session-paid students onto class rosters by grade.
 * Dry-run preview and apply share the same eligibility evaluation.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  children,
  classes,
  programEnrollments,
  schoolStudents,
  sessions,
  users,
  type Class,
  type ProgramEnrollment,
} from "../../shared/schema";
import { gradesMatch, normalizeGradeLevel } from "../../shared/grade-levels";
import { hasPaidTowardSession } from "../../shared/session-payment-eligibility";

export type GradePlacementReasonCode =
  | "placed"
  | "already_placed"
  | "already_enrolled"
  | "removed"
  | "unpaid_session"
  | "wrong_location"
  | "grade_mismatch"
  | "not_affiliated"
  | "terminal_session"
  | "wishlist_or_waitlist"
  | "session_inactive"
  | "class_misconfigured";

export const GRADE_PLACEMENT_REASON_LABELS: Record<GradePlacementReasonCode, string> = {
  placed: "Placed by grade",
  already_placed: "Already on roster (grade placement)",
  already_enrolled: "Already enrolled (paid/manual)",
  removed: "Removed — no longer eligible",
  unpaid_session: "Hasn’t paid toward this session",
  wrong_location: "Different campus",
  grade_mismatch: "Grade doesn’t match this class",
  not_affiliated: "Not an active student at this school",
  terminal_session: "Session enrollment cancelled or withdrawn",
  wishlist_or_waitlist: "On waitlist or location wishlist",
  session_inactive: "Session is completed or cancelled",
  class_misconfigured: "Class missing location, session, or grades",
};

export type GradePlacementChildResult = {
  childId: number;
  childName: string;
  gradeLevel: string | null;
  reasonCode: GradePlacementReasonCode;
  reasonLabel: string;
};

export type GradePlacementSyncResult = {
  classId: number;
  dryRun: boolean;
  placed: number;
  alreadyPlaced: number;
  alreadyEnrolled: number;
  removed: number;
  blocked: number;
  overCapacity: boolean;
  capacity: number | null;
  results: GradePlacementChildResult[];
  summaryLabel: string;
};

const ACTIVE_CLASS_ENROLLMENT_STATUSES = new Set([
  "enrolled",
  "pending_payment",
  "pending_admin_approval",
  "waitlist",
  "completed",
]);

function reason(
  childId: number,
  childName: string,
  gradeLevel: string | null,
  code: GradePlacementReasonCode,
): GradePlacementChildResult {
  return {
    childId,
    childName,
    gradeLevel,
    reasonCode: code,
    reasonLabel: GRADE_PLACEMENT_REASON_LABELS[code],
  };
}

function summarize(result: Omit<GradePlacementSyncResult, "summaryLabel">): GradePlacementSyncResult {
  const parts = [
    `${result.placed} placed`,
    `${result.removed} removed`,
    `${result.blocked} blocked`,
  ];
  if (result.alreadyPlaced) parts.push(`${result.alreadyPlaced} already placed`);
  if (result.alreadyEnrolled) parts.push(`${result.alreadyEnrolled} already enrolled`);
  if (result.overCapacity) parts.push("over capacity");
  return { ...result, summaryLabel: parts.join(" · ") };
}

function isClassConfiguredForAutoPlace(cls: Class): boolean {
  return (
    !!cls.autoPlaceByGrade &&
    cls.locationId != null &&
    cls.sessionId != null &&
    Array.isArray(cls.gradeLevels) &&
    cls.gradeLevels.length > 0
  );
}

async function loadClass(classId: number): Promise<Class | null> {
  const db = await getDb();
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  return cls ?? null;
}

/**
 * Evaluate eligibility / apply placement for one class.
 */
export async function runGradePlacementForClass(
  classId: number,
  options: { dryRun: boolean },
): Promise<GradePlacementSyncResult> {
  const dryRun = options.dryRun;
  const cls = await loadClass(classId);
  if (!cls || cls.schoolId == null) {
    return summarize({
      classId,
      dryRun,
      placed: 0,
      alreadyPlaced: 0,
      alreadyEnrolled: 0,
      removed: 0,
      blocked: 0,
      overCapacity: false,
      capacity: null,
      results: [
        reason(0, "", null, "class_misconfigured"),
      ],
    });
  }

  const db = await getDb();
  const results: GradePlacementChildResult[] = [];
  let placed = 0;
  let alreadyPlaced = 0;
  let alreadyEnrolled = 0;
  let removed = 0;
  let blocked = 0;

  const existingPlacementRows = await db
    .select()
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.marketplaceClassId, classId),
        eq(programEnrollments.placementSource, "grade"),
        inArray(programEnrollments.status, ["enrolled", "pending_admin_approval", "completed"]),
      ),
    );

  if (!cls.autoPlaceByGrade || !isClassConfiguredForAutoPlace(cls)) {
    for (const row of existingPlacementRows) {
      if (!dryRun) {
        await db
          .update(programEnrollments)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(programEnrollments.id, row.id));
      }
      removed += 1;
      results.push(
        reason(row.childId, row.childName, null, "removed"),
      );
    }
    if (!cls.autoPlaceByGrade) {
      return summarize({
        classId,
        dryRun,
        placed: 0,
        alreadyPlaced: 0,
        alreadyEnrolled: 0,
        removed,
        blocked: 0,
        overCapacity: false,
        capacity: cls.capacity ?? null,
        results,
      });
    }
    results.push(reason(0, "", null, "class_misconfigured"));
    blocked += 1;
    return summarize({
      classId,
      dryRun,
      placed: 0,
      alreadyPlaced: 0,
      alreadyEnrolled: 0,
      removed,
      blocked,
      overCapacity: false,
      capacity: cls.capacity ?? null,
      results,
    });
  }

  const sessionId = cls.sessionId!;
  const locationId = cls.locationId!;

  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!sessionRow || sessionRow.status === "completed" || sessionRow.status === "cancelled") {
    for (const row of existingPlacementRows) {
      // Keep existing roster when session ends; do not add new placements
      results.push(reason(row.childId, row.childName, null, "already_placed"));
      alreadyPlaced += 1;
    }
    blocked += 1;
    results.push(reason(0, "", null, "session_inactive"));
    return summarize({
      classId,
      dryRun,
      placed: 0,
      alreadyPlaced,
      alreadyEnrolled: 0,
      removed: 0,
      blocked,
      overCapacity: false,
      capacity: cls.capacity ?? null,
      results,
    });
  }

  if (sessionRow.locationId != null && sessionRow.locationId !== locationId) {
    results.push(reason(0, "", null, "class_misconfigured"));
    return summarize({
      classId,
      dryRun,
      placed: 0,
      alreadyPlaced: 0,
      alreadyEnrolled: 0,
      removed: 0,
      blocked: 1,
      overCapacity: false,
      capacity: cls.capacity ?? null,
      results,
    });
  }

  // Batch: affiliated students at school
  const affiliationRows = await db
    .select({
      childId: schoolStudents.childId,
      schoolStudentLocationId: schoolStudents.locationId,
      schoolStudentStatus: schoolStudents.status,
      grade: schoolStudents.grade,
      firstName: children.firstName,
      lastName: children.lastName,
      childGrade: children.gradeLevel,
      childLocationId: children.locationId,
      parentId: children.parentId,
      parentEmail: children.parentEmail,
    })
    .from(schoolStudents)
    .innerJoin(children, eq(schoolStudents.childId, children.id))
    .where(
      and(
        eq(schoolStudents.schoolId, cls.schoolId),
        eq(schoolStudents.status, "active"),
      ),
    );

  const childIds = affiliationRows.map((r) => r.childId);
  const sessionEnrollmentsByChild = new Map<number, ProgramEnrollment[]>();
  const classEnrollmentsByChild = new Map<number, ProgramEnrollment[]>();

  if (childIds.length > 0) {
    // Session tuition rows (F001 v2 / null class link) — not grade-placement seats
    const sessionEnrollments = await db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.sessionId, sessionId),
          inArray(programEnrollments.childId, childIds),
          or(isNull(programEnrollments.placementSource), sql`${programEnrollments.placementSource} IS DISTINCT FROM 'grade'`),
          or(
            eq(programEnrollments.enrollmentVersion, "v2"),
            isNull(programEnrollments.marketplaceClassId),
          ),
        ),
      );

    for (const e of sessionEnrollments) {
      const list = sessionEnrollmentsByChild.get(e.childId) ?? [];
      list.push(e);
      sessionEnrollmentsByChild.set(e.childId, list);
    }

    const classEnrollments = await db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.marketplaceClassId, classId),
          inArray(programEnrollments.childId, childIds),
        ),
      );

    for (const e of classEnrollments) {
      const list = classEnrollmentsByChild.get(e.childId) ?? [];
      list.push(e);
      classEnrollmentsByChild.set(e.childId, list);
    }
  }

  const parentIds = [...new Set(affiliationRows.map((r) => r.parentId))];
  const parentEmailById = new Map<number, string>();
  const parentLocationById = new Map<number, number | null>();
  if (parentIds.length > 0) {
    const parents = await db
      .select({ id: users.id, email: users.email, locationId: users.locationId })
      .from(users)
      .where(inArray(users.id, parentIds));
    for (const p of parents) {
      if (p.email) parentEmailById.set(p.id, p.email);
      parentLocationById.set(p.id, p.locationId ?? null);
    }
  }

  const placementByChild = new Map(
    existingPlacementRows.map((r) => [r.childId, r] as const),
  );
  const eligibleChildIds = new Set<number>();

  for (const row of affiliationRows) {
    const childName = `${row.firstName} ${row.lastName}`.trim();
    const gradeForMatch = row.childGrade || row.grade;
    // Explicit student campus first; fall back to child then parent (many
    // children inherit campus only on the parent profile).
    const resolvedLocation =
      row.schoolStudentLocationId ??
      row.childLocationId ??
      parentLocationById.get(row.parentId) ??
      null;

    if (resolvedLocation !== locationId) {
      blocked += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "wrong_location"));
      continue;
    }

    if (!gradesMatch(gradeForMatch, cls.gradeLevels)) {
      blocked += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "grade_mismatch"));
      continue;
    }

    const sessionRows = sessionEnrollmentsByChild.get(row.childId) ?? [];
    if (sessionRows.length === 0) {
      blocked += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "unpaid_session"));
      continue;
    }

    const waitlistOnly = sessionRows.every(
      (e) => e.status === "waitlist" || e.status === "location_wishlist",
    );
    if (waitlistOnly) {
      blocked += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "wishlist_or_waitlist"));
      continue;
    }

    const terminalOnly = sessionRows.every((e) =>
      ["cancelled", "withdrawn", "failed"].includes(e.status),
    );
    if (terminalOnly) {
      blocked += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "terminal_session"));
      continue;
    }

    const paidSession = sessionRows.find((e) => hasPaidTowardSession(e));
    if (!paidSession) {
      blocked += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "unpaid_session"));
      continue;
    }

    eligibleChildIds.add(row.childId);

    const classRows = classEnrollmentsByChild.get(row.childId) ?? [];
    const paidOrManual = classRows.find(
      (e) =>
        (e.placementSource == null || e.placementSource !== "grade") &&
        ACTIVE_CLASS_ENROLLMENT_STATUSES.has(e.status),
    );
    if (paidOrManual) {
      alreadyEnrolled += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "already_enrolled"));
      continue;
    }

    const existingPlacement = placementByChild.get(row.childId);
    if (existingPlacement && ACTIVE_CLASS_ENROLLMENT_STATUSES.has(existingPlacement.status)) {
      alreadyPlaced += 1;
      results.push(reason(row.childId, childName, gradeForMatch, "already_placed"));
      continue;
    }

    if (!dryRun) {
      const parentEmail =
        row.parentEmail || parentEmailById.get(row.parentId) || "unknown@example.com";
      await db.insert(programEnrollments).values({
        schoolId: cls.schoolId,
        classType: "marketplace",
        marketplaceClassId: classId,
        classId: null,
        sessionId,
        locationId,
        childId: row.childId,
        childName,
        className: cls.title,
        parentId: row.parentId,
        parentEmail,
        totalCost: 0,
        totalPaid: 0,
        remainingBalance: 0,
        depositRequired: 0,
        paymentStatus: "completed",
        status: "enrolled",
        enrollmentVersion: "v1",
        placementSource: "grade",
        programStartDate: cls.startDate ?? null,
        programEndDate: cls.endDate ?? null,
        notes: "Grade Placement (auto-place by grade)",
        metadata: { placementSource: "grade", syncedAt: new Date().toISOString() },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    placed += 1;
    results.push(reason(row.childId, childName, gradeForMatch, "placed"));
  }

  // Remove placement rows for children no longer eligible
  for (const row of existingPlacementRows) {
    if (eligibleChildIds.has(row.childId)) continue;
    // Skip remove if they have paid/manual seat (shouldn't have placement, but be safe)
    const classRows = classEnrollmentsByChild.get(row.childId) ?? [];
    const paidOrManual = classRows.find(
      (e) =>
        (e.placementSource == null || e.placementSource !== "grade") &&
        ACTIVE_CLASS_ENROLLMENT_STATUSES.has(e.status),
    );
    if (paidOrManual) continue;

    if (!dryRun) {
      await db
        .update(programEnrollments)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(programEnrollments.id, row.id));
    }
    removed += 1;
    results.push(reason(row.childId, row.childName, null, "removed"));
  }

  const estimatedRoster = alreadyEnrolled + alreadyPlaced + placed;
  const capacity = cls.capacity ?? null;
  const overCapacity = capacity != null && estimatedRoster > capacity;

  return summarize({
    classId,
    dryRun,
    placed,
    alreadyPlaced,
    alreadyEnrolled,
    removed,
    blocked,
    overCapacity,
    capacity,
    results,
  });
}

export async function previewGradePlacementsForClass(
  classId: number,
): Promise<GradePlacementSyncResult> {
  return runGradePlacementForClass(classId, { dryRun: true });
}

export async function syncGradePlacementsForClass(
  classId: number,
): Promise<GradePlacementSyncResult> {
  return runGradePlacementForClass(classId, { dryRun: false });
}

/** Sync all auto-place classes for a school that use this session (after payment). */
export async function syncGradePlacementsForSession(
  schoolId: number,
  sessionId: number,
): Promise<GradePlacementSyncResult[]> {
  const db = await getDb();
  const autoClasses = await db
    .select({ id: classes.id })
    .from(classes)
    .where(
      and(
        eq(classes.schoolId, schoolId),
        eq(classes.sessionId, sessionId),
        eq(classes.autoPlaceByGrade, true),
      ),
    );

  const out: GradePlacementSyncResult[] = [];
  for (const c of autoClasses) {
    out.push(await syncGradePlacementsForClass(c.id));
  }
  return out;
}

/** Sync auto-place classes that include this child's grade at their school/location. */
export async function syncGradePlacementsForChild(childId: number): Promise<GradePlacementSyncResult[]> {
  const db = await getDb();
  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) return [];

  const affiliations = await db
    .select()
    .from(schoolStudents)
    .where(and(eq(schoolStudents.childId, childId), eq(schoolStudents.status, "active")));

  const out: GradePlacementSyncResult[] = [];
  const seen = new Set<number>();

  for (const aff of affiliations) {
    const locationId = aff.locationId ?? child.locationId;
    if (locationId == null) continue;

    const autoClasses = await db
      .select()
      .from(classes)
      .where(
        and(
          eq(classes.schoolId, aff.schoolId),
          eq(classes.locationId, locationId),
          eq(classes.autoPlaceByGrade, true),
        ),
      );

    for (const cls of autoClasses) {
      if (seen.has(cls.id)) continue;
      const grade = child.gradeLevel || aff.grade;
      if (!gradesMatch(grade, cls.gradeLevels) && !normalizeGradeLevel(grade)) {
        // Still sync — may need to remove
      }
      seen.add(cls.id);
      out.push(await syncGradePlacementsForClass(cls.id));
    }
  }

  return out;
}
