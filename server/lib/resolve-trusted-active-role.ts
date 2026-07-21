/**
 * Resolve active role for permission aggregation.
 * X-Active-Role is only honored when the user actually holds that role.
 */

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

/**
 * @param headerRole - raw `X-Active-Role` header (may be spoofed)
 * @param heldRoles - roles the user actually has (user_roles + legacy)
 * @param fallbackRole - DB activeRole / role when header is absent or invalid
 */
export function resolveTrustedActiveRole(
  headerRole: string | undefined | null,
  heldRoles: string[],
  fallbackRole: string | undefined | null,
): string {
  const held = (heldRoles ?? [])
    .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim());
  const heldNormalized = new Set(held.map(normalizeRole));

  const header =
    typeof headerRole === 'string' && headerRole.trim() ? headerRole.trim() : '';
  if (header && heldNormalized.has(normalizeRole(header))) {
    // Prefer the casing from held roles when available
    const match = held.find((r) => normalizeRole(r) === normalizeRole(header));
    return match ?? header;
  }

  const fallback =
    typeof fallbackRole === 'string' && fallbackRole.trim()
      ? fallbackRole.trim()
      : '';
  if (fallback && heldNormalized.has(normalizeRole(fallback))) {
    const match = held.find((r) => normalizeRole(r) === normalizeRole(fallback));
    return match ?? fallback;
  }

  // Header spoofed or unknown fallback: use first held role, else empty (fail closed)
  return held[0] ?? '';
}
