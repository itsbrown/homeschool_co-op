import { describe, expect, it } from "@jest/globals";
import {
  ageFromBirthdate,
  formatBirthdayDisplay,
  parseBirthdateParts,
} from "../../../shared/student-birthday";

describe("student-birthday", () => {
  it("parses YYYY-MM-DD without UTC shift", () => {
    expect(parseBirthdateParts("2015-06-01")).toEqual({
      year: 2015,
      month: 6,
      day: 1,
    });
    expect(parseBirthdateParts("2014-06-01T00:00:00.000Z")).toEqual({
      year: 2014,
      month: 6,
      day: 1,
    });
  });

  it("formats month day year for roster display", () => {
    expect(formatBirthdayDisplay("2015-06-01")).toBe("Jun 1, 2015");
    expect(formatBirthdayDisplay(null)).toBe("");
  });

  it("computes age from calendar parts", () => {
    expect(ageFromBirthdate("2015-06-01", new Date(2026, 5, 1))).toBe(11);
    expect(ageFromBirthdate("2015-06-01", new Date(2026, 4, 31))).toBe(10);
  });
});
