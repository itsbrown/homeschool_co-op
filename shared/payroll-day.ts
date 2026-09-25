/** Daily payroll checklist. Sheet hours are for the whole week; each class day is one third. */

export type PayrollPresent = "here" | "away";

export type PayrollRosterJob = {
  key: string;
  personName: string;
  jobLabel: string;
  /** Dollars per hour. */
  rateDollars: number;
  /** Usual hours for Monday + Wednesday + Friday together. */
  weeklyHours: number;
  credit: boolean;
  sortOrder: number;
};

export const PAYROLL_CHECKLIST_EMAIL = "leighannie@rochester.rr.com";

/** Week-ending 2026-09-25 dry run. Lunch/Lorraine spellings cleaned up. */
export const PAYROLL_ROSTER: PayrollRosterJob[] = [
  { key: "leigh-ann-am-pm", personName: "Leigh Ann", jobLabel: "Morning and afternoon", rateDollars: 32, weeklyHours: 30, credit: false, sortOrder: 10 },
  { key: "leigh-ann-lunch", personName: "Leigh Ann", jobLabel: "Lunch", rateDollars: 20, weeklyHours: 6, credit: false, sortOrder: 20 },
  { key: "lorraine-am-pm", personName: "Lorraine", jobLabel: "Morning and afternoon", rateDollars: 28, weeklyHours: 15, credit: false, sortOrder: 30 },
  { key: "lorraine-lunch", personName: "Lorraine", jobLabel: "Lunch", rateDollars: 20, weeklyHours: 3, credit: false, sortOrder: 40 },
  { key: "amy-morning", personName: "Amy", jobLabel: "Morning", rateDollars: 20, weeklyHours: 9, credit: true, sortOrder: 50 },
  { key: "olivia-morning", personName: "Olivia", jobLabel: "Morning", rateDollars: 20, weeklyHours: 6, credit: true, sortOrder: 60 },
  { key: "denise-morning", personName: "Denise", jobLabel: "Morning", rateDollars: 20, weeklyHours: 3, credit: true, sortOrder: 70 },
  { key: "angie-morning", personName: "Angie", jobLabel: "Morning", rateDollars: 20, weeklyHours: 9, credit: true, sortOrder: 80 },
  { key: "janet-morning", personName: "Janet", jobLabel: "Morning", rateDollars: 28, weeklyHours: 18, credit: false, sortOrder: 90 },
  { key: "janet-lunch-pm", personName: "Janet", jobLabel: "Lunch and afternoon", rateDollars: 20, weeklyHours: 9, credit: false, sortOrder: 100 },
  { key: "kari-morning", personName: "Kari", jobLabel: "Morning", rateDollars: 22, weeklyHours: 18, credit: true, sortOrder: 110 },
  { key: "kim-morning", personName: "Kim DeRosa", jobLabel: "Morning", rateDollars: 20, weeklyHours: 6, credit: false, sortOrder: 120 },
  { key: "kim-am-pm", personName: "Kim DeRosa", jobLabel: "Morning and afternoon", rateDollars: 28, weeklyHours: 15, credit: false, sortOrder: 130 },
  { key: "kim-lunch", personName: "Kim DeRosa", jobLabel: "Lunch", rateDollars: 20, weeklyHours: 6, credit: false, sortOrder: 140 },
  { key: "zoriana-cleaning", personName: "Zoriana", jobLabel: "Cleaning", rateDollars: 30, weeklyHours: 3, credit: true, sortOrder: 150 },
  { key: "neyoka-cleaning", personName: "Neyoka", jobLabel: "Cleaning", rateDollars: 30, weeklyHours: 3, credit: false, sortOrder: 160 },
  { key: "summer-am-pm", personName: "Summer", jobLabel: "Morning and afternoon", rateDollars: 28, weeklyHours: 28, credit: false, sortOrder: 170 },
  { key: "summer-aide", personName: "Summer", jobLabel: "Aide", rateDollars: 20, weeklyHours: 8, credit: false, sortOrder: 180 },
  { key: "michelle-morning", personName: "Michelle", jobLabel: "Morning", rateDollars: 28, weeklyHours: 30, credit: false, sortOrder: 190 },
  { key: "michelle-afternoon", personName: "Michelle", jobLabel: "Afternoon", rateDollars: 20, weeklyHours: 6, credit: false, sortOrder: 200 },
  { key: "chelsey-morning", personName: "Chelsey", jobLabel: "Morning", rateDollars: 32, weeklyHours: 18, credit: false, sortOrder: 210 },
];

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

export function rosterWeekTotals(): { minutes: number; payCents: number } {
  let minutes = 0;
  let cents = 0;
  for (const job of PAYROLL_ROSTER) {
    const mins = hoursToMinutes(job.weeklyHours);
    minutes += mins;
    cents += payCents(mins, job.rateDollars * 100);
  }
  return { minutes, payCents: cents };
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
