import { toDateInputValue } from "./grade-levels";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function birthdateYmd(
  value: string | Date | null | undefined,
): string {
  return toDateInputValue(value);
}

export function parseBirthdateParts(
  value: string | Date | null | undefined,
): { year: number; month: number; day: number } | null {
  const ymd = birthdateYmd(value);
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map((n) => parseInt(n, 10));
  if (!year || !month || !day) return null;
  return { year, month, day };
}

/** "Jun 1, 2015" — calendar date, no UTC shift on YYYY-MM-DD. */
export function formatBirthdayDisplay(
  value: string | Date | null | undefined,
): string {
  const parts = parseBirthdateParts(value);
  if (!parts) return "";
  return `${MONTH_SHORT[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

export function ageFromBirthdate(
  value: string | Date | null | undefined,
  asOf: Date = new Date(),
): number | null {
  const parts = parseBirthdateParts(value);
  if (!parts) return null;
  let age = asOf.getFullYear() - parts.year;
  const month = asOf.getMonth() + 1;
  const day = asOf.getDate();
  if (month < parts.month || (month === parts.month && day < parts.day)) {
    age -= 1;
  }
  return age < 0 ? 0 : age;
}
