import { describe, it, expect } from "@jest/globals";
import {
  allergiesToFormValue,
  buildChildProfilePatch,
  normalizeAllergiesInput,
} from "../../../shared/child-profile-patch";

describe("normalizeAllergiesInput", () => {
  it("joins arrays onto the text column", () => {
    expect(normalizeAllergiesInput(["Peanuts", "Bee stings"])).toBe("Peanuts, Bee stings");
  });

  it("trims strings and treats empty as null", () => {
    expect(normalizeAllergiesInput("  Dairy  ")).toBe("Dairy");
    expect(normalizeAllergiesInput("")).toBeNull();
    expect(normalizeAllergiesInput(["", "  "])).toBeNull();
  });
});

describe("allergiesToFormValue", () => {
  it("never returns an array for textarea value", () => {
    expect(allergiesToFormValue(["Peanuts"])).toBe("Peanuts");
    expect(allergiesToFormValue(null)).toBe("");
  });
});

describe("buildChildProfilePatch", () => {
  it("keeps allergies and drops unknown columns", () => {
    const patch = buildChildProfilePatch({
      allergies: ["Peanuts", "Shellfish"],
      medicalConditions: ["Asthma"],
      parentId: 999,
      grade: "4th Grade",
    });
    expect(patch.allergies).toBe("Peanuts, Shellfish");
    expect(patch.medicalInfo).toBe("Asthma");
    expect(patch.gradeLevel).toBe("4th Grade");
    expect(patch).not.toHaveProperty("parentId");
    expect(patch).not.toHaveProperty("grade");
    expect(patch).not.toHaveProperty("medicalConditions");
  });

  it("stores blank gender as null so signup children without gender can save", () => {
    const patch = buildChildProfilePatch({ gender: "", allergies: "Peanuts" });
    expect(patch.gender).toBeNull();
    expect(patch.allergies).toBe("Peanuts");
  });
});
