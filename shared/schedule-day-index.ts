/**
 * Skeleton / week-plan UI uses Sunday = 0 … Saturday = 6.
 * Educator weekly calendar uses Monday = 0 … Sunday = 6.
 */

/** Convert skeleton (Sun=0) day index → educator calendar (Mon=0). */
export function skeletonDayToEducatorDay(skeletonDayOfWeek: number): number {
  return (skeletonDayOfWeek + 6) % 7;
}

/** Convert educator calendar (Mon=0) → skeleton (Sun=0). */
export function educatorDayToSkeletonDay(educatorDayOfWeek: number): number {
  return (educatorDayOfWeek + 1) % 7;
}

/** Normalize HH:MM or HH:MM:SS for slot matching. */
export function normalizeScheduleTime(time: string | null | undefined): string {
  if (!time) return "";
  const trimmed = String(time).trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return trimmed;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export type PlanSlotMatch = {
  dayOfWeek: number; // skeleton Sun=0
  startTime: string;
  endTime: string;
};

export type ClassSlotMatch = {
  dayOfWeek: number; // educator Mon=0
  startTime: string;
  endTime: string;
  calculatedDate?: string;
};

/**
 * True when a skeleton/plan block belongs on the same calendar day as a class meeting.
 * Mentors see the full published day plan (blocks are finer-grained than class.schedule windows).
 */
export function skeletonSlotMatchesClassMeeting(
  skeleton: PlanSlotMatch,
  meeting: ClassSlotMatch,
): boolean {
  return skeletonDayToEducatorDay(skeleton.dayOfWeek) === meeting.dayOfWeek;
}

/** Stricter match: same day + identical start/end (normalized HH:MM). */
export function skeletonSlotMatchesClassMeetingExact(
  skeleton: PlanSlotMatch,
  meeting: ClassSlotMatch,
): boolean {
  if (!skeletonSlotMatchesClassMeeting(skeleton, meeting)) return false;
  return (
    normalizeScheduleTime(skeleton.startTime) === normalizeScheduleTime(meeting.startTime) &&
    normalizeScheduleTime(skeleton.endTime) === normalizeScheduleTime(meeting.endTime)
  );
}
