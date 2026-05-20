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
