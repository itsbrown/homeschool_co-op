import { describe, expect, it } from "@jest/globals";
import { buildIcsCalendar, isEventVisibleToCampuses } from "../lib/calendar-ics";

describe("calendar ICS helper", () => {
  it("emits VCALENDAR with escaped summary", () => {
    const ics = buildIcsCalendar("ASA Family", [
      {
        uid: "class-1@asa-learning",
        title: "Seekers, Brighton",
        description: "Morning circle",
        location: "Room A",
        start: new Date("2026-08-17T13:00:00.000Z"),
        end: new Date("2026-08-17T14:00:00.000Z"),
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Seekers\\, Brighton");
    expect(ics).toContain("UID:class-1@asa-learning");
  });
});

describe("campus event visibility", () => {
  it("shows all-campus events to every family", () => {
    expect(isEventVisibleToCampuses({ locationId: null }, [10])).toBe(true);
    expect(isEventVisibleToCampuses({ locationId: undefined }, [])).toBe(true);
  });

  it("hides a campus-specific event from other campuses", () => {
    expect(isEventVisibleToCampuses({ locationId: 10 }, [20])).toBe(false);
    expect(isEventVisibleToCampuses({ locationId: 10 }, [10, 20])).toBe(true);
  });

  it("filters a mixed event list", () => {
    const events = [
      { locationId: null },
      { locationId: 10 },
      { locationId: 20 },
    ];
    const visible = events.filter((e) => isEventVisibleToCampuses(e, [10]));
    expect(visible).toEqual([{ locationId: null }, { locationId: 10 }]);
  });
});
