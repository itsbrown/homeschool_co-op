import { storage } from "../storage";
import {
  dayTypeForChild,
  type RosterDayType,
  type SessionTuitionLike,
} from "@shared/roster-day-type";

/**
 * Load session-tuition enrollments for children and resolve half/full day
 * per row. Class roster seats themselves do not store day type.
 */
export async function attachRosterDayTypes<T extends { childId: number }>(
  rows: T[],
  sessionIdFor: (row: T) => number | null | undefined,
): Promise<Array<T & { dayType: RosterDayType | null }>> {
  const childIds = [
    ...new Set(
      rows
        .map((row) => row.childId)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (childIds.length === 0) {
    return rows.map((row) => ({ ...row, dayType: null }));
  }

  const enrollments = (await storage.getEnrollmentsByChildIds(
    childIds,
  )) as SessionTuitionLike[];

  return rows.map((row) => ({
    ...row,
    dayType: dayTypeForChild(enrollments, row.childId, sessionIdFor(row)),
  }));
}
