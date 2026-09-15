export type ParentMembershipAgreementStatus = {
  schoolId: number | null;
  schoolName: string | null;
  hasSigned: boolean;
  currentVersion: string | null;
  latestSignedVersion: string | null;
  signedAt: string | null;
  requiresNewSignature: boolean;
};

export const PARENT_MEMBERSHIP_AGREEMENT_STATUS_QUERY_KEY = [
  "/api/parent/agreements/status",
] as const;

export function shouldShowMembershipAgreementBanner(
  data: ParentMembershipAgreementStatus | undefined | null,
): boolean {
  return data?.requiresNewSignature === true && data.schoolId != null;
}

export function membershipAgreementSignHref(
  schoolId: number,
  returnPath = "/parent/home",
): string {
  return `/membership-agreement?schoolId=${schoolId}&return=${encodeURIComponent(returnPath)}`;
}

export function membershipAgreementBannerCopy(data: {
  schoolName?: string | null;
  latestSignedVersion?: string | null;
}): { title: string; body: string; cta: string } {
  const school = data.schoolName?.trim() || "your school";
  if (data.latestSignedVersion) {
    return {
      title: "Updated membership agreement",
      body: `${school} updated the membership agreement. Please review and sign the new version. This reminder stays until you sign.`,
      cta: "Review and sign",
    };
  }
  return {
    title: "Please sign the membership agreement",
    body: `Review and sign the ${school} membership agreement. This reminder stays until you sign.`,
    cta: "Review and sign",
  };
}
