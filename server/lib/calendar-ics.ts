export type IcsEventInput = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  isAllDay?: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatIcsDate(date: Date, isAllDay: boolean): string {
  if (isAllDay) {
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  }
  return (
    date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
  );
}

/** RFC 5545: all-day DTEND is exclusive (the day after the last included date). */
function formatIcsExclusiveAllDayEnd(end: Date): string {
  const next = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1));
  return formatIcsDate(next, true);
}

function escapeIcs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

export function buildIcsCalendar(calendarName: string, events: IcsEventInput[]): string {
  const dtstamp = formatIcsDate(new Date(), false);
  const vevents = events.map((event) => {
    const allDay = Boolean(event.isAllDay);
    return [
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.uid)}`,
      `DTSTAMP:${dtstamp}`,
      allDay
        ? `DTSTART;VALUE=DATE:${formatIcsDate(event.start, true)}`
        : `DTSTART:${formatIcsDate(event.start, false)}`,
      allDay
        ? `DTEND;VALUE=DATE:${formatIcsExclusiveAllDayEnd(event.end)}`
        : `DTEND:${formatIcsDate(event.end, false)}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : "",
      event.location ? `LOCATION:${escapeIcs(event.location)}` : "",
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ASA Learning Platform//Calendar//EN",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function isEventVisibleToCampuses(
  event: { locationId?: number | null },
  campusIds: number[],
): boolean {
  if (event.locationId == null) return true;
  return campusIds.includes(event.locationId);
}

export function filterEventsForCampuses<T extends { locationId?: number | null }>(
  schoolEvents: T[],
  campusIds: number[],
): T[] {
  return schoolEvents.filter((event) => isEventVisibleToCampuses(event, campusIds));
}
