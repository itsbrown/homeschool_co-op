import { describe, expect, it } from "@jest/globals";
import { isSafetyAlertText, resolveEducatorStudentSafety } from "../educator-student-safety";

describe("isSafetyAlertText", () => {
  it("treats blank and none-like values as no alert", () => {
    expect(isSafetyAlertText(null)).toBe(false);
    expect(isSafetyAlertText("")).toBe(false);
    expect(isSafetyAlertText("none")).toBe(false);
    expect(isSafetyAlertText("N/A")).toBe(false);
    expect(isSafetyAlertText("None known")).toBe(false);
  });

  it("flags real allergy copy", () => {
    expect(isSafetyAlertText("Peanuts")).toBe(true);
    expect(isSafetyAlertText("Peanuts - Severe")).toBe(true);
  });
});

describe("resolveEducatorStudentSafety", () => {
  it("prefers parent user emergency fields over the contacts table", () => {
    const safety = resolveEducatorStudentSafety({
      child: { allergies: "Peanuts", medicalInfo: "EpiPen", specialNeeds: "none" },
      parent: {
        phone: "585-555-0100",
        emergencyContactFirstName: "Pat",
        emergencyContactLastName: "Contact",
        emergencyContactPhone: "585-555-0199",
        emergencyContactRelationship: "Grandparent",
      },
      emergencyContacts: [
        { firstName: "Other", lastName: "Person", phoneNumber: "111", relationship: "Aunt" },
      ],
    });
    expect(safety.hasAllergyAlert).toBe(true);
    expect(safety.hasMedicalAlert).toBe(true);
    expect(safety.hasSpecialNeedsAlert).toBe(false);
    expect(safety.emergencyContactName).toBe("Pat Contact");
    expect(safety.emergencyContactPhone).toBe("585-555-0199");
    expect(safety.parentPhone).toBe("585-555-0100");
  });

  it("falls back to emergency_contacts then child.emergencyContact", () => {
    const fromTable = resolveEducatorStudentSafety({
      child: {},
      parent: { phone: "222" },
      emergencyContacts: [
        { firstName: "Sam", lastName: "Lee", phoneNumber: "333", relationship: "Neighbor" },
      ],
    });
    expect(fromTable.emergencyContactName).toBe("Sam Lee");
    expect(fromTable.emergencyContactPhone).toBe("333");

    const fromChild = resolveEducatorStudentSafety({
      child: { emergencyContact: "Call grandma 444" },
      parent: {},
      emergencyContacts: [],
    });
    expect(fromChild.emergencyContactName).toBe("Call grandma 444");
  });
});
