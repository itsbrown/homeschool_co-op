import {
  membershipAgreementBannerCopy,
  membershipAgreementSignHref,
  PARENT_MEMBERSHIP_AGREEMENT_STATUS_QUERY_KEY,
  shouldShowMembershipAgreementBanner,
  type ParentMembershipAgreementStatus,
} from "../parent-membership-agreement";

const unsigned: ParentMembershipAgreementStatus = {
  schoolId: 2,
  schoolName: "ASA",
  hasSigned: false,
  currentVersion: "2",
  latestSignedVersion: null,
  signedAt: null,
  requiresNewSignature: true,
};

describe("membership agreement dashboard banner", () => {
  it("hides when there is no template or the current version is signed", () => {
    expect(shouldShowMembershipAgreementBanner(undefined)).toBe(false);
    expect(
      shouldShowMembershipAgreementBanner({
        ...unsigned,
        requiresNewSignature: false,
        hasSigned: true,
        latestSignedVersion: "2",
      }),
    ).toBe(false);
    expect(
      shouldShowMembershipAgreementBanner({
        ...unsigned,
        schoolId: null,
      }),
    ).toBe(false);
  });

  it("shows until the current version is signed and links back to Parent Home", () => {
    expect(shouldShowMembershipAgreementBanner(unsigned)).toBe(true);
    expect(membershipAgreementSignHref(2)).toBe(
      "/membership-agreement?schoolId=2&return=%2Fparent%2Fhome",
    );
    expect(PARENT_MEMBERSHIP_AGREEMENT_STATUS_QUERY_KEY[0]).toBe(
      "/api/parent/agreements/status",
    );
  });

  it("uses updated copy when a prior version was already signed", () => {
    const first = membershipAgreementBannerCopy(unsigned);
    expect(first.title).toMatch(/sign the membership agreement/i);
    const updated = membershipAgreementBannerCopy({
      schoolName: "ASA",
      latestSignedVersion: "1.0",
    });
    expect(updated.title).toMatch(/updated/i);
    expect(updated.body).toMatch(/stays until you sign/i);
  });
});
