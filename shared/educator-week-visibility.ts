/**
 * Mentor Schedule week inclusion.
 * A published week plan for the selected week wins over class.startDate/endDate
 * so afternoon bands (Logic Hall starts week 2 on paper) still overlay when Week 1 is published.
 */

export function educatorClassVisibleInWeek(opts: {
  classStartDate: string | null;
  classEndDate: string | null;
  weekStartDate: string;
  weekEndDate: string;
  hasPublishedPlan: boolean;
}): boolean {
  if (opts.hasPublishedPlan) return true;
  if (opts.classStartDate && opts.classStartDate > opts.weekEndDate) return false;
  if (opts.classEndDate && opts.classEndDate < opts.weekStartDate) return false;
  return true;
}

export function educatorClassDayVisible(opts: {
  classStartDate: string | null;
  classEndDate: string | null;
  calculatedDate: string;
  hasPublishedPlan: boolean;
}): boolean {
  if (opts.hasPublishedPlan) return true;
  if (opts.classStartDate && opts.calculatedDate < opts.classStartDate) return false;
  if (opts.classEndDate && opts.calculatedDate > opts.classEndDate) return false;
  return true;
}

export function sortEducatorWeekSchedules<T extends { calculatedDate?: string; startTime?: string }>(
  schedules: T[],
): T[] {
  return schedules.slice().sort((a, b) => {
    const byDate = String(a.calculatedDate || "").localeCompare(String(b.calculatedDate || ""));
    if (byDate !== 0) return byDate;
    return String(a.startTime || "").localeCompare(String(b.startTime || ""));
  });
}
