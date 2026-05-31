/** Session/class wall-clock times (HH:mm) stored in school local time (e.g. Eastern). */
export function formatScheduleTime(time: string | null | undefined): string {
  if (!time?.trim()) return "";

  const parts = time.trim().split(":");
  const hours = parseInt(parts[0] ?? "", 10);
  const minutes = (parts[1] ?? "00").slice(0, 2);
  if (!Number.isFinite(hours)) return time;

  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.padStart(2, "0")} ${period}`;
}

export function formatScheduleTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const startLabel = formatScheduleTime(start);
  const endLabel = formatScheduleTime(end);
  if (!startLabel && !endLabel) return "";
  if (!startLabel) return endLabel;
  if (!endLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
}
