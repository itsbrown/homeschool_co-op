import {
  classDayOnOrAfter,
  dayShareMinutes,
  hoursToMinutes,
  paidMinutes,
  payCents,
  rosterWeekTotals,
  shiftClassDay,
} from "../payroll-day";

describe("payroll day pay", () => {
  it("matches the unedited sheet total of 249 hours and $6,500", () => {
    const totals = rosterWeekTotals();
    expect(totals.minutes).toBe(249 * 60);
    expect(totals.payCents).toBe(650_000);
  });

  it("pays the day's share when someone is here", () => {
    const weekly = hoursToMinutes(30);
    const monday = paidMinutes({ weeklyMinutes: weekly, weekday: 1, present: "here", differentMinutes: null });
    expect(monday).toBe(dayShareMinutes(weekly, 1));
    expect(payCents(monday, 3200)).toBe(32_000);
  });

  it("pays nothing when they are not here and hours were not changed", () => {
    expect(paidMinutes({
      weeklyMinutes: hoursToMinutes(30),
      weekday: 1,
      present: "away",
      differentMinutes: null,
    })).toBe(0);
  });

  it("uses different hours even when marked not here", () => {
    expect(paidMinutes({
      weeklyMinutes: hoursToMinutes(30),
      weekday: 1,
      present: "away",
      differentMinutes: 90,
    })).toBe(90);
  });

  it("three here days add back to the weekly hours", () => {
    const weekly = hoursToMinutes(28);
    const sum = [1, 3, 5].reduce(
      (total, weekday) => total + paidMinutes({
        weeklyMinutes: weekly,
        weekday,
        present: "here",
        differentMinutes: null,
      }),
      0,
    );
    expect(sum).toBe(weekly);
  });

  it("steps only across Monday, Wednesday, and Friday", () => {
    expect(classDayOnOrAfter("2026-09-24")).toBe("2026-09-25");
    expect(shiftClassDay("2026-09-25", -1)).toBe("2026-09-23");
    expect(shiftClassDay("2026-09-25", 1)).toBe("2026-09-28");
  });
});
