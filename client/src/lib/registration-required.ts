import { supabase } from "@/components/SupabaseProvider";
import type { RegistrationRequiredPayload } from "./registration-required-payload";

export {
  RegistrationRequiredError,
  ServiceUnavailableRolesError,
  isRegistrationRequiredBody,
  isServiceUnavailableBody,
} from "./registration-required-payload";
export type { RegistrationRequiredPayload } from "./registration-required-payload";

/**
 * Clear Supabase session and redirect to login with registration-required messaging.
 * Used by apiRequest and RoleContext (roles bootstrap uses raw fetch).
 */
/** Prevents SupabaseLogin from redirecting back to /dashboard before sign-out finishes. */
export const REGISTRATION_REDIRECT_BLOCK_KEY =
  "registration_required_block_redirect";

export async function handleRegistrationRequired(
  payload: RegistrationRequiredPayload,
): Promise<void> {
  console.log(
    "🚫 REGISTRATION_REQUIRED: User needs to register with their school first",
  );
  if (payload.message) {
    console.log("   Message:", payload.message);
  }

  const defaultMessage =
    "You need to register with your school before you can log in. Please contact your school administrator for a registration link.";
  sessionStorage.setItem(
    "registration_required_message",
    payload.message || defaultMessage,
  );
  sessionStorage.setItem("registration_required_email", payload.email || "");
  sessionStorage.setItem(REGISTRATION_REDIRECT_BLOCK_KEY, "1");

  localStorage.removeItem("supabase_token");
  localStorage.removeItem("activeRole");

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("signOut during registration-required handling failed:", err);
  }

  const loginUrl = "/login?error=registration_required";
  if (!window.location.pathname.includes("/login")) {
    window.location.replace(loginUrl);
  }
}
