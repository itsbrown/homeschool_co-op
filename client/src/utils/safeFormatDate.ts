import { format } from 'date-fns';

/** Format a date for display; invalid/missing values show a dash instead of crashing. */
export function safeFormatDate(
  value: string | Date | number | null | undefined,
  formatStr: string,
  fallback = '—',
): string {
  if (value == null || value === '') return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return format(d, formatStr);
}
