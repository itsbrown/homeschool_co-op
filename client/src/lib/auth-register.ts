import { apiRequest } from "./queryClient";
import {
  buildAuthRegisterRequestBody,
  buildLegacyRegisterUserBody,
  type AuthRegisterSuccessResponse,
  type RegisterParentWithChildrenPayload,
  type RegistrationSignupChildInput,
} from "@shared/auth-register";

export type {
  AuthRegisterSuccessResponse,
  RegisterParentWithChildrenPayload,
  RegistrationSignupChildInput,
};

/**
 * School-code parent signup: account + student profiles in one request.
 * Matches `POST /api/auth/register` in `server/api/auth.ts`.
 */
export async function registerParentWithChildren(
  payload: RegisterParentWithChildrenPayload
): Promise<AuthRegisterSuccessResponse> {
  const body = buildAuthRegisterRequestBody(payload);
  const res = await apiRequest("POST", "/api/auth/register", body);
  const data = (await res.json()) as AuthRegisterSuccessResponse & {
    success?: boolean;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message || "Registration failed"
    );
  }

  return data as AuthRegisterSuccessResponse;
}

/** Legacy dashboard/curriculum signup shape — maps `name` to first/last. */
export async function registerLegacyUserAccount(userData: {
  username: string;
  email: string;
  password: string;
  name: string;
  role: string;
  subscription?: string;
}): Promise<AuthRegisterSuccessResponse["user"]> {
  const body = buildLegacyRegisterUserBody(userData);
  const res = await apiRequest("POST", "/api/auth/register", body);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Registration failed");
  }

  return data.user;
}
