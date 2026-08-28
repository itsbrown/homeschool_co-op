/**
 * Session tuition day type for class rosters.
 *
 * Class seats (`marketplaceClassId` / `classId`) do not store half/full day.
 * That lives on the separate v2 session-tuition enrollment (`sessionId` set,
 * no class link). Teacher and school-admin class rosters join the two.
 */

export type RosterDayType = "half_day" | "full_day";

const INACTIVE_SESSION_STATUSES = new Set([
  "cancelled",
  "withdrawn",
  "failed",
  "completed",
]);

export type SessionTuitionLike = {
  id?: number;
  childId: number;
  sessionId?: number | null;
  classId?: number | null;
  marketplaceClassId?: number | null;
  status?: string | null;
  dayType?: string | null;
  variantId?: string | null;
  className?: string | null;
};

export function isSessionTuitionEnrollment(e: SessionTuitionLike): boolean {
  if (e.sessionId == null) return false;
  if (e.marketplaceClassId != null || e.classId != null) return false;
  const status = String(e.status ?? "").toLowerCase();
  return !INACTIVE_SESSION_STATUSES.has(status);
}

export function resolveEnrollmentDayType(e: {
  dayType?: string | null;
  variantId?: string | null;
  className?: string | null;
}): RosterDayType | null {
  if (e.dayType === "half_day" || e.dayType === "full_day") return e.dayType;
  if (e.variantId === "half_day" || e.variantId === "full_day") return e.variantId;
  const name = String(e.className || "").toLowerCase();
  if (/mon\/fri|2 full days/.test(name)) return "full_day";
  if (name.includes("half day")) return "half_day";
  if (name.includes("full day")) return "full_day";
  return null;
}

export function rosterDayTypeLabel(
  dayType: string | null | undefined,
): string {
  if (dayType === "half_day") return "Half Day";
  if (dayType === "full_day") return "Full Day";
  return "";
}

function statusRank(status: string | null | undefined): number {
  const s = String(status ?? "").toLowerCase();
  if (s === "enrolled" || s === "pending_admin_approval") return 2;
  if (s === "pending_payment" || s === "waitlist") return 1;
  return 0;
}

export function pickSessionTuitionForChild(
  enrollments: SessionTuitionLike[],
  childId: number,
  sessionId?: number | null,
): SessionTuitionLike | null {
  const candidates = enrollments.filter(
    (e) => e.childId === childId && isSessionTuitionEnrollment(e),
  );
  const scoped =
    sessionId != null
      ? candidates.filter((e) => e.sessionId === sessionId)
      : candidates;
  if (scoped.length === 0) return null;
  return [...scoped].sort((a, b) => {
    const rank = statusRank(b.status) - statusRank(a.status);
    if (rank !== 0) return rank;
    return (b.id ?? 0) - (a.id ?? 0);
  })[0];
}

export function dayTypeForChild(
  enrollments: SessionTuitionLike[],
  childId: number,
  sessionId?: number | null,
): RosterDayType | null {
  const row = pickSessionTuitionForChild(enrollments, childId, sessionId);
  return row ? resolveEnrollmentDayType(row) : null;
}

export function countRosterDayTypes(
  dayTypes: Array<RosterDayType | string | null | undefined>,
): { fullDay: number; halfDay: number; unspecified: number } {
  let fullDay = 0;
  let halfDay = 0;
  let unspecified = 0;
  for (const dt of dayTypes) {
    if (dt === "full_day") fullDay += 1;
    else if (dt === "half_day") halfDay += 1;
    else unspecified += 1;
  }
  return { fullDay, halfDay, unspecified };
}

export function formatRosterDayTypeSummary(counts: {
  fullDay: number;
  halfDay: number;
}): string {
  return `${counts.fullDay} Full Day · ${counts.halfDay} Half Day`;
}
