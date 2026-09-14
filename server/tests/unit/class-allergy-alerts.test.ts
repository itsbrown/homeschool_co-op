import { describe, expect, it } from "@jest/globals";
import {
  childHasSevereClassroomAllergy,
  classroomAllergyAdminCopy,
  classroomAllergyChipLabel,
  classroomAllergyReminderCopy,
  classAllergySummary,
  extractSevereAllergens,
  formatAllergenList,
  householdAllergyCardCopy,
  householdAllergySignature,
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

  it("keeps the named tree nuts from the allergy note", () => {
    const allergens = extractSevereAllergens(
      "Pistachios, Cashews & Hazelnuts - Mom carries EpiPen pen",
    );
    expect(allergens.map((item) => item.key)).toEqual(["tree_nut"]);
    expect(allergens[0]?.examples).toEqual(["pistachios", "cashews", "hazelnuts"]);
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

  it("does not treat feeding restrictions as a classroom food ban", () => {
    expect(extractSevereAllergens("several. severe feeding restrictions")).toEqual([]);
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

describe("classroomAllergyAdminCopy", () => {
  it("never includes a student name", () => {
    const copy = classroomAllergyAdminCopy("Tycoons | Brighton | F2026", extractSevereAllergens("Peanuts"));
    expect(copy.bannerTitle).toMatch(/Severe allergy/i);
    expect(copy.bannerBody).toMatch(/peanut/i);
    expect(copy.bannerBody).not.toMatch(/Jordan|Allergen/i);
  });
});

describe("classAllergySummary", () => {
  it("is empty when there are no classroom restrictions", () => {
    expect(classAllergySummary([])).toEqual({ hasSevereAllergy: false, severeAllergens: [] });
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

describe("householdAllergyCardCopy", () => {
  it("collapses many classes into one summary and names the parent's children", () => {
    const peanut = extractSevereAllergens("Peanuts");
    const sesame = extractSevereAllergens("sesame");
    const copy = householdAllergyCardCopy([
      {
        classId: 66,
        className: "Tycoons | Brighton | F2026",
        allergens: peanut,
        children: [{ firstName: "Maya" }, { firstName: "Jonah" }],
      },
      {
        classId: 82,
        className: "Logic Hall | Brighton | F2026",
        allergens: sesame,
        children: [{ firstName: "Maya" }],
      },
    ]);
    expect(copy.title).toBe("Classroom food restrictions");
    expect(copy.summary).toMatch(/do not pack the foods listed/i);
    expect(copy.rows.map((row) => ({
      classId: row.classId,
      className: row.className,
      allergenLabel: row.allergenLabel,
      childrenLabel: row.childrenLabel,
      label: row.label,
    }))).toEqual([
      {
        classId: 66,
        className: "Tycoons | Brighton | F2026",
        allergenLabel: "peanut",
        childrenLabel: "Your children in this class: Maya and Jonah",
        label: "Tycoons | Brighton | F2026: do not pack peanut",
      },
      {
        classId: 82,
        className: "Logic Hall | Brighton | F2026",
        allergenLabel: "sesame",
        childrenLabel: "Your children in this class: Maya",
        label: "Logic Hall | Brighton | F2026: do not pack sesame",
      },
    ]);
    expect(JSON.stringify(copy)).not.toMatch(/Jordan/i);
  });

  it("lists the named tree nuts under the class", () => {
    const copy = householdAllergyCardCopy([
      {
        classId: 12,
        className: "Seekers | Brighton",
        allergens: extractSevereAllergens(
          "Pistachios, Cashews & Hazelnuts - Mom carries EpiPen pen",
        ),
        children: [{ firstName: "Hermione" }],
      },
    ]);
    expect(copy.rows).toEqual([
      {
        classId: 12,
        className: "Seekers | Brighton",
        allergenLabel: "tree nuts (pistachios, cashews, and hazelnuts)",
        childrenLabel: "Your children in this class: Hermione",
        label: "Seekers | Brighton: do not pack tree nuts (pistachios, cashews, and hazelnuts)",
      },
    ]);
  });

  it("uses common tree-nut examples when the note only says nuts", () => {
    const copy = householdAllergyCardCopy([
      {
        classId: 13,
        className: "Seekers | Brighton",
        allergens: extractSevereAllergens("Nut Allergy"),
        children: [{ firstName: "Hermione" }],
      },
    ]);
    expect(copy.rows[0]?.allergenLabel).toBe(
      "tree nuts (almonds, cashews, walnuts, pistachios, and hazelnuts)",
    );
  });

  it("omits classes that only have an unnamed severe note", () => {
    const copy = householdAllergyCardCopy([
      {
        classId: 10,
        className: "Macaronis | Brighton",
        allergens: extractSevereAllergens("severe allergy — see nurse"),
        children: [{ firstName: "Adaluna" }],
      },
    ]);
    expect(copy.rows).toEqual([]);
    expect(JSON.stringify(copy)).not.toMatch(/unnamed/i);
  });

  it("changes the dismiss signature when a new class or allergen appears", () => {
    const peanut = extractSevereAllergens("Peanuts");
    const sesame = extractSevereAllergens("sesame");
    const one = householdAllergySignature([{ classId: 66, className: "Tycoons", allergens: peanut }]);
    const two = householdAllergySignature([
      { classId: 66, className: "Tycoons", allergens: peanut },
      { classId: 82, className: "Logic Hall", allergens: sesame },
    ]);
    expect(one).not.toBe(two);
    expect(classroomAllergyChipLabel(peanut)).toBe("No peanut");
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
