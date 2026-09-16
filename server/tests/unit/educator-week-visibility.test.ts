import { describe, expect, it } from "@jest/globals";
import {
  educatorClassDayVisible,
  educatorClassVisibleInWeek,
  sortEducatorWeekSchedules,
} from "../../../shared/educator-week-visibility";

describe("educatorClassVisibleInWeek", () => {
  it("hides a class that starts after the selected week when there is no published plan", () => {
    expect(
      educatorClassVisibleInWeek({
        classStartDate: "2026-09-21",
        classEndDate: "2026-11-20",
        weekStartDate: "2026-09-14",
        weekEndDate: "2026-09-20",
        hasPublishedPlan: false,
      }),
    ).toBe(false);
  });

  it("includes a later-starting class when a week plan is published for that week", () => {
    expect(
      educatorClassVisibleInWeek({
        classStartDate: "2026-09-21",
        classEndDate: "2026-11-20",
        weekStartDate: "2026-09-14",
        weekEndDate: "2026-09-20",
        hasPublishedPlan: true,
      }),
    ).toBe(true);
  });

  it("still includes a class whose dates overlap the week", () => {
    expect(
      educatorClassVisibleInWeek({
        classStartDate: "2026-09-14",
        classEndDate: "2026-11-20",
        weekStartDate: "2026-09-14",
        weekEndDate: "2026-09-20",
        hasPublishedPlan: false,
      }),
    ).toBe(true);
  });
});

describe("educatorClassDayVisible", () => {
  it("keeps published-plan days before class.startDate", () => {
    expect(
      educatorClassDayVisible({
        classStartDate: "2026-09-21",
        classEndDate: "2026-11-20",
        calculatedDate: "2026-09-14",
        hasPublishedPlan: true,
      }),
    ).toBe(true);
  });

  it("drops days before start when there is no published plan", () => {
    expect(
      educatorClassDayVisible({
        classStartDate: "2026-09-21",
        classEndDate: "2026-11-20",
        calculatedDate: "2026-09-14",
        hasPublishedPlan: false,
      }),
    ).toBe(false);
  });
});

describe("sortEducatorWeekSchedules", () => {
  it("orders morning then afternoon on the same day", () => {
    const sorted = sortEducatorWeekSchedules([
      { calculatedDate: "2026-09-14", startTime: "13:00", className: "Logic Hall" },
      { calculatedDate: "2026-09-14", startTime: "09:00", className: "Pioneers" },
    ]);
    expect(sorted.map((s) => s.className)).toEqual(["Pioneers", "Logic Hall"]);
  });
});
