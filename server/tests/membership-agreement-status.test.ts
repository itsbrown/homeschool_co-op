import {
  EMPTY_MEMBERSHIP_AGREEMENT_STATUS,
  pickMembershipAgreementStatus,
} from "../lib/membership-agreement-status";

describe("pickMembershipAgreementStatus", () => {
  it("prefers a school that still needs a signature", () => {
    const signed = {
      ...EMPTY_MEMBERSHIP_AGREEMENT_STATUS,
      schoolId: 1,
      schoolName: "Signed School",
      hasSigned: true,
      requiresNewSignature: false,
    };
    const unsigned = {
      ...EMPTY_MEMBERSHIP_AGREEMENT_STATUS,
      schoolId: 2,
      schoolName: "Needs Sign",
      requiresNewSignature: true,
    };
    expect(pickMembershipAgreementStatus([signed, unsigned]).schoolId).toBe(2);
  });

  it("returns empty when the parent has no schools", () => {
    expect(pickMembershipAgreementStatus([])).toEqual(EMPTY_MEMBERSHIP_AGREEMENT_STATUS);
  });
});
