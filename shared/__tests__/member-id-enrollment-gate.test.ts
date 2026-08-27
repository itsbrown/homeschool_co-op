import {
  canSelfEnrollWhenRequireMemberId,
  callerBypassesMemberIdEnrollmentGate,
  parentHasMemberId,
  programHiddenFromPublicStore,
} from "../member-id-enrollment-gate";

describe("parentHasMemberId", () => {
  it("accepts a non-empty member id", () => {
    expect(parentHasMemberId("ASA-2026-ABC123")).toBe(true);
  });

  it("rejects empty values", () => {
    expect(parentHasMemberId(null)).toBe(false);
    expect(parentHasMemberId("")).toBe(false);
    expect(parentHasMemberId("   ")).toBe(false);
    expect(parentHasMemberId(undefined)).toBe(false);
  });
});

describe("canSelfEnrollWhenRequireMemberId", () => {
  it("allows everyone when the flag is off", () => {
    expect(
      canSelfEnrollWhenRequireMemberId({ requireMemberId: false, memberId: null }),
    ).toBe(true);
  });

  it("blocks parents without a member id when the flag is on", () => {
    expect(
      canSelfEnrollWhenRequireMemberId({ requireMemberId: true, memberId: null }),
    ).toBe(false);
  });

  it("allows parents with a member id", () => {
    expect(
      canSelfEnrollWhenRequireMemberId({
        requireMemberId: true,
        memberId: "ASA-2026-X7K9M2",
      }),
    ).toBe(true);
  });

  it("allows staff bypass", () => {
    expect(
      canSelfEnrollWhenRequireMemberId({
        requireMemberId: true,
        memberId: null,
        adminBypass: true,
      }),
    ).toBe(true);
  });
});

describe("callerBypassesMemberIdEnrollmentGate", () => {
  it("treats schoolAdmin / superAdmin as bypass", () => {
    expect(callerBypassesMemberIdEnrollmentGate(["parent", "schoolAdmin"])).toBe(true);
    expect(callerBypassesMemberIdEnrollmentGate([], "superAdmin")).toBe(true);
    expect(callerBypassesMemberIdEnrollmentGate(["parent"])).toBe(false);
  });
});

describe("programHiddenFromPublicStore", () => {
  it("hides requireMemberId programs from the public catalog", () => {
    expect(programHiddenFromPublicStore({ requireMemberId: true })).toBe(true);
    expect(programHiddenFromPublicStore({ requireMemberId: false })).toBe(false);
  });
});
