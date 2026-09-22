import { mergeUpcomingEventsNext7Days } from "../parent-upcoming-events";

const now = new Date(2026, 8, 22, 9, 0, 0);

function noonIso(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

describe("mergeUpcomingEventsNext7Days", () => {
  it("leaves recurring class meetings off the home list", () => {
    const items = mergeUpcomingEventsNext7Days(
      [
        {
          id: "class-1",
          title: "Pioneers & Patriots | Brighton | F2026",
          date: "2026-09-23",
          childName: "Hermione Brown",
          type: "class",
        },
        {
          id: "class-2",
          title: "Yankee Doodle | Brighton | F2026",
          date: "2026-09-23",
          childName: "Adaluna Brown",
          type: "class",
        },
        {
          id: "outing-schedule",
          title: "Fisher’s Fruit Farm",
          date: "2026-09-27",
          childName: "All families",
          type: "field-trip",
        },
      ],
      [
        {
          id: 9,
          title: "Fisher’s Fruit Farm",
          startDate: noonIso("2026-09-27"),
        },
        {
          id: 10,
          title: "Stokoe Farms Harvest Fest",
          startDate: noonIso("2026-10-01"),
        },
      ],
      now,
    );

    expect(items.map((item) => item.title)).toEqual(["Fisher’s Fruit Farm"]);
    expect(items[0]?.subtitle).toBeUndefined();
    expect(items[0]?.id).toBe("outing-schedule");
  });

  it("keeps a school calendar event that is not already on the schedule feed", () => {
    const items = mergeUpcomingEventsNext7Days(
      [],
      [{ id: 4, title: "Open House", startDate: noonIso("2026-09-24") }],
      now,
    );

    expect(items).toEqual([
      { id: "school-4", title: "Open House", date: "2026-09-24" },
    ]);
  });
});
