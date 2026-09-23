/**
 * School-scoped reads for the My School overview.
 * Definitions live in school-dashboard-metrics.ts.
 */
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  classes,
  educatorClassAssignments,
  membershipEnrollments,
  payments,
  programEnrollments,
  roleInvitations,
  sessions,
  staffInvitations,
  userRoles,
  users,
} from '@shared/schema';
import { getDb } from '../db';
import { sqlEnrollmentEffectiveBalanceColumn, sqlEnrollmentEffectiveBalancePositive } from './enrollment-balance';
import { buildSchoolLiteracyAnalytics } from './progress-analytics';
import {
  buildAcademicClassMetrics,
  buildEnrollmentMetrics,
  buildFinancialMetrics,
  buildStaffMetrics,
  CLASS_SEAT_STATUSES,
  enrollmentInLocationScope,
  isDashboardActiveClass,
  paymentInLocationScope,
  selectCurrentSessions,
  type AcademicClassMetrics,
  type EnrollmentDashboardMetrics,
  type FinancialDashboardMetrics,
  type SessionWindow,
  type StaffDashboardMetrics,
} from './school-dashboard-metrics';

const MEMBERSHIP_OWED = ['pending_payment', 'grace_period'] as const;

function rowsOf<T>(value: unknown): T[] {
  return value as T[];
}

type ClassSessionRow = {
  id: number;
  sessionId: number | null;
  status: string;
  endDate: Date | string | null;
  instructorId: number | null;
};

type EnrollmentLinkRow = {
  childId: number;
  parentEmail: string;
  status: string;
  sessionId: number | null;
  enrollmentDate: Date | string | null;
  programEndDate: Date | string | null;
  marketplaceClassId: number | null;
  classId: number | null;
};

type SeatRow = {
  childId: number;
  status: string;
  marketplaceClassId: number | null;
  classId: number | null;
};

type OwingRow = {
  parentEmail: string;
  locationId: number | null;
  marketplaceClassId: number | null;
  classId: number | null;
  outstandingCents: number | string | null;
};

export type AcademicDashboardMetrics = AcademicClassMetrics & {
  averageProgress: number | null;
  readingStudents: number;
  studentTeacherRatio: number | null;
};

function easternToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/** Calendar date. Date-only values stay on that day; timestamps use Eastern. */
export function toCalendarIso(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match && value.length <= 10) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
}

function toSessionIso(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

async function loadSessions(schoolId: number): Promise<SessionWindow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: sessions.id,
      startDate: sessions.startDate,
      endDate: sessions.endDate,
      status: sessions.status,
    })
    .from(sessions)
    .where(eq(sessions.schoolId, schoolId));

  const windows: SessionWindow[] = [];
  for (const row of rows) {
    const startDate = toSessionIso(row.startDate);
    const endDate = toSessionIso(row.endDate);
    if (!startDate || !endDate) continue;
    windows.push({ id: row.id, startDate, endDate, status: row.status });
  }
  return windows;
}

export async function loadEnrollmentDashboardMetrics(
  schoolId: number,
  now = new Date(),
): Promise<EnrollmentDashboardMetrics> {
  const db = await getDb();
  const today = easternToday(now);
  const [sessionRows, classRows, enrollmentRows] = await Promise.all([
    loadSessions(schoolId),
    db
      .select({ id: classes.id, sessionId: classes.sessionId })
      .from(classes)
      .where(eq(classes.schoolId, schoolId)),
    db
      .select({
        childId: programEnrollments.childId,
        parentEmail: programEnrollments.parentEmail,
        status: programEnrollments.status,
        sessionId: programEnrollments.sessionId,
        enrollmentDate: programEnrollments.enrollmentDate,
        programEndDate: programEnrollments.programEndDate,
        marketplaceClassId: programEnrollments.marketplaceClassId,
        classId: programEnrollments.classId,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.schoolId, schoolId)),
  ]);

  const classSessionById = new Map<number, number | null>();
  for (const cls of rowsOf<{ id: number; sessionId: number | null }>(classRows)) {
    classSessionById.set(cls.id, cls.sessionId);
  }

  return buildEnrollmentMetrics({
    today,
    sessions: sessionRows,
    enrollments: rowsOf<EnrollmentLinkRow>(enrollmentRows).map((row) => {
      const linkedId = row.marketplaceClassId ?? row.classId;
      const classSessionId =
        linkedId != null ? classSessionById.get(linkedId) ?? null : null;
      return {
        childId: row.childId,
        parentEmail: row.parentEmail,
        status: row.status,
        sessionId: row.sessionId,
        classSessionId,
        enrollmentDate: toCalendarIso(row.enrollmentDate),
        programEndDate: toSessionIso(row.programEndDate),
      };
    }),
  });
}

