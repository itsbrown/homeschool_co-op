/** Matches server/lib/registration-public-locations.ts (mounted without auth in index.ts). */
export const PUBLIC_REGISTRATION_LOCATIONS_PATH =
  "/api/public/registration/locations";

/**
 * Public registration API calls — no Supabase token (avoids 401 / REGISTRATION_REQUIRED
 * when a stale session exists in localStorage).
 */

export async function fetchPublicRegistration(
  path: string,
): Promise<Response> {
  const url = path.startsWith("/api") ? path : `/api${path}`;
  return fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
}

export async function fetchPublicRegistrationJson<T>(path: string): Promise<T> {
  const response = await fetchPublicRegistration(path);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export type PublicRegistrationLocation = {
  id: number;
  name: string;
  activationStatus?: string | null;
  activationThreshold?: number | null;
  eligibleStudentCount?: number;
};

/** True when the server predates `?code=` support on the public locations route. */
function isLegacyPublicLocationsError(message: string): boolean {
  return (
    message.includes("School ID is required") ||
    message.includes("Registration code or school ID is required")
  );
}

/**
 * Load campuses for parent registration. Prefer `?code=` (matches the URL);
 * fall back to `?schoolId=` when the server has not been deployed yet.
 */
export async function fetchPublicRegistrationLocations(opts: {
  code?: string;
  schoolId?: number;
}): Promise<PublicRegistrationLocation[]> {
  const { code, schoolId } = opts;

  if (code) {
    try {
      return await fetchPublicRegistrationJson<PublicRegistrationLocation[]>(
        `${PUBLIC_REGISTRATION_LOCATIONS_PATH}?code=${encodeURIComponent(code)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (schoolId && isLegacyPublicLocationsError(message)) {
        return fetchPublicRegistrationJson<PublicRegistrationLocation[]>(
          `${PUBLIC_REGISTRATION_LOCATIONS_PATH}?schoolId=${schoolId}`,
        );
      }
      throw err;
    }
  }

  if (schoolId) {
    return fetchPublicRegistrationJson<PublicRegistrationLocation[]>(
      `${PUBLIC_REGISTRATION_LOCATIONS_PATH}?schoolId=${schoolId}`,
    );
  }

  return [];
}
