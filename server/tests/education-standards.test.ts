import { describe, expect, it } from "@jest/globals";
import {
  classifyLexileBand,
  fallbackLexileThreshold,
  gradeToKpiSlug,
} from "../lib/education-standards";

describe("education-standards helpers", () => {
  it("classifyLexileBand uses atMin/atMax", () => {
    const thr = { atMin: 520, atMax: 820 };
    expect(classifyLexileBand(400, thr)).toBe("below");
    expect(classifyLexileBand(600, thr)).toBe("at");
    expect(classifyLexileBand(900, thr)).toBe("above");
  });

  it("fallbackLexileThreshold matches ASA ±100 heuristic", () => {
    const thr = fallbackLexileThreshold(3);
    expect(thr.atMin).toBe(200 + 3 * 100 - 100);
    expect(thr.atMax).toBe(200 + 3 * 100 + 100);
    expect(classifyLexileBand(thr.atMin - 1, thr)).toBe("below");
    expect(classifyLexileBand(thr.atMax + 1, thr)).toBe("above");
  });

  it("gradeToKpiSlug maps labels and numbers", () => {
    expect(gradeToKpiSlug("3rd Grade")).toBe("3rd-grade");
    expect(gradeToKpiSlug(3)).toBe("3rd-grade");
    expect(gradeToKpiSlug(0)).toBe("kindergarten");
    expect(gradeToKpiSlug("Kindergarten")).toBe("kindergarten");
  });
});