export async function loadAcademicDashboardMetrics(
  schoolId: number,
  now = new Date(),
): Promise<AcademicDashboardMetrics> {
  const db = await getDb();
  const today = easternToday(now);
  const [sessionRows, classRows, enrollmentRows] = await Promise.all([
    loadSessions(schoolId),
    db
      .select({
        id: classes.id,
        status: classes.status,
        endDate: classes.endDate,
        sessionId: classes.sessionId,
      })
      .from(classes)
      .where(eq(classes.schoolId, schoolId)),
    db
      .select({
        childId: programEnrollments.childId,
        status: programEnrollments.status,
        marketplaceClassId: programEnrollments.marketplaceClassId,
        classId: programEnrollments.classId,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.schoolId, schoolId)),
  ]);

  const currentIds = new Set(selectCurrentSessions(sessionRows, today).map((s) => s.id));
  const academicClasses = rowsOf<ClassSessionRow>(classRows);
  const activeClasses = academicClasses.filter((cls) =>
    isDashboardActiveClass(
      {
        id: cls.id,
        status: cls.status,
        endDate: toSessionIso(cls.endDate),
        sessionId: cls.sessionId,
      },
      currentIds,
      today,
    ),
  );
  const activeIds = new Set(activeClasses.map((cls) => cls.id));

  const seatsByClassId = new Map<number, Set<number>>();
  for (const row of rowsOf<SeatRow>(enrollmentRows)) {
    if (!CLASS_SEAT_STATUSES.has(row.status.toLowerCase())) continue;
    const linked = [row.marketplaceClassId, row.classId].filter(
      (id): id is number => id != null && activeIds.has(id),
    );
    for (const classId of new Set(linked)) {
      const children = seatsByClassId.get(classId) ?? new Set<number>();
      children.add(row.childId);
      seatsByClassId.set(classId, children);
    }
  }
  const seatCounts = new Map<number, number>();
  for (const [classId, children] of seatsByClassId) {
    seatCounts.set(classId, children.size);
  }

  const classMetrics = buildAcademicClassMetrics({
    today,
    sessions: sessionRows,
    classes: academicClasses.map((cls) => ({
      id: cls.id,
      status: cls.status,
      endDate: toSessionIso(cls.endDate),
      sessionId: cls.sessionId,
    })),
    seatsByClassId: seatCounts,
  });

  let averageProgress: number | null = null;
  let readingStudents = 0;
  try {
    const literacy = await buildSchoolLiteracyAnalytics(schoolId);
    readingStudents = literacy.coverage.withReadingData;
    if (readingStudents > 0) {
      averageProgress = literacy.headline.improvedPct;
    }
  } catch (error) {
    console.error('My School reading growth unavailable:', error);
  }

  return {
    ...classMetrics,
    averageProgress,
    readingStudents,
    studentTeacherRatio: null,
  };
}

