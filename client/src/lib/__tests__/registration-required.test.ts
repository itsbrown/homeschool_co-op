import {
  isRegistrationRequiredBody,
  isServiceUnavailableBody,
  RegistrationRequiredError,
} from "../registration-required-payload";

describe("registration-required helpers", () => {
  it("detects REGISTRATION_REQUIRED API bodies", () => {
    expect(
      isRegistrationRequiredBody({
        error: "REGISTRATION_REQUIRED",
        message: "Register first",
        email: "a@b.com",
      }),
    ).toBe(true);
    expect(isRegistrationRequiredBody({ error: "FORBIDDEN" })).toBe(false);
    expect(isRegistrationRequiredBody(null)).toBe(false);
  });

  it("detects SERVICE_UNAVAILABLE API bodies", () => {
    expect(
      isServiceUnavailableBody({
        error: "SERVICE_UNAVAILABLE",
        message: "DB down",
      }),
    ).toBe(true);
    expect(isServiceUnavailableBody({ error: "REGISTRATION_REQUIRED" })).toBe(
      false,
    );
  });

  it("RegistrationRequiredError has stable name", () => {
    const err = new RegistrationRequiredError("Need school link");
    expect(err.name).toBe("RegistrationRequiredError");
    expect(err.message).toBe("Need school link");
  });
});
