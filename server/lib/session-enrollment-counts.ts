import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { programEnrollments } from "@shared/schema";
import { getDb } from "../db";

export type SessionDayTypeVariant = "half_day" | "full_day";

export type SessionVariantCounts = {
  halfDayEnrolled: number;
  fullDayEnrolled: number;
  halfDayWaitlist: number;
  fullDayWaitlist: number;
};

const EMPTY_COUNTS: SessionVariantCounts = {
  halfDayEnrolled: 0,
  fullDayEnrolled: 0,
  halfDayWaitlist: 0,
  fullDayWaitlist: 0,
};

/** Seat holders for capacity: non-cancelled rows for session + variant (matches enroll-time gate). */
export async function countSessionVariantEnrollments(
  sessionId: number,
  variant: SessionDayTypeVariant | string,
): Promise<number> {
  const db = await getDb();
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.sessionId, sessionId),
        eq(programEnrollments.variantId, variant),
        notInArray(programEnrollments.status, ["cancelled"]),
      ),
    );
  return result?.count ?? 0;
}

export async function countSessionWaitlist(
  sessionId: number,
  variant: SessionDayTypeVariant | string,
): Promise<number> {
  const db = await getDb();
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.sessionId, sessionId),
        eq(programEnrollments.variantId, variant),
        eq(programEnrollments.status, "waitlist"),
      ),
    );
  return result?.count ?? 0;
}

export async function getSessionVariantCounts(
  sessionId: number,
): Promise<SessionVariantCounts> {
  const [halfDayEnrolled, fullDayEnrolled, halfDayWaitlist, fullDayWaitlist] =
    await Promise.all([
      countSessionVariantEnrollments(sessionId, "half_day"),
      countSessionVariantEnrollments(sessionId, "full_day"),
      countSessionWaitlist(sessionId, "half_day"),
      countSessionWaitlist(sessionId, "full_day"),
    ]);
  return {
    halfDayEnrolled,
    fullDayEnrolled,
    halfDayWaitlist,
    fullDayWaitlist,
  };
}

/**
 * Batch seat + waitlist counts for many sessions (one grouped query each).
 * Missing session ids map to zeros.
 */
export async function getSessionVariantCountsForSessions(
  sessionIds: number[],
): Promise<Map<number, SessionVariantCounts>> {
  const map = new Map<number, SessionVariantCounts>();
  for (const id of sessionIds) {
    map.set(id, { ...EMPTY_COUNTS });
  }
  if (sessionIds.length === 0) return map;

  const db = await getDb();

  const seatRows = await db
    .select({
      sessionId: programEnrollments.sessionId,
      variantId: programEnrollments.variantId,
      count: sql<number>`count(*)::int`,
    })
    .from(programEnrollments)
    .where(
      and(
        inArray(programEnrollments.sessionId, sessionIds),
        notInArray(programEnrollments.status, ["cancelled"]),
      ),
    )
    .groupBy(programEnrollments.sessionId, programEnrollments.variantId);

  for (const row of seatRows) {
    if (row.sessionId == null) continue;
    const entry = map.get(row.sessionId) ?? { ...EMPTY_COUNTS };
    if (row.variantId === "half_day") entry.halfDayEnrolled = row.count ?? 0;
    if (row.variantId === "full_day") entry.fullDayEnrolled = row.count ?? 0;
    map.set(row.sessionId, entry);
  }

  const waitRows = await db
    .select({
      sessionId: programEnrollments.sessionId,
      variantId: programEnrollments.variantId,
      count: sql<number>`count(*)::int`,
    })
    .from(programEnrollments)
    .where(
      and(
        inArray(programEnrollments.sessionId, sessionIds),
        eq(programEnrollments.status, "waitlist"),
      ),
    )
    .groupBy(programEnrollments.sessionId, programEnrollments.variantId);

  for (const row of waitRows) {
    if (row.sessionId == null) continue;
    const entry = map.get(row.sessionId) ?? { ...EMPTY_COUNTS };
    if (row.variantId === "half_day") entry.halfDayWaitlist = row.count ?? 0;
    if (row.variantId === "full_day") entry.fullDayWaitlist = row.count ?? 0;
    map.set(row.sessionId, entry);
  }

  return map;
}

export function formatSessionFillSummary(input: {
  halfDayEnrolled: number;
  fullDayEnrolled: number;
  halfDayCapacity: number | null | undefined;
  fullDayCapacity: number | null | undefined;
  halfDayWaitlist?: number;
  fullDayWaitlist?: number;
}): string {
  const halfCap =
    input.halfDayCapacity != null ? String(input.halfDayCapacity) : "—";
  const fullCap =
    input.fullDayCapacity != null ? String(input.fullDayCapacity) : "—";
  let text = `${input.halfDayEnrolled}/${halfCap} half · ${input.fullDayEnrolled}/${fullCap} full`;
  const halfWl = input.halfDayWaitlist ?? 0;
  const fullWl = input.fullDayWaitlist ?? 0;
  if (halfWl > 0) text += ` · ${halfWl} half waitlist`;
  if (fullWl > 0) text += ` · ${fullWl} full waitlist`;
  return text;
}
