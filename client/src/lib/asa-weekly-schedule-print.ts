/** Shared ASA weekly-schedule print helpers (staff Schedule + school-admin Week Planner). */

export const SKELETON_DAY_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** ASA print sheet day-header palette (Mon / Wed / Fri style). */
export const PRINT_DAY_HEADERS = [
  { background: "#C02D2E", color: "#ffffff" },
  { background: "#ffffff", color: "#111111" },
  { background: "#004B87", color: "#ffffff" },
] as const;

export type AsaPrintBlock = {
  title: string;
  objectives?: string[] | null;
  lessonLink?: string | null;
};

export type AsaPrintColumn = {
  dayName: string;
  blocksByTime: Map<string, AsaPrintBlock>;
};

/** Normalize to HH:MM 24h for sorting / row keys. */
export function toTimeKey(timeStr: string | undefined | null): string {
  if (!timeStr) return "";
  const trimmed = String(timeStr).trim();
  const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const period = ampm[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const m = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
}

export function formatPrintTime(timeStr: string | undefined | null): string {
  const key = toTimeKey(timeStr);
  if (!key) return timeStr?.trim() || "";
  const [h, m] = key.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function isBreakishTitle(title: string): boolean {
  return /recess|snack|break|lunch|clean\s*up|dismissal|arrival|transition/i.test(title);
}

export function shortPrintTitle(title: string | null | undefined, fallback = "Weekly Schedule"): string {
  const raw = (title || fallback).trim();
  return raw.split("|")[0]?.trim() || fallback;
}

/** Staff-style "Sep 14 - Sep 20, 2026" from a Monday weekStart (noon local, no UTC shift). */
export function formatWeekOfRange(weekStartDate: string | null | undefined): string {
  if (!weekStartDate) return "";
  const start = new Date(weekStartDate + "T12:00:00");
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function collectPrintTimeKeys(columns: AsaPrintColumn[]): string[] {
  return Array.from(new Set(columns.flatMap((col) => Array.from(col.blocksByTime.keys())))).sort();
}

export type WeekPlanPrintSlot = {
  startTime: string;
  title: string;
  objectives?: unknown;
  lessonLink?: string | null;
};

export type WeekPlanPrintDay = {
  dayOfWeek: number;
  slots: WeekPlanPrintSlot[];
};

function asStringObjectives(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/** Build teaching-day columns from Week Planner skeleton + plan slots (Sunday = 0). */
export function buildAsaPrintColumnsFromWeekPlan(days: WeekPlanPrintDay[]): AsaPrintColumn[] {
  return [...days]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((day) => {
      const blocksByTime = new Map<string, AsaPrintBlock>();
      for (const slot of day.slots) {
        const key = toTimeKey(slot.startTime);
        if (!key || blocksByTime.has(key)) continue;
        const title = (slot.title || "").trim();
        if (!title) continue;
        blocksByTime.set(key, {
          title,
          objectives: asStringObjectives(slot.objectives),
          lessonLink: slot.lessonLink ?? null,
        });
      }
      return {
        dayName: SKELETON_DAY_NAMES[day.dayOfWeek] || `Day ${day.dayOfWeek}`,
        blocksByTime,
      };
    })
    .filter((col) => col.blocksByTime.size > 0);
}
