import type { EnrollmentSession } from "@shared/schema";

/** Earliest open session by start date (API should already sort; this is defensive). */
export function getNextOpenSessionByStartDate(
  sessions: Pick<EnrollmentSession, "id" | "name" | "startDate">[],
): Pick<EnrollmentSession, "id" | "name" | "startDate"> | null {
  if (sessions.length === 0) return null;

  const sorted = [...sessions].sort((a, b) => {
    const aTime = new Date(`${a.startDate}T00:00:00`).getTime();
    const bTime = new Date(`${b.startDate}T00:00:00`).getTime();
    return aTime - bTime;
  });

  return sorted[0] ?? null;
}

/** e.g. "Fall 2026" → "Sign up for Fall 2026 Session" */
export function formatSessionSignupCta(sessionName: string): string {
  const trimmed = sessionName.trim();
  const label = /session$/i.test(trimmed) ? trimmed : `${trimmed} Session`;
  return `Sign up for ${label}`;
}

export function formatSessionStartDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
