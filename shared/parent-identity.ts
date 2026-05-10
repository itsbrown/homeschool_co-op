/**
 * Normalize email for comparisons and lookups (case-insensitive, trim whitespace).
 */
export function normalizeEmailForLookup(email: string | null | undefined): string {
  if (email == null) return '';
  return email.trim().toLowerCase();
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeEmailForLookup(a);
  const nb = normalizeEmailForLookup(b);
  if (!na || !nb) return false;
  return na === nb;
}

/** Parent may be linked by FK on enrollment or by denormalized email (historical / drift). */
export function enrollmentMatchesParent(
  enrollment: { parentId?: number | null; parentEmail?: string | null },
  parentUserId: number | null | undefined,
  sessionEmail: string | null | undefined,
): boolean {
  if (parentUserId != null && enrollment.parentId === parentUserId) return true;
  return emailsMatch(enrollment.parentEmail, sessionEmail);
}
