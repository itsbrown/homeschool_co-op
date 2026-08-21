import { supabase } from "@/components/SupabaseProvider";
import { markStayOnLogin } from "@/lib/auth-return-to";

/** Await Supabase sign-out, then land on /login without auto-bouncing to /dashboard. */
export async function performEmergencyLogout(): Promise<void> {
  markStayOnLogin();
  try {
    localStorage.setItem("asa_explicit_logout", "true");
  } catch {
    // ignore
  }

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }

  try {
    localStorage.setItem("asa_explicit_logout", "true");
    markStayOnLogin();
  } catch {
    // ignore
  }

  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignore
    }
  }

  window.location.replace("/login?signed_out=1");
}
