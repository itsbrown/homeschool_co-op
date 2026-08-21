import { addDays, format } from "date-fns";

export type ClassDayEvent = {
  id: string;
  title: string;
  date: string;
  childName?: string;
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

/** Class days + school events in the next 7 days, deduped by date+title for class rows. */
export function mergeUpcomingEventsNext7Days(
  classDays: ClassDayEvent[],
  schoolEvents: SchoolCalendarEvent[],
  now = new Date(),
): UpcomingPreviewItem[] {
  const { today, weekOut } = next7DayWindow(now);
  const classMap = new Map<string, UpcomingPreviewItem>();

  for (const event of classDays) {
    if (!inWindow(event.date, today, weekOut)) continue;
    const key = `${event.date}|${event.title}`;
    const existing = classMap.get(key);
    if (existing) {
      if (event.childName && existing.subtitle) {
        const names = existing.subtitle.split(", ");
        if (!names.includes(event.childName)) {
          existing.subtitle = `${existing.subtitle}, ${event.childName}`;
        }
      } else if (event.childName && !existing.subtitle) {
        existing.subtitle = event.childName;
      }
      continue;
    }
    classMap.set(key, {
      id: event.id,
      title: event.title,
      date: event.date,
      subtitle: event.childName,
    });
  }

  const schoolItems: UpcomingPreviewItem[] = [];
  for (const event of schoolEvents) {
    const date = format(new Date(event.startDate), "yyyy-MM-dd");
    if (!inWindow(date, today, weekOut)) continue;
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
