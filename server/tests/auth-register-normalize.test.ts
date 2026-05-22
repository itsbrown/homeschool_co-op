import { describe, expect, it } from "@jest/globals";
import {
  buildLegacyRegisterUserBody,
  normalizeAuthRegisterInput,
  splitFullName,
} from "@shared/auth-register";

describe("normalizeAuthRegisterInput", () => {
  it("accepts legacy registerUser shape (name + subscription, no children)", () => {
    const body = buildLegacyRegisterUserBody({
      username: "jane@example.com",
      email: "jane@example.com",
      password: "SecurePass123!",
      name: "Jane Doe",
      role: "parent",
      subscription: "family",
    });

    const result = normalizeAuthRegisterInput(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.userFirstName).toBe("Jane");
    expect(result.data.userLastName).toBe("Doe");
    expect(result.data.signupChildren).toEqual([]);
    expect(result.data.requireChildWithSchoolSignup).toBe(false);
  });

  it("accepts parentFirstName/parentLastName with children for school signup", () => {
    const result = normalizeAuthRegisterInput({
      email: "parent@example.com",
      password: "SecurePass123!",
      parentFirstName: "Pat",
      parentLastName: "Parent",
      phone: "5555555555",
      location: "2",
      role: "parent",
      schoolId: 1,
      registrationCode: "TESTCODE",
      children: [
        {
          firstName: "Kid",
          lastName: "One",
          birthdate: "2016-01-15",
          gradeLevel: "2nd Grade",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.requireChildWithSchoolSignup).toBe(true);
    expect(result.data.signupChildren).toHaveLength(1);
    expect(result.data.preferredLocationId).toBe(2);
  });

  it("rejects school signup without children", () => {
    const result = normalizeAuthRegisterInput({
      email: "parent@example.com",
      password: "SecurePass123!",
      parentFirstName: "Pat",
      parentLastName: "Parent",
      schoolId: 1,
      registrationCode: "TESTCODE",
      role: "parent",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/at least one student/i);
  });

  it("rejects missing names when only email/password provided", () => {
    const result = normalizeAuthRegisterInput({
      email: "x@example.com",
      password: "SecurePass123!",
      role: "parent",
    });

    expect(result.ok).toBe(false);
  });

  it("splitFullName handles single token", () => {
    expect(splitFullName("Madonna")).toEqual({
      firstName: "Madonna",
      lastName: "Madonna",
    });
  });
});
