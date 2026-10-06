/**
 * School wall-clock times.
 *
 * The production server runs in UTC. `new Date("2026-10-12T11:00")` and
 * `new Date("2026-10-13")` are therefore not Eastern Time: a datetime without
 * an offset is the server's local time, and a date-only string is UTC midnight
 * (the previous evening in America/New_York).
 *
 * Admins type times and calendar dates in the school's zone. Callers that
 * persist those values must use these helpers. Instants that already include
 * `Z` or a numeric offset are left alone.
 */
export const DEFAULT_SCHOOL_TIMEZONE = "America/New_York";

const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Missing ${type} in timezone parts`);
  return value;
}

/** Milliseconds to add to a UTC timestamp to get the same clock reading in `timeZone`. */
function tzOffsetMs(timeZone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  let hour = Number(readPart(parts, "hour"));
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(readPart(parts, "year")),
    Number(readPart(parts, "month")) - 1,
    Number(readPart(parts, "day")),
    hour,
    Number(readPart(parts, "minute")),
    Number(readPart(parts, "second")),
  );
  return asUtc - utcMs;
}

export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = tzOffsetMs(timeZone, utcGuess);
  let instant = utcGuess - offset;
  const offset2 = tzOffsetMs(timeZone, instant);
  if (offset2 !== offset) {
    instant = utcGuess - offset2;
  }
  return new Date(instant + millisecond);
}

function wallMatchToUtc(match: RegExpExecArray, timeZone: string): Date {
  const fraction = match[7] ? match[7].padEnd(3, "0").slice(0, 3) : "0";
  return zonedWallTimeToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] ? Number(match[4]) : 0,
    match[5] ? Number(match[5]) : 0,
    match[6] ? Number(match[6]) : 0,
    Number(fraction),
    timeZone,
  );
}

/**
 * Parse an admin-entered event or schedule time.
 * `2026-10-12T11:00` is 11:00 in the school timezone.
 * `2026-10-12T15:00:00.000Z` stays that exact instant.
 */
export function parseSchoolWallTime(
  input: string | Date,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE,
): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error("Invalid date");
    return input;
  }
  const raw = String(input).trim();
  if (!raw) throw new Error("Empty date");
  if (HAS_OFFSET.test(raw)) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
    return parsed;
  }
  const match = WALL_DATE_TIME.exec(raw);
  if (!match) throw new Error("Invalid date");
  return wallMatchToUtc(match, timeZone);
}

/**
 * A document expiry date is the calendar day the admin picked.
 * Parents keep the file through the end of that day in the school timezone.
 * Full timestamps (with an offset, or a time component) are parsed as instants
 * so previously stored values are not rewritten.
 */
export function parseDocumentExpiry(
  input: string | Date,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE,
): Date {
  if (typeof input === "string") {
    const raw = input.trim();
    const dateOnly = DATE_ONLY.exec(raw);
    if (dateOnly) {
      return zonedWallTimeToUtc(
        Number(dateOnly[1]),
        Number(dateOnly[2]),
        Number(dateOnly[3]),
        23,
        59,
        59,
        999,
        timeZone,
      );
    }
  }
  return parseSchoolWallTime(input, timeZone);
}

/**
 * Send now unless the row is still queued for a future school-time instant.
 * Rows already claimed by the delivery job (`sending`) always proceed.
 */
export function shouldDeliverNotification(
  notification: { status?: string | null; scheduledFor?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (notification.status === "sending") return true;
  return !isFutureSchedule(notification.scheduledFor, now);
}

/** True when `when` is strictly after `now`. Blank or invalid values send immediately. */
export function isFutureSchedule(
  when: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (when == null || when === "") return false;
  const date = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > now.getTime();
}

/** Hidden once the stored expiry instant has passed. Null expiry never expires. */
export function isDocumentExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (expiresAt == null || expiresAt === "") return false;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() < now.getTime();
}

function zonedParts(value: Date | string, timeZone: string): Intl.DateTimeFormatPart[] {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
}

/** Value for `<input type="datetime-local">` in the school timezone. */
export function formatSchoolWallTimeLocal(
  value: Date | string,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE,
): string {
  const parts = zonedParts(value, timeZone);
  let hour = readPart(parts, "hour");
  if (hour === "24") hour = "00";
  return `${readPart(parts, "year")}-${readPart(parts, "month")}-${readPart(parts, "day")}T${hour}:${readPart(parts, "minute")}`;
}

/** `Oct 13, 2026` in the school timezone (not the browser's zone). */
export function formatSchoolCalendarDate(
  value: Date | string,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** `October 12, 2026` in the school timezone. */
export function formatSchoolLongDate(
  value: Date | string,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** `Oct 12, 2026, 11:00 AM EDT` in the school timezone. */
export function formatSchoolDateTime(
  value: Date | string,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
