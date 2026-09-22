import { describe, expect, it } from "@jest/globals";
import {
  MEMBER_ID_FORMAT_EXAMPLE,
  generateMemberId,
  isReservedMemberIdExample,
  isValidMemberIdFormat,
} from "../utils/membership";

describe("member ID format", () => {
  it("rejects the documented example as a real ID", () => {
    expect(isReservedMemberIdExample(MEMBER_ID_FORMAT_EXAMPLE)).toBe(true);
    expect(isReservedMemberIdExample("asa-2025-x7k9m2")).toBe(true);
    expect(isValidMemberIdFormat(MEMBER_ID_FORMAT_EXAMPLE)).toBe(false);
  });

  it("accepts a generated-shaped ID that is not the example", () => {
    expect(isValidMemberIdFormat("ASA-2026-AB12CD")).toBe(true);
    expect(isValidMemberIdFormat("not-an-id")).toBe(false);
  });

  it("never generates the reserved example", () => {
    for (let i = 0; i < 20; i++) {
      const id = generateMemberId();
      expect(isReservedMemberIdExample(id)).toBe(false);
      expect(isValidMemberIdFormat(id)).toBe(true);
    }
  });
});
