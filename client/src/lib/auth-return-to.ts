/** Session key for post-login redirect (survives OAuth round-trips). */
export const AUTH_RETURN_TO_KEY = "auth_return_to";

const AUTH_LANDING_PATHS = new Set([
  "/login",
  "/logout",
  "/auth/logout",
  "/auth/login",
  "/auth/callback",
  "/old-login",
  "/embedded-login",
  "/auth0-login",
  "/school-admin-login",
  "/emergency-logout",
  "/forgot-password",
  "/reset-password",
  "/register",
]);

export function isSafeReturnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/** Session flag: stay on /login after emergency logout even if a leftover session flickers. */
export const STAY_ON_LOGIN_KEY = "asa_stay_on_login";

export function markStayOnLogin(): void {
  try {
    sessionStorage.setItem(STAY_ON_LOGIN_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearStayOnLogin(): void {
  try {
    sessionStorage.removeItem(STAY_ON_LOGIN_KEY);
  } catch {
    // ignore
  }
}

export function isStayOnLogin(): boolean {
  try {
    if (sessionStorage.getItem(STAY_ON_LOGIN_KEY) === "1") return true;
    const params = new URLSearchParams(window.location.search);
    return params.get("signed_out") === "1";
  } catch {
    return false;
  }
}

/** Reject /login (and other auth screens) so post-login cannot loop on Sign in. */
export function isPostLoginDestination(path: string): boolean {
  if (!isSafeReturnPath(path)) return false;
  const pathname = path.split("?")[0].split("#")[0];
  if (pathname === "/") return false;
  if (AUTH_LANDING_PATHS.has(pathname)) return false;
  if (pathname.startsWith("/auth/")) return false;
  return true;
}

export function persistAuthReturnTo(path: string): void {
  if (!isPostLoginDestination(path)) return;
  try {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, path);
  } catch {
    // sessionStorage unavailable
  }
}

/** Copy ?returnTo= from the URL into sessionStorage when present. */
export function syncAuthReturnToFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo") || params.get("redirect");
    if (returnTo && isPostLoginDestination(returnTo)) {
      persistAuthReturnTo(returnTo);
    }
  } catch {
    // ignore
  }
}

export function resolveAuthReturnDestination(fallback = "/dashboard"): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get("returnTo") || params.get("redirect");
    if (fromParam && isPostLoginDestination(fromParam)) {
      return fromParam;
    }
    const stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    if (stored && isPostLoginDestination(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return fallback;
}

/** Read post-login destination once and clear stored returnTo (avoids double-redirect races). */
export function consumeAuthReturnDestination(fallback = "/dashboard"): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get("returnTo") || params.get("redirect");
    if (fromParam && isPostLoginDestination(fromParam)) {
      clearAuthReturnTo();
      return fromParam;
    }
    const stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    if (stored && isPostLoginDestination(stored)) {
      clearAuthReturnTo();
      return stored;
    }
  } catch {
    // ignore
  }
  return fallback;
}

/** True when /login should navigate away (session exists). Do not wait for roles — DashboardRouter already does. */
export function canLeaveLoginPage(options: {
  isAuthenticated: boolean;
  hasUser: boolean;
  registrationRequired?: boolean;
  redirectBlocked?: boolean;
  stayOnLogin?: boolean;
}): boolean {
  if (options.registrationRequired) return false;
  if (options.stayOnLogin || isStayOnLogin()) return false;
  // Only honor the block while sign-out is in progress. A leftover key from a
  // prior 403 (often DB-down misread as unregistered) must not trap a valid session.
  if (options.redirectBlocked && !options.isAuthenticated) return false;
  return options.isAuthenticated && options.hasUser;
}

/** Full page load after login — same as typing /dashboard (wouter setLocation can no-op). */
export function navigateAfterLogin(fallback = "/dashboard"): void {
  const destination = consumeAuthReturnDestination(fallback);
  window.location.assign(destination);
}

export function clearAuthReturnTo(): void {
  try {
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  } catch {
    // ignore
  }
}

export function loginPathWithReturnTo(
  returnTo: string,
  extraParams?: Record<string, string>,
): string {
  const dest = isPostLoginDestination(returnTo) ? returnTo : "/dashboard";
  persistAuthReturnTo(dest);
  const params = new URLSearchParams(extraParams ?? {});
  params.set("returnTo", dest);
  return `/login?${params.toString()}`;
}

/** Supabase OAuth redirect target — lands on /login with returnTo preserved. */
export function buildOAuthLoginRedirectUrl(): string {
  syncAuthReturnToFromUrl();
  const destination = resolveAuthReturnDestination("/dashboard");
  persistAuthReturnTo(destination);
  return `${window.location.origin}/login?returnTo=${encodeURIComponent(destination)}`;
}

/** Remove OAuth tokens from URL while keeping returnTo and other query params. */
export function stripOAuthTokensFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    let changed = false;

    if (url.hash.includes("access_token=")) {
      url.hash = "";
      changed = true;
    }

    for (const key of ["code", "state"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }

    if (changed) {
      const query = url.searchParams.toString();
      const newUrl = url.pathname + (query ? `?${query}` : "");
      window.history.replaceState({}, document.title, newUrl);
    }
  } catch {
    // ignore
  }
}
