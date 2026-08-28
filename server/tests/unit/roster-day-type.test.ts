import { describe, expect, it } from "@jest/globals";
import {
  countRosterDayTypes,
  dayTypeForChild,
  formatRosterDayTypeSummary,
  isSessionTuitionEnrollment,
  pickSessionTuitionForChild,
  resolveEnrollmentDayType,
  rosterDayTypeLabel,
} from "../../../shared/roster-day-type";

describe("roster-day-type", () => {
  it("treats session-only rows as tuition, not class seats", () => {
    expect(
      isSessionTuitionEnrollment({
        childId: 1,
        sessionId: 2,
        classId: null,
        marketplaceClassId: null,
        status: "enrolled",
      }),
    ).toBe(true);
    expect(
      isSessionTuitionEnrollment({
        childId: 1,
        sessionId: 2,
        marketplaceClassId: 40,
        status: "enrolled",
      }),
    ).toBe(false);
    expect(
      isSessionTuitionEnrollment({
        childId: 1,
        sessionId: 2,
        status: "cancelled",
      }),
    ).toBe(false);
  });

  it("resolves day type from dayType, then variantId, then class name", () => {
    expect(resolveEnrollmentDayType({ dayType: "half_day" })).toBe("half_day");
    expect(resolveEnrollmentDayType({ variantId: "full_day" })).toBe("full_day");
    expect(resolveEnrollmentDayType({ className: "Fall 2026 - Half Day" })).toBe(
      "half_day",
    );
    expect(
      resolveEnrollmentDayType({ className: "Fall 2026 - 2 Full Days (Mon/Fri)" }),
    ).toBe("full_day");
    expect(resolveEnrollmentDayType({})).toBeNull();
  });

  it("picks enrolled session tuition for the class academic session", () => {
    const enrollments = [
      {
        id: 10,
        childId: 5,
        sessionId: 2,
        status: "pending_payment",
        dayType: "half_day" as const,
      },
      {
        id: 11,
        childId: 5,
        sessionId: 2,
        status: "enrolled",
        dayType: "full_day" as const,
      },
      {
        id: 12,
        childId: 5,
        sessionId: 3,
        status: "enrolled",
        dayType: "half_day" as const,
      },
      {
        id: 13,
        childId: 5,
        marketplaceClassId: 40,
        status: "enrolled",
        dayType: null,
      },
    ];
    expect(dayTypeForChild(enrollments, 5, 2)).toBe("full_day");
    expect(dayTypeForChild(enrollments, 5, 3)).toBe("half_day");
    expect(pickSessionTuitionForChild(enrollments, 9, 2)).toBeNull();
  });

  it("labels and summarizes roster counts", () => {
    expect(rosterDayTypeLabel("full_day")).toBe("Full Day");
    expect(rosterDayTypeLabel("half_day")).toBe("Half Day");
    expect(rosterDayTypeLabel(null)).toBe("");
    const counts = countRosterDayTypes(["full_day", "half_day", "full_day", null]);
    expect(counts).toEqual({ fullDay: 2, halfDay: 1, unspecified: 1 });
    expect(formatRosterDayTypeSummary(counts)).toBe("2 Full Day · 1 Half Day");
  });
});
