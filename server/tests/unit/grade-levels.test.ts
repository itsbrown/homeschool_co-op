import {
  gradesMatch,
  normalizeGradeLevel,
  gradeSlugToLabel,
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
});