export async function loadStaffDashboardMetrics(
  schoolId: number,
  now = new Date(),
): Promise<StaffDashboardMetrics> {
  const db = await getDb();
  const today = easternToday(now);
  const inviteNow = now;

  const [roleRows, staffInvites, roleInvites, classRows, assignmentRows, sessionRows] =
    await Promise.all([
      db
        .select({ userId: userRoles.userId, role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.schoolId, schoolId)),
      db
        .select({ email: staffInvitations.email })
        .from(staffInvitations)
        .where(
          and(
            eq(staffInvitations.schoolId, schoolId),
            eq(staffInvitations.status, 'pending'),
            gt(staffInvitations.expiresAt, inviteNow),
          ),
        ),
      db
        .select({ email: roleInvitations.email })
        .from(roleInvitations)
        .where(
          and(
            eq(roleInvitations.schoolId, schoolId),
            eq(roleInvitations.isActive, true),
            sql`${roleInvitations.usedAt} IS NULL`,
            gt(roleInvitations.expiresAt, inviteNow),
          ),
        ),
      db
        .select({
          id: classes.id,
          status: classes.status,
          endDate: classes.endDate,
          sessionId: classes.sessionId,
          instructorId: classes.instructorId,
        })
        .from(classes)
        .where(eq(classes.schoolId, schoolId)),
      db
        .select({
          educatorId: educatorClassAssignments.educatorId,
          classId: educatorClassAssignments.classId,
          validTo: educatorClassAssignments.validTo,
        })
        .from(educatorClassAssignments)
        .where(eq(educatorClassAssignments.schoolId, schoolId)),
      loadSessions(schoolId),
    ]);

  const currentIds = new Set(selectCurrentSessions(sessionRows, today).map((s) => s.id));
  const staffClasses = rowsOf<ClassSessionRow>(classRows);
  const activeIds = new Set(
    staffClasses
      .filter((cls) =>
        isDashboardActiveClass(
          {
            id: cls.id,
            status: cls.status,
            endDate: toSessionIso(cls.endDate),
            sessionId: cls.sessionId,
          },
          currentIds,
          today,
        ),
      )
      .map((cls) => cls.id),
  );

  const assignedUserIds: number[] = [];
  for (const cls of staffClasses) {
    if (!activeIds.has(cls.id) || cls.instructorId == null) continue;
    assignedUserIds.push(cls.instructorId);
  }
  for (const assignment of assignmentRows) {
    if (!activeIds.has(assignment.classId)) continue;
    const validTo = toSessionIso(assignment.validTo);
    if (validTo != null && validTo < today) continue;
    assignedUserIds.push(assignment.educatorId);
  }

  return buildStaffMetrics({
    roles: roleRows,
    pendingInviteEmails: [...staffInvites, ...roleInvites].map((row) => row.email),
    assignedUserIds,
  });
}

