/**
 * Build the Class: line for parent/admin child cards — current seats only.
 * Prefers Grade Placement rows; falls back to other current class enrollments.
 *
 * School-admin student list uses {@link buildCurrentClassesByChildId} (all
 * current seats, one end-date query for the batch).
 */
import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { classes } from "../../shared/schema";
import {
  isCurrentClassEnrollment,
  type ClassEnrollmentLike,
} from "../../shared/current-class-enrollment";

export type PlacedClassSummary = {
  id: number;
  title: string;
  placementSource: string | null;
  sessionId: number | null;
  locationId: number | null;
  status?: string | null;
};

type EnrollmentRow = ClassEnrollmentLike & {
  childId: number;
  className?: string | null;
  sessionId?: number | null;
  locationId?: number | null;
};

async function loadMarketplaceClassEndDates(
  marketplaceClassIds: number[],
): Promise<Map<number, Date | string | null>> {
  const map = new Map<number, Date | string | null>();
  if (marketplaceClassIds.length === 0) return map;
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: classes.id, endDate: classes.endDate })
      .from(classes)
      .where(inArray(classes.id, marketplaceClassIds));
    for (const row of rows) {
      map.set(row.id, row.endDate ?? null);
    }
  } catch {
    // Card builders still work without end dates (treat unknown as current).
  }
  return map;
}

function classKey(e: ClassEnrollmentLike): number | null {
  return e.marketplaceClassId ?? e.classId ?? null;
}

function toSummary(e: EnrollmentRow): PlacedClassSummary | null {
  const id = classKey(e);
  if (id == null) return null;
  return {
    id,
    title: e.className || "Class",
    placementSource: e.placementSource ?? null,
    sessionId: e.sessionId ?? null,
    locationId: e.locationId ?? null,
    status: e.status ?? null,
  };
}

/** Deduplicate by class id (keep first). */
function dedupeByClassId(rows: PlacedClassSummary[]): PlacedClassSummary[] {
  const seen = new Set<number>();
  const out: PlacedClassSummary[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function mapSqlEnrollmentRows(rows: any[]): EnrollmentRow[] {
  return rows.map((r) => ({
    childId: Number(r.child_id ?? r.childId),
    status: r.status ?? null,
    className: r.class_name ?? r.className ?? null,
    classId: r.class_id ?? r.classId ?? null,
    marketplaceClassId: r.marketplace_class_id ?? r.marketplaceClassId ?? null,
    programEndDate: r.program_end_date ?? r.programEndDate ?? null,
    placementSource: r.placement_source ?? r.placementSource ?? null,
    sessionId: r.session_id ?? r.sessionId ?? null,
    locationId: r.location_id ?? r.locationId ?? null,
  }));
}

/**
 * Load class-linked enrollment rows for many children without `select *`.
 * Avoids CombinedStorage mem fallback when schema drifts (e.g. missing
 * `placement_source`) and keeps the students list on Postgres truth.
 */
export async function loadClassEnrollmentRowsForChildren(
  childIds: number[],
): Promise<EnrollmentRow[]> {
  if (childIds.length === 0) return [];
  const db = await getDb();
  const idList = sql.join(
    childIds.map((id) => sql`${id}`),
    sql`, `,
  );

  try {
    const result = await db.execute(sql`
      SELECT
        child_id,
        status,
        class_name,
        class_id,
        marketplace_class_id,
        program_end_date,
        session_id,
        location_id,
        placement_source
      FROM program_enrollments
      WHERE child_id IN (${idList})
        AND (marketplace_class_id IS NOT NULL OR class_id IS NOT NULL)
    `);
    return mapSqlEnrollmentRows((result as any).rows ?? result);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (!msg.includes("placement_source")) throw err;
    const result = await db.execute(sql`
      SELECT
        child_id,
        status,
        class_name,
        class_id,
        marketplace_class_id,
        program_end_date,
        session_id,
        location_id
      FROM program_enrollments
      WHERE child_id IN (${idList})
        AND (marketplace_class_id IS NOT NULL OR class_id IS NOT NULL)
    `);
    return mapSqlEnrollmentRows((result as any).rows ?? result);
  }
}

/**
 * All current class seats per child (active status + class link + end not past).
 * Batch-friendly for school-admin student lists.
 */
export async function buildCurrentClassesByChildId(
  enrollments: EnrollmentRow[],
): Promise<Map<number, PlacedClassSummary[]>> {
  // Only look up end dates on the unified `classes` table (marketplace ids).
  // school_classes ids must not be resolved against `classes` (wrong row / end date).
  const marketplaceIds = [
    ...new Set(
      enrollments
        .map((e) => e.marketplaceClassId)
        .filter((id): id is number => id != null),
    ),
  ];
  const endByClassId = await loadMarketplaceClassEndDates(marketplaceIds);
  const byChild = new Map<number, PlacedClassSummary[]>();

  for (const e of enrollments) {
    const marketplaceEnd =
      e.marketplaceClassId != null
        ? endByClassId.get(e.marketplaceClassId)
        : null;
    if (!isCurrentClassEnrollment(e, marketplaceEnd)) {
      continue;
    }
    const summary = toSummary(e);
    if (!summary) continue;
    const list = byChild.get(e.childId) ?? [];
    list.push(summary);
    byChild.set(e.childId, list);
  }

  for (const [childId, list] of byChild) {
    byChild.set(childId, dedupeByClassId(list));
  }
  return byChild;
}

export async function buildPlacedClassesForChild(
  childId: number,
  enrollments: EnrollmentRow[],
): Promise<PlacedClassSummary[]> {
  const forChild = enrollments.filter((e) => e.childId === childId);
  const marketplaceIds = [
    ...new Set(
      forChild
        .map((e) => e.marketplaceClassId)
        .filter((id): id is number => id != null),
    ),
  ];
  const endByClassId = await loadMarketplaceClassEndDates(marketplaceIds);

  const current = forChild.filter((e) => {
    const marketplaceEnd =
      e.marketplaceClassId != null
        ? endByClassId.get(e.marketplaceClassId)
        : null;
    return isCurrentClassEnrollment(e, marketplaceEnd);
  });

  const placed = current.filter((e) => e.placementSource === "grade");
  const source =
    placed.length > 0
      ? placed
      : current.filter((e) => e.status === "enrolled").slice(0, 3);

  return source
    .map((e) => toSummary(e))
    .filter((s): s is PlacedClassSummary => s != null);
}
