import {
  gradesMatch,
  normalizeGradeLevel,
  gradeSlugToLabel,
  ageFromBirthdate,
  gradeLevelFromAge,
  gradeLevelFromBirthdate,
  toDateInputValue,
} from "../../../shared/grade-levels";

describe("grade-levels", () => {
  describe("normalizeGradeLevel", () => {
    it.each([
      ["1st Grade", "1st-grade"],
      ["1st-grade", "1st-grade"],
      ["1st", "1st-grade"],
      ["K", "kindergarten"],
      ["Kindergarten", "kindergarten"],
      ["pre-k", "pre-k"],
      ["Pre K", "pre-k"],
      ["littles", "littles"],
      ["12th Grade", "12th-grade"],
      ["grade 3", "3rd-grade"],
    ])("normalizes %s → %s", (raw, expected) => {
      expect(normalizeGradeLevel(raw)).toBe(expected);
    });

    it("returns null for unknown grades", () => {
      expect(normalizeGradeLevel("")).toBeNull();
      expect(normalizeGradeLevel(null)).toBeNull();
      expect(normalizeGradeLevel("not-a-grade")).toBeNull();
    });
  });

  describe("gradesMatch", () => {
    it("matches child label to class slug list", () => {
      expect(gradesMatch("1st Grade", ["1st-grade", "2nd-grade"])).toBe(true);
      expect(gradesMatch("2nd Grade", ["1st-grade"])).toBe(false);
    });

    it("returns false for empty class grades", () => {
      expect(gradesMatch("1st Grade", [])).toBe(false);
      expect(gradesMatch("1st Grade", null)).toBe(false);
    });
  });

  describe("gradeSlugToLabel", () => {
    it("returns display label", () => {
      expect(gradeSlugToLabel("1st-grade")).toBe("1st Grade");
    });
  });

  describe("ageFromBirthdate / gradeLevelFromAge (age − 5)", () => {
    it("computes completed years", () => {
      // Use local calendar dates (Date(y, mIndex, d)) to avoid UTC parse skew.
      expect(ageFromBirthdate("2017-12-01", new Date(2026, 7, 9))).toBe(8);
      expect(ageFromBirthdate("2017-12-01", new Date(2026, 11, 1))).toBe(9);
    });

    it.each([
      [3, "littles"],
      [4, "pre-k"],
      [5, "kindergarten"],
      [6, "1st-grade"],
      [8, "3rd-grade"],
      [17, "12th-grade"],
      [18, "12th-grade"],
    ] as const)("age %s → %s", (age, expected) => {
      expect(gradeLevelFromAge(age)).toBe(expected);
    });

    it("maps birthdate via age − 5", () => {
      expect(gradeLevelFromBirthdate("2017-12-01", new Date(2026, 7, 9))).toBe("3rd-grade");
      expect(gradeSlugToLabel(gradeLevelFromBirthdate("2017-12-01", new Date(2026, 7, 9)))).toBe(
        "3rd Grade",
      );
    });

    it("toDateInputValue strips ISO time", () => {
      expect(toDateInputValue("2017-12-01T00:00:00.000Z")).toBe("2017-12-01");
      expect(toDateInputValue("2017-12-01")).toBe("2017-12-01");
    });
  });
});
