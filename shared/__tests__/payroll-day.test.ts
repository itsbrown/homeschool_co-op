import { isSchoolFeatureEnabled } from "../../server/lib/school-features";
import {
  classDayOnOrAfter,
  dayShareMinutes,
  hoursToMinutes,
  paidMinutes,
  payCents,
  shiftClassDay,
} from "../payroll-day";

/** Week-ending 2026-09-25 dry run. Kept here so production code does not ship a named roster. */
const SHEET = [
  { rateDollars: 32, weeklyHours: 30 },
  { rateDollars: 20, weeklyHours: 6 },
  { rateDollars: 28, weeklyHours: 15 },
  { rateDollars: 20, weeklyHours: 3 },
  { rateDollars: 20, weeklyHours: 9 },
  { rateDollars: 20, weeklyHours: 6 },
  { rateDollars: 20, weeklyHours: 3 },
  { rateDollars: 20, weeklyHours: 9 },
  { rateDollars: 28, weeklyHours: 18 },
  { rateDollars: 20, weeklyHours: 9 },
  { rateDollars: 22, weeklyHours: 18 },
  { rateDollars: 20, weeklyHours: 6 },
  { rateDollars: 28, weeklyHours: 15 },
  { rateDollars: 20, weeklyHours: 6 },
  { rateDollars: 30, weeklyHours: 3 },
  { rateDollars: 30, weeklyHours: 3 },
  { rateDollars: 28, weeklyHours: 28 },
  { rateDollars: 20, weeklyHours: 8 },
  { rateDollars: 28, weeklyHours: 30 },
  { rateDollars: 20, weeklyHours: 6 },
  { rateDollars: 32, weeklyHours: 18 },
];

describe("payroll day pay", () => {
  it("matches the unedited sheet total of 249 hours and $6,500", () => {
    const minutes = SHEET.reduce((sum, job) => sum + hoursToMinutes(job.weeklyHours), 0);
    const cents = SHEET.reduce(
      (sum, job) => sum + payCents(hoursToMinutes(job.weeklyHours), job.rateDollars * 100),
      0,
    );
    expect(minutes).toBe(249 * 60);
    expect(cents).toBe(650_000);
  });

  it("leaves daily hours off until a super admin turns it on", () => {
    expect(isSchoolFeatureEnabled({}, "dailyHours")).toBe(false);
    expect(isSchoolFeatureEnabled({ dailyHours: true }, "dailyHours")).toBe(true);
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
