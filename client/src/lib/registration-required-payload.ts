export class RegistrationRequiredError extends Error {
  constructor(message?: string) {
    super(message ?? "Registration required");
    this.name = "RegistrationRequiredError";
  }
}

export class ServiceUnavailableRolesError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "The service is temporarily unavailable. Please try again shortly.",
    );
    this.name = "ServiceUnavailableRolesError";
  }
}

export type RegistrationRequiredPayload = {
  message?: string;
  email?: string;
};

export function isRegistrationRequiredBody(
  data: unknown,
): data is RegistrationRequiredPayload & { error: "REGISTRATION_REQUIRED" } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { error?: string }).error === "REGISTRATION_REQUIRED"
  );
}

export function isServiceUnavailableBody(
  data: unknown,
): data is { error: "SERVICE_UNAVAILABLE"; message?: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { error?: string }).error === "SERVICE_UNAVAILABLE"
  );
}
