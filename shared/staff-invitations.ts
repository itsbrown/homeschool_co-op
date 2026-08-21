/** Maps Staff Positions titles onto staff_invitations.role (PG enum). */
export type StaffInvitationRole = "teacher" | "administrator" | "staff" | "other";

export function mapPositionToRole(position: string): StaffInvitationRole {
  const positionLower = (position ?? "").toLowerCase();
  if (
    positionLower.includes("teacher") ||
    positionLower.includes("mentor") ||
    positionLower.includes("instructor") ||
    positionLower.includes("educator")
  ) {
    return "teacher";
  }
  if (positionLower.includes("admin")) {
    return "administrator";
  }
  if (
    positionLower.includes("support") ||
    positionLower.includes("aide") ||
    positionLower.includes("volunteer")
  ) {
    return "staff";
  }
  return "other";
}

export function isClassroomStaffPosition(position: string): boolean {
  return mapPositionToRole(position) === "teacher";
}

export function staffInvitePath(token: string): string {
  return `/accept-educator-invitation?token=${encodeURIComponent(token)}`;
}

export function staffInviteAbsoluteUrl(token: string, appUrl?: string | null): string {
  const base = (appUrl || "https://accounts.americanseekersacademy.com").replace(/\/$/, "");
  return `${base}${staffInvitePath(token)}`;
}

export function invitationExpiryDate(from = new Date(), days = 7): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Keep an existing user's home school; only fill schoolId when unset or already this school. */
export function canAdoptUserSchoolId(
  currentSchoolId: number | null | undefined,
  invitingSchoolId: number,
): boolean {
  return currentSchoolId == null || currentSchoolId === invitingSchoolId;
}

/** Do not replace another mentor as class instructor; assignment rows can still be added. */
export function shouldClaimClassInstructor(
  currentInstructorId: number | null | undefined,
  invitedEducatorId: number,
): boolean {
  return currentInstructorId == null || currentInstructorId === invitedEducatorId;
}

export function formatInvitationExpiry(expiresAt: Date): string {
  return expiresAt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
