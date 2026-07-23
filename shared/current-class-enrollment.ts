/**
 * Whether a program_enrollment row should appear as a "current class"
 * on parent child cards and the enrollments page.
 *
 * Session-tuition rows (no class link) are excluded — those belong under
 * session / recent enrollment, not the Class line.
 */

const CURRENT_STATUSES = new Set([
  "enrolled",
  "pending_admin_approval",
  "pending_payment",
  "waitlist",
]);

export type ClassEnrollmentLike = {
  status?: string | null;
  marketplaceClassId?: number | null;
  classId?: number | null;
  programEndDate?: Date | string | null;
  placementSource?: string | null;
};

export function enrollmentLinksToClass(e: ClassEnrollmentLike): boolean {
  return e.marketplaceClassId != null || e.classId != null;
}

/** Inclusive of end date calendar day (UTC). Missing end = still current. */
export function isClassStillCurrent(
  endDate: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (endDate == null || endDate === "") return true;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (Number.isNaN(end.getTime())) return true;
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return endUtc >= nowUtc;
}

/**
 * Current class seat: active status, linked to a class, and class/enrollment
 * end date has not passed.
 */
export function isCurrentClassEnrollment(
  enrollment: ClassEnrollmentLike,
  classEndDate?: Date | string | null,
  now: Date = new Date(),
): boolean {
  const status = String(enrollment.status ?? "").toLowerCase();
  if (!CURRENT_STATUSES.has(status)) return false;
  if (!enrollmentLinksToClass(enrollment)) return false;
  const end = enrollment.programEndDate ?? classEndDate ?? null;
  return isClassStillCurrent(end, now);
}
