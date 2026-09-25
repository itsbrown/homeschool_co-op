/** Daily payroll checklist. Sheet hours are for the whole week; each class day is one third. */

export type PayrollPresent = "here" | "away";

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

/** Monday=1, Wednesday=3, Friday=5. Friday keeps any leftover minute so three days sum to the week. */
export function dayShareMinutes(weeklyMinutes: number, weekday: number): number {
  const base = Math.floor(weeklyMinutes / 3);
  const remainder = weeklyMinutes - base * 3;
  return weekday === 5 ? base + remainder : base;
}

export function paidMinutes(args: {
  weeklyMinutes: number;
  weekday: number;
  present: PayrollPresent;
  differentMinutes: number | null;
}): number {
  if (args.differentMinutes != null) return args.differentMinutes;
  if (args.present === "away") return 0;
  return dayShareMinutes(args.weeklyMinutes, args.weekday);
}

/** rateCents is dollars-per-hour in cents ($32 → 3200). */
export function payCents(paidMins: number, rateCents: number): number {
  return Math.round((paidMins * rateCents) / 60);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

export function weekdayOf(iso: string): number {
  return parseIsoDate(iso).getUTCDay();
}

export function isClassDay(iso: string): boolean {
  const day = weekdayOf(iso);
  return day === 1 || day === 3 || day === 5;
}

/** The class day itself, or the next Monday, Wednesday, or Friday. */
export function classDayOnOrAfter(iso: string): string {
  let cursor = parseIsoDate(iso);
  for (let i = 0; i < 7; i++) {
    const next = isoDate(cursor);
    if (isClassDay(next)) return next;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return iso;
}

export function shiftClassDay(iso: string, direction: -1 | 1): string {
  let cursor = parseIsoDate(iso);
  for (let i = 0; i < 7; i++) {
    cursor = new Date(cursor.getTime() + direction * 24 * 60 * 60 * 1000);
    const next = isoDate(cursor);
    if (isClassDay(next)) return next;
  }
  return iso;
}

export function formatClassDay(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function groupByPerson<T extends { personName: string }>(rows: T[]): { personName: string; jobs: T[] }[] {
  const groups: { personName: string; jobs: T[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.personName === row.personName) last.jobs.push(row);
    else groups.push({ personName: row.personName, jobs: [row] });
  }
  return groups;
}
