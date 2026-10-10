import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../../db";
import {
  children,
  childGuardians,
  classes,
  locations,
  programEnrollments,
  schools,
  users,
  weekPlanBlocks,
} from "@shared/schema";
import { getPublishedWeekPlansForClassIds } from "../../lib/schedule-builder-db";
import { assertParentUserId } from "./guardrails";

export type FamilyChild = {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  campus: string | null;
  enrollments: Array<{ status: string; className: string }>;
};

export type FamilySnapshot = {
  ok: true;
  parent: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    schoolName: string | null;
    campus: string | null;
  };
  children: FamilyChild[];
};

type ChildRow = {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  schoolId: number | null;
  locationId: number | null;
};

function mondayWeekStart(from = new Date()): string {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function resolveWeekStart(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return mondayWeekStart();
}

async function loadParent(userId: number) {
  const db = await getDb();
  const [parent] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      schoolId: users.schoolId,
      locationId: users.locationId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return parent ?? null;
}

async function loadFamilyChildren(userId: number): Promise<ChildRow[]> {
  const db = await getDb();
  const guardianLinks = await db
    .select({ childId: childGuardians.childId })
    .from(childGuardians)
    .where(eq(childGuardians.guardianUserId, userId));
  const guardianChildIds = guardianLinks.map((row) => row.childId);
  const childFilter = guardianChildIds.length
    ? or(eq(children.parentId, userId), inArray(children.id, guardianChildIds))
    : eq(children.parentId, userId);

  return db
    .select({
      id: children.id,
      firstName: children.firstName,
      lastName: children.lastName,
      gradeLevel: children.gradeLevel,
      schoolId: children.schoolId,
      locationId: children.locationId,
    })
    .from(children)
    .where(childFilter!);
}

function narrowToRequestedChild(rows: ChildRow[], requestedChildId?: number): ChildRow[] {
  if (requestedChildId == null) return rows;
  const match = rows.filter((row) => row.id === requestedChildId);
  return match.length > 0 ? match : rows;
}

async function campusNames(locationIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (locationIds.length === 0) return map;
  const db = await getDb();
  const rows = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(inArray(locations.id, locationIds));
  for (const row of rows) map.set(row.id, row.name);
  return map;
}

export async function getMyFamily(userId: number, requestedChildId?: number): Promise<FamilySnapshot | { ok: false; error: string }> {
  const id = assertParentUserId(userId);
  const parent = await loadParent(id);
  if (!parent) return { ok: false, error: "Parent account was not found." };

  const db = await getDb();
  let schoolName: string | null = null;
  if (parent.schoolId != null) {
    const [school] = await db
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, parent.schoolId))
      .limit(1);
    schoolName = school?.name ?? null;
  }

  const childRows = narrowToRequestedChild(await loadFamilyChildren(id), requestedChildId);
  const locationIds = [
    ...childRows.map((row) => row.locationId),
    parent.locationId,
  ].filter((value): value is number => value != null);
  const campuses = await campusNames(locationIds);

  const childIds = childRows.map((row) => row.id);
  const enrollmentRows = childIds.length
    ? await db
        .select({
          childId: programEnrollments.childId,
          status: programEnrollments.status,
          className: programEnrollments.className,
        })
        .from(programEnrollments)
        .where(inArray(programEnrollments.childId, childIds))
    : [];

  return {
    ok: true,
    parent: {
      id: parent.id,
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      schoolName,
      campus: parent.locationId != null ? campuses.get(parent.locationId) ?? null : null,
    },
    children: childRows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      gradeLevel: row.gradeLevel,
      campus: row.locationId != null ? campuses.get(row.locationId) ?? null : null,
      enrollments: enrollmentRows
        .filter((enrollment) => enrollment.childId === row.id)
        .map((enrollment) => ({ status: enrollment.status, className: enrollment.className })),
    })),
  };
}

type BlockQuote = {
  title: string | null;
  description: string | null;
  objectives: unknown;
  materials: string[] | null;
  homework: string | null;
  lessonLink: string | null;
};