export async function loadFinancialDashboardMetrics(
  schoolId: number,
  locationIds: number[] | null,
  now = new Date(),
): Promise<FinancialDashboardMetrics> {
  const db = await getDb();
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const classRows = await db
    .select({ id: classes.id, locationId: classes.locationId })
    .from(classes)
    .where(eq(classes.schoolId, schoolId));
  const classLocationById = new Map<number, number | null>(
    rowsOf<{ id: number; locationId: number | null }>(classRows).map((cls) => [cls.id, cls.locationId]),
  );

  const owingRows = await db
    .select({
      id: programEnrollments.id,
      parentEmail: programEnrollments.parentEmail,
      locationId: programEnrollments.locationId,
      marketplaceClassId: programEnrollments.marketplaceClassId,
      classId: programEnrollments.classId,
      outstandingCents: sqlEnrollmentEffectiveBalanceColumn(),
    })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.schoolId, schoolId),
        inArray(programEnrollments.status, [
          'pending_payment',
          'pending_admin_approval',
          'enrolled',
        ]),
        sqlEnrollmentEffectiveBalancePositive(),
      ),
    );

  const scopedOwing = rowsOf<OwingRow>(owingRows).filter((row) => {
    const linkedId = row.marketplaceClassId ?? row.classId;
    return enrollmentInLocationScope(
      {
        locationId: row.locationId,
        classLocationId: linkedId != null ? classLocationById.get(linkedId) ?? null : null,
      },
      locationIds,
    );
  });

  let outstandingCents = scopedOwing.reduce(
    (sum, row) => sum + (Number(row.outstandingCents) || 0),
    0,
  );
  const unpaidEmails = new Set(
    scopedOwing
      .map((row) => row.parentEmail.trim().toLowerCase())
      .filter(Boolean),
  );

  if (locationIds == null) {
    const membershipRows = await db
      .select({
        email: users.email,
        balanceDue: membershipEnrollments.balanceDue,
        remainingBalance: membershipEnrollments.remainingBalance,
      })
      .from(membershipEnrollments)
      .innerJoin(users, eq(users.id, membershipEnrollments.parentUserId))
      .where(
        and(
          eq(membershipEnrollments.schoolId, schoolId),
          inArray(membershipEnrollments.status, [...MEMBERSHIP_OWED]),
          sql`GREATEST(COALESCE(${membershipEnrollments.balanceDue}, 0), COALESCE(${membershipEnrollments.remainingBalance}, 0)) > 0`,
        ),
      );
    for (const row of membershipRows) {
      const owed = Math.max(Number(row.balanceDue ?? 0), Number(row.remainingBalance ?? 0));
      if (owed <= 0) continue;
      outstandingCents += owed;
      const email = row.email.trim().toLowerCase();
      if (email) unpaidEmails.add(email);
    }
  }

  const paymentRows = await db
    .select({
      amount: payments.amount,
      paymentDate: payments.paymentDate,
      createdAt: payments.createdAt,
      enrollmentIds: payments.enrollmentIds,
    })
    .from(payments)
    .where(
      and(
        eq(payments.schoolId, schoolId),
        gt(payments.amount, 0),
        sql`${payments.status} IN ('completed', 'succeeded')`,
      ),
    );

  let scopedEnrollmentIds: Set<number> | null = null;
  if (locationIds != null) {
    const scopeRows = await db
      .select({
        id: programEnrollments.id,
        locationId: programEnrollments.locationId,
        marketplaceClassId: programEnrollments.marketplaceClassId,
        classId: programEnrollments.classId,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.schoolId, schoolId));
    scopedEnrollmentIds = new Set(
      rowsOf<{
        id: number;
        locationId: number | null;
        marketplaceClassId: number | null;
        classId: number | null;
      }>(scopeRows)
        .filter((row) => {
          const linkedId = row.marketplaceClassId ?? row.classId;
          return enrollmentInLocationScope(
            {
              locationId: row.locationId,
              classLocationId: linkedId != null ? classLocationById.get(linkedId) ?? null : null,
            },
            locationIds,
          );
        })
        .map((row) => row.id),
    );
  }

  let collectedCents = 0;
  let monthlyCollectedCents = 0;
  for (const payment of paymentRows) {
    const ids = Array.isArray(payment.enrollmentIds) ? payment.enrollmentIds.map(Number) : [];
    if (!paymentInLocationScope(ids, scopedEnrollmentIds)) continue;
    const amount = Number(payment.amount) || 0;
    collectedCents += amount;
    const when = payment.paymentDate ?? payment.createdAt;
    if (when && new Date(when) >= monthStart) monthlyCollectedCents += amount;
  }

  const billableWhere = [
    eq(programEnrollments.schoolId, schoolId),
    sql`${programEnrollments.status} NOT IN ('cancelled', 'withdrawn', 'failed')`,
    sql`${programEnrollments.totalCost} > 0`,
  ];
  const [billable] = await db
    .select({
      paid: sql<number>`COALESCE(SUM(${programEnrollments.totalPaid}), 0)::integer`,
      n: sql<number>`COUNT(*)::integer`,
    })
    .from(programEnrollments)
    .where(and(...billableWhere));

  return buildFinancialMetrics({
    collectedCents,
    monthlyCollectedCents,
    outstandingCents,
    unpaidFamilies: unpaidEmails.size,
    tuitionPaidCents: Number(billable?.paid) || 0,
    billableEnrollments: Number(billable?.n) || 0,
  });
}
