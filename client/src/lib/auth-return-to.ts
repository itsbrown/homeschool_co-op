/** Session key for post-login redirect (survives OAuth round-trips). */
export const AUTH_RETURN_TO_KEY = "auth_return_to";

export function isSafeReturnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export function persistAuthReturnTo(path: string): void {
  if (!isSafeReturnPath(path)) return;
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
    if (returnTo && isSafeReturnPath(returnTo)) {
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
    if (fromParam && isSafeReturnPath(fromParam)) {
      return fromParam;
    }
    const stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    if (stored && isSafeReturnPath(stored)) {
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
    if (fromParam && isSafeReturnPath(fromParam)) {
      clearAuthReturnTo();
      return fromParam;
    }
    const stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    if (stored && isSafeReturnPath(stored)) {
      clearAuthReturnTo();
      return stored;
    }
  } catch {
    // ignore
  }
  return fallback;
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
  persistAuthReturnTo(returnTo);
  const params = new URLSearchParams(extraParams ?? {});
  params.set("returnTo", returnTo);
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
