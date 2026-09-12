import { describe, expect, it } from "@jest/globals";
import {
  buildEmergencyContactCsv,
  groupEmergencyContactLists,
  hasEmergencyPhone,
  joinPersonName,
  resolveEmergencyContact,
} from "../emergency-contact-resolve";

describe("joinPersonName", () => {
  it("joins first and last and ignores blanks", () => {
    expect(joinPersonName("Jane", "Doe")).toBe("Jane Doe");
    expect(joinPersonName("  Jane  ", "", "Fallback")).toBe("Jane");
    expect(joinPersonName(null, null, " Fallback ")).toBe("Fallback");
    expect(joinPersonName(null, null, null)).toBeNull();
  });
});

describe("resolveEmergencyContact", () => {
  it("prefers parent user table fields over extra contacts", () => {
    const resolved = resolveEmergencyContact({
      parentUser: {
        firstName: "Pat",
        lastName: "Parent",
        phone: "555-0000",
        email: "pat@example.com",
        emergencyContactFirstName: "Aunt",
        emergencyContactLastName: "May",
        emergencyContactPhone: "555-1111",
        emergencyContactRelationship: "Aunt",
      },
      extraContacts: [
        { id: 2, firstName: "Other", lastName: "Person", phoneNumber: "555-9999", relationship: "Friend" },
      ],
      childLegacyContact: "Legacy Name",
    });
    expect(resolved.source).toBe("user");
    expect(resolved.emergencyContactName).toBe("Aunt May");
    expect(resolved.emergencyContactPhone).toBe("555-1111");
    expect(resolved.parentName).toBe("Pat Parent");
    expect(hasEmergencyPhone(resolved)).toBe(true);
  });

  it("falls back to authorized-pickup extra contact", () => {
    const resolved = resolveEmergencyContact({
      parentUser: { name: "Pat Parent", phone: "555-0000" },
      extraContacts: [
        { id: 9, firstName: "Later", lastName: "Row", phoneNumber: "555-3333", relationship: "Neighbor" },
        {
          id: 3,
          firstName: "Grandpa",
          lastName: "Lee",
          phoneNumber: "555-2222",
          relationship: "Grandfather",
          isAuthorizedPickup: true,
        },
      ],
    });
    expect(resolved.source).toBe("emergency_contacts");
    expect(resolved.emergencyContactName).toBe("Grandpa Lee");
    expect(resolved.emergencyContactPhone).toBe("555-2222");
  });

  it("uses child legacy name when nothing else exists", () => {
    const resolved = resolveEmergencyContact({
      childLegacyContact: "  Neighbor Kim  ",
    });
    expect(resolved.source).toBe("child_legacy");
    expect(resolved.emergencyContactName).toBe("Neighbor Kim");
    expect(hasEmergencyPhone(resolved)).toBe(false);
  });
});

describe("groupEmergencyContactLists", () => {
  const resolved = resolveEmergencyContact({
    parentUser: {
      name: "Pat Parent",
      phone: "555-0000",
      emergencyContactFirstName: "Aunt",
      emergencyContactLastName: "May",
      emergencyContactPhone: "555-1111",
    },
  });

  it("dedupes the school list and keeps a child on each class list", () => {
    const payload = groupEmergencyContactLists({
      school: { id: 1, name: "ASA" },
      generatedAt: "2026-09-12T00:00:00.000Z",
      classes: [
        { id: 10, title: "Yankee", locationId: 3, locationName: "Brighton", sessionId: 2 },
        { id: 11, title: "Tycoons", locationId: 3, locationName: "Brighton", sessionId: 2 },
      ],
      seats: [
        {
          classId: 10,
          childId: 5,
          firstName: "Riley",
          lastName: "Adams",
          gradeLevel: "2nd Grade",
          allergies: null,
          locationName: "Brighton",
          resolved,
        },
        {
          classId: 11,
          childId: 5,
          firstName: "Riley",
          lastName: "Adams",
          gradeLevel: "2nd Grade",
          allergies: null,
          locationName: "Brighton",
          resolved,
        },
      ],
    });

    expect(payload.schoolList).toHaveLength(1);
    expect(payload.schoolList[0].classes.map((c) => c.title)).toEqual(["Tycoons", "Yankee"]);
    expect(payload.classes).toHaveLength(2);
    expect(payload.classes[0].students).toHaveLength(1);
    expect(payload.classes[1].students).toHaveLength(1);
    expect(payload.totals).toEqual({ students: 1, classes: 2, missingContacts: 0 });
  });
});

describe("buildEmergencyContactCsv", () => {
  it("includes class column by default and escapes quotes", () => {
    const csv = buildEmergencyContactCsv([
      {
        childId: 1,
        firstName: 'Ada "Addie"',
        lastName: "Lovelace",
        gradeLevel: "4th Grade",
        allergies: null,
        parentName: "Pat",
        parentPhone: "555-0000",
        parentEmail: "pat@example.com",
        emergencyContactName: "Aunt May",
        emergencyContactPhone: "555-1111",
        emergencyContactRelationship: "Aunt",
        emergencyContactEmail: null,
        source: "user",
        locationName: "Brighton",
        classes: [{ id: 10, title: "Yankee" }],
      },
    ]);
    expect(csv).toContain("Class");
    expect(csv).toContain('"Ada ""Addie"" Lovelace"');
    expect(csv).toContain("Aunt May");
  });
});
