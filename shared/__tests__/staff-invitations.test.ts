import { describe, expect, it } from "@jest/globals";
import {
  formatInvitationExpiry,
  invitationExpiryDate,
  isClassroomStaffPosition,
  mapPositionToRole,
  canAdoptUserSchoolId,
  shouldClaimClassInstructor,
  staffInviteAbsoluteUrl,
  staffInvitePath,
} from "../staff-invitations";

describe("mapPositionToRole", () => {
  it("maps Mentor and educator titles to teacher", () => {
    expect(mapPositionToRole("Mentor")).toBe("teacher");
    expect(mapPositionToRole("Lead Mentor")).toBe("teacher");
    expect(mapPositionToRole("educator")).toBe("teacher");
    expect(mapPositionToRole("Instructor")).toBe("teacher");
  });

  it("maps admin and support titles", () => {
    expect(mapPositionToRole("Administrator")).toBe("administrator");
    expect(mapPositionToRole("schoolAdmin")).toBe("administrator");
    expect(mapPositionToRole("Aide")).toBe("staff");
    expect(mapPositionToRole("Office")).toBe("other");
  });
});

describe("isClassroomStaffPosition", () => {
  it("is true for Mentor and false for office roles", () => {
    expect(isClassroomStaffPosition("Mentor")).toBe(true);
    expect(isClassroomStaffPosition("Administrator")).toBe(false);
  });
});

describe("staff invite URLs", () => {
  it("builds a relative accept path", () => {
    expect(staffInvitePath("abc")).toBe("/accept-educator-invitation?token=abc");
  });

  it("builds an absolute URL from APP_URL", () => {
    expect(staffInviteAbsoluteUrl("tok", "https://example.com/")).toBe(
      "https://example.com/accept-educator-invitation?token=tok",
    );
  });
});

describe("invitationExpiryDate", () => {
  it("is seven days later by default", () => {
    const from = new Date("2026-08-20T12:00:00.000Z");
    expect(invitationExpiryDate(from).toISOString()).toBe("2026-08-27T12:00:00.000Z");
    expect(formatInvitationExpiry(from)).toMatch(/Aug/);
  });
});

describe("canAdoptUserSchoolId", () => {
  it("fills unset schoolId and keeps another school's user", () => {
    expect(canAdoptUserSchoolId(null, 12)).toBe(true);
    expect(canAdoptUserSchoolId(12, 12)).toBe(true);
    expect(canAdoptUserSchoolId(3, 12)).toBe(false);
  });
});

describe("shouldClaimClassInstructor", () => {
  it("claims empty instructor and does not steal another mentor", () => {
    expect(shouldClaimClassInstructor(null, 9)).toBe(true);
    expect(shouldClaimClassInstructor(9, 9)).toBe(true);
    expect(shouldClaimClassInstructor(4, 9)).toBe(false);
  });
});
