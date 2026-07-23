import { describe, expect, it } from "@jest/globals";
import {
  educatorDayToSkeletonDay,
  normalizeScheduleTime,
  skeletonDayToEducatorDay,
  skeletonSlotMatchesClassMeeting,
  skeletonSlotMatchesClassMeetingExact,
} from "../../../shared/schedule-day-index";

describe("schedule-day-index", () => {
  it("converts Sun=0 skeleton days to Mon=0 educator days", () => {
    expect(skeletonDayToEducatorDay(0)).toBe(6); // Sunday
    expect(skeletonDayToEducatorDay(1)).toBe(0); // Monday
    expect(skeletonDayToEducatorDay(3)).toBe(2); // Wednesday
    expect(skeletonDayToEducatorDay(6)).toBe(5); // Saturday
  });

  it("converts Mon=0 educator days back to Sun=0 skeleton days", () => {
    expect(educatorDayToSkeletonDay(0)).toBe(1);
    expect(educatorDayToSkeletonDay(6)).toBe(0);
    expect(educatorDayToSkeletonDay(2)).toBe(3);
  });

  it("normalizes HH:MM and HH:MM:SS", () => {
    expect(normalizeScheduleTime("9:00")).toBe("09:00");
    expect(normalizeScheduleTime("09:00:00")).toBe("09:00");
    expect(normalizeScheduleTime("")).toBe("");
  });

  it("matches published blocks to class meetings by calendar day (full day plan)", () => {
    // Skeleton Mon 8:45 block ↔ class meeting Mon 09:00–12:00
    expect(
      skeletonSlotMatchesClassMeeting(
        { dayOfWeek: 1, startTime: "08:45", endTime: "08:55" },
        { dayOfWeek: 0, startTime: "09:00", endTime: "12:00" },
      ),
    ).toBe(true);

    expect(
      skeletonSlotMatchesClassMeeting(
        { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" },
        { dayOfWeek: 2, startTime: "09:00", endTime: "10:00" },
      ),
    ).toBe(false);
  });

  it("exact matcher still requires identical times", () => {
    expect(
      skeletonSlotMatchesClassMeetingExact(
        { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" },
        { dayOfWeek: 0, startTime: "09:00:00", endTime: "10:00:00" },
      ),
    ).toBe(true);

    expect(
      skeletonSlotMatchesClassMeetingExact(
        { dayOfWeek: 1, startTime: "08:45", endTime: "08:55" },
        { dayOfWeek: 0, startTime: "09:00", endTime: "12:00" },
      ),
    ).toBe(false);
  });
});
