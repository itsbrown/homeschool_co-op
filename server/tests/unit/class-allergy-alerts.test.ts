import { describe, expect, it } from "@jest/globals";
import {
  childHasSevereClassroomAllergy,
  classroomAllergyReminderCopy,
  extractSevereAllergens,
  formatAllergenList,
  newlyIntroducedAllergens,
} from "../../../shared/class-allergy-alerts";

describe("extractSevereAllergens", () => {
  it("treats peanut as a classroom restriction without the word severe", () => {
    expect(extractSevereAllergens("Peanuts, pollen").map((a) => a.key)).toEqual(["peanut"]);
  });

  it("treats tree nuts and sesame as classroom restrictions", () => {
    expect(extractSevereAllergens("cashew and sesame").map((a) => a.key)).toEqual([
      "tree_nut",
      "sesame",
    ]);
  });

  it("does not flag mild dairy or egg alone", () => {
    expect(extractSevereAllergens("Dairy sensitivity")).toEqual([]);
    expect(extractSevereAllergens("Eggs")).toEqual([]);
  });

  it("flags dairy or egg when marked severe", () => {
    expect(extractSevereAllergens("Severe dairy allergy").map((a) => a.key)).toEqual(["dairy"]);
    expect(extractSevereAllergens("Egg — anaphylaxis, carries EpiPen").map((a) => a.key)).toEqual([
      "egg",
    ]);
  });

  it("uses a generic label when severe is marked but no known food is named", () => {
    expect(extractSevereAllergens("severe allergy — see nurse").map((a) => a.key)).toEqual([
      "severe_food",
    ]);
  });

  it("joins array allergy values", () => {
    expect(extractSevereAllergens(["Peanuts - Severe", "Bee stings"]).map((a) => a.key)).toEqual([
      "peanut",
    ]);
  });
});

describe("newlyIntroducedAllergens", () => {
  it("returns only allergens not already on the roster", () => {
    const added = extractSevereAllergens("peanuts and sesame");
    const already = extractSevereAllergens("peanut");
    expect(newlyIntroducedAllergens(added, already).map((a) => a.key)).toEqual(["sesame"]);
  });
});

describe("classroomAllergyReminderCopy", () => {
  it("never includes a student name", () => {
    const copy = classroomAllergyReminderCopy("Yankee Doodle", extractSevereAllergens("Peanuts"));
    expect(copy.subject).toContain("Yankee Doodle");
    expect(copy.content).toMatch(/peanut/);
    expect(copy.content).not.toMatch(/child|student name|Jordan/i);
    expect(copy.bannerBody).toMatch(/never share the student's name/i);
  });
});

describe("formatAllergenList", () => {
  it("joins two and three items", () => {
    expect(formatAllergenList(["peanut", "sesame"])).toBe("peanut and sesame");
    expect(formatAllergenList(["peanut", "sesame", "tree nut"])).toBe(
      "peanut, sesame, and tree nut",
    );
  });
});

describe("childHasSevereClassroomAllergy", () => {
  it("is true for peanut text or an explicit flag", () => {
    expect(childHasSevereClassroomAllergy({ allergies: "Peanuts" })).toBe(true);
    expect(childHasSevereClassroomAllergy({ allergies: null, hasSevereAllergies: true })).toBe(
      true,
    );
    expect(childHasSevereClassroomAllergy({ allergies: "pollen" })).toBe(false);
  });
});
