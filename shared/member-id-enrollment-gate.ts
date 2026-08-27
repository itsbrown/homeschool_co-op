/** Non-empty `users.member_id` — same bar as checkout membership satisfaction. */
export function parentHasMemberId(memberId: string | null | undefined): boolean {
  return typeof memberId === "string" && memberId.trim() !== "";
}

export const MEMBERS_ONLY_ENROLLMENT_NOTICE =
  "Returning member enrollment is open. If you already have an ASA member ID, sign in with that account. New families can enroll when registration opens to the public.";

const STAFF_BYPASS_ROLES = new Set([
  "schooladmin",
  "superadmin",
  "admin",
  "director",
]);

export function callerBypassesMemberIdEnrollmentGate(
  allRoles?: string[] | null,
  primaryRole?: string | null,
): boolean {
  const roles = [...(allRoles ?? [])];
  if (primaryRole) roles.push(primaryRole);
  return roles.some((r) => STAFF_BYPASS_ROLES.has(String(r).toLowerCase()));
}

export function canSelfEnrollWhenRequireMemberId(params: {
  requireMemberId?: boolean | null;
  memberId?: string | null;
  adminBypass?: boolean;
}): boolean {
  if (!params.requireMemberId) return true;
  if (params.adminBypass) return true;
  return parentHasMemberId(params.memberId);
}

export function programHiddenFromPublicStore(params: {
  requireMemberId?: boolean | null;
}): boolean {
  return params.requireMemberId === true;
}