export async function getWeekMaterials(
  userId: number,
  input: { weekStart?: string; childId?: number },
): Promise<
  | {
      ok: true;
      weekStart: string;
      children: Array<{
        childId: number;
        childFirstName: string;
        childLastName: string;
        classId: number;
        classTitle: string;
        blocks: BlockQuote[];
      }>;
    }
  | { ok: false; error: string }
> {
  const id = assertParentUserId(userId);
  const parent = await loadParent(id);
  if (!parent) return { ok: false, error: "Parent account was not found." };

  const weekStart = resolveWeekStart(input.weekStart);
  const childRows = narrowToRequestedChild(await loadFamilyChildren(id), input.childId);
  const childIds = childRows.map((row) => row.id);
  if (childIds.length === 0) return { ok: true, weekStart, children: [] };

  const db = await getDb();
  const enrollmentRows = await db
    .select({
      childId: programEnrollments.childId,
      status: programEnrollments.status,
      classId: programEnrollments.classId,
      marketplaceClassId: programEnrollments.marketplaceClassId,
      schoolId: programEnrollments.schoolId,
    })
    .from(programEnrollments)
    .where(and(inArray(programEnrollments.childId, childIds), eq(programEnrollments.status, "enrolled")));

  const pairs: Array<{ childId: number; classId: number; schoolId: number }> = [];
  const seen = new Set<string>();
  for (const enrollment of enrollmentRows) {
    const classId = enrollment.marketplaceClassId ?? enrollment.classId;
    if (classId == null) continue;
    const key = `${enrollment.childId}:${classId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ childId: enrollment.childId, classId, schoolId: enrollment.schoolId });
  }

  const schoolIds = new Set<number>();
  if (parent.schoolId != null) schoolIds.add(parent.schoolId);
  for (const pair of pairs) schoolIds.add(pair.schoolId);

  const classIds = Array.from(new Set(pairs.map((pair) => pair.classId)));
  const plans = [];
  for (const schoolId of schoolIds) {
    const rows = await getPublishedWeekPlansForClassIds(schoolId, classIds, weekStart);
    plans.push(...rows);
  }
  const planByClass = new Map<number, (typeof plans)[number]>();
  for (const plan of plans) {
    if (plan.classId != null && !planByClass.has(plan.classId)) planByClass.set(plan.classId, plan);
  }

  const blocksByPlan = new Map<number, BlockQuote[]>();
  const childrenOut = [];
  for (const pair of pairs) {
    const plan = planByClass.get(pair.classId);
    const child = childRows.find((row) => row.id === pair.childId);
    if (!child) continue;
    let blocks: BlockQuote[] = [];
    if (plan) {
      if (!blocksByPlan.has(plan.id)) {
        const rows = await db
          .select({
            title: weekPlanBlocks.title,
            customTitle: weekPlanBlocks.customTitle,
            description: weekPlanBlocks.description,
            customDescription: weekPlanBlocks.customDescription,
            objectives: weekPlanBlocks.objectives,
            materials: weekPlanBlocks.materials,
            homework: weekPlanBlocks.homework,
            lessonLink: weekPlanBlocks.lessonLink,
          })
          .from(weekPlanBlocks)
          .where(eq(weekPlanBlocks.weekPlanId, plan.id));
        blocksByPlan.set(
          plan.id,
          rows.map((row) => ({
            title: row.title ?? row.customTitle,
            description: row.description ?? row.customDescription,
            objectives: row.objectives ?? [],
            materials: row.materials,
            homework: row.homework,
            lessonLink: row.lessonLink,
          })),
        );
      }
      blocks = blocksByPlan.get(plan.id) ?? [];
    }

    let classTitle = plan?.classTitle || `Class ${pair.classId}`;
    if (!plan?.classTitle) {
      const [cls] = await db
        .select({ title: classes.title })
        .from(classes)
        .where(eq(classes.id, pair.classId))
        .limit(1);
      if (cls?.title) classTitle = cls.title;
    }

    childrenOut.push({
      childId: child.id,
      childFirstName: child.firstName,
      childLastName: child.lastName,
      classId: pair.classId,
      classTitle,
      blocks,
    });
  }

  return { ok: true, weekStart, children: childrenOut };
}
