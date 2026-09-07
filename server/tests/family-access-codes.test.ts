import { describe, expect, it } from "@jest/globals";
import { parseFamilyAccessCsvText, accessCodeLast4 } from "@shared/family-access-code-csv";
import { isSchoolFeatureEnabled, normalizeSchoolFeatures } from "../lib/school-features";
import { validateAccessCode, FamilyAccessCodeError } from "../lib/family-access-codes";

describe("family access code helpers", () => {
  it("defaults doorCodes to false", () => {
    expect(isSchoolFeatureEnabled(normalizeSchoolFeatures({}), "doorCodes")).toBe(false);
    expect(isSchoolFeatureEnabled(normalizeSchoolFeatures({ doorCodes: true }), "doorCodes")).toBe(true);
    expect(isSchoolFeatureEnabled(normalizeSchoolFeatures({ doorCodes: false }), "doorCodes")).toBe(false);
  });

  it("validates 3–12 alphanumeric codes", () => {
    expect(validateAccessCode(" 4821 ")).toBe("4821");
    expect(() => validateAccessCode("12")).toThrow(FamilyAccessCodeError);
    expect(() => validateAccessCode("abc-12")).toThrow(FamilyAccessCodeError);
  });

  it("returns last4 without exposing the full code when longer", () => {
    expect(accessCodeLast4("4821")).toBe("4821");
    expect(accessCodeLast4("991234")).toBe("1234");
  });

  it("parses email/code CSV and flags duplicates", () => {
    const parsed = parseFamilyAccessCsvText(
      ["Email,Door code", "a@test.com,1111", "b@test.com,2222", "a@test.com,3333"].join("\n"),
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].code).toBe("1111");
    expect(parsed.errors.some((e) => /Duplicate email/i.test(e.message))).toBe(true);
  });
});
