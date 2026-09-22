import { addDays, format } from "date-fns";

export type ClassDayEvent = {
  id: string;
  title: string;
  date: string;
  childName?: string;
  /** `/api/schedule` type. `class` is a recurring meeting and stays off Home. */
  type?: string;
};

export type SchoolCalendarEvent = {
  id: number;
  title: string;
  startDate: string;
};

export type UpcomingPreviewItem = {
  id: string;
  title: string;
  date: string;
  subtitle?: string;
};

export function next7DayWindow(now = new Date()): { today: string; weekOut: string } {
  return {
    today: format(now, "yyyy-MM-dd"),
    weekOut: format(addDays(now, 7), "yyyy-MM-dd"),
  };
}

function inWindow(date: string, today: string, weekOut: string): boolean {
  return date >= today && date <= weekOut;
}

function previewSubtitle(childName?: string): string | undefined {
  if (!childName || childName === "All families") return undefined;
  return childName;
}

/** School activities in the next 7 days. Recurring class meetings stay on `/schedule`. */
export function mergeUpcomingEventsNext7Days(
  classDays: ClassDayEvent[],
  schoolEvents: SchoolCalendarEvent[],
  now = new Date(),
): UpcomingPreviewItem[] {
  const { today, weekOut } = next7DayWindow(now);
  const classMap = new Map<string, UpcomingPreviewItem>();

  for (const event of classDays) {
    if (event.type === "class") continue;
    if (!inWindow(event.date, today, weekOut)) continue;
    const key = `${event.date}|${event.title}`;
    const existing = classMap.get(key);
    const subtitle = previewSubtitle(event.childName);
    if (existing) {
      if (subtitle && existing.subtitle) {
        const names = existing.subtitle.split(", ");
        if (!names.includes(subtitle)) {
          existing.subtitle = `${existing.subtitle}, ${subtitle}`;
        }
      } else if (subtitle && !existing.subtitle) {
        existing.subtitle = subtitle;
      }
      continue;
    }
    classMap.set(key, {
      id: event.id,
      title: event.title,
      date: event.date,
      subtitle,
    });
  }

  const schoolItems: UpcomingPreviewItem[] = [];
  for (const event of schoolEvents) {
    const date = format(new Date(event.startDate), "yyyy-MM-dd");
    if (!inWindow(date, today, weekOut)) continue;
    const key = `${date}|${event.title}`;
    if (classMap.has(key)) continue;
    schoolItems.push({
      id: `school-${event.id}`,
      title: event.title,
      date,
    });
  }

  return [...classMap.values(), ...schoolItems].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.title.localeCompare(b.title);
  });
}
