/**
 * PaymentIntent.metadata flags for combined class balance + membership (e.g. payment plans).
 * membershipAmount is integer cents; only honored when hasMembership === 'true'.
 */
export function parseMetadataMembershipAmountCents(
  metadata: Record<string, string | undefined> | null | undefined
): number {
  if (!metadata || metadata.hasMembership !== 'true') {
    return 0;
  }
  const raw = metadata.membershipAmount;
  if (raw === undefined || raw === '') return 0;
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

/** Cents to allocate across class enrollments after reserving membership portion. */
export function enrollmentPoolCentsForBalanceIntent(
  totalChargedCents: number,
  membershipCents: number
): number {
  if (!Number.isInteger(totalChargedCents) || totalChargedCents < 0) {
    return 0;
  }
  const reserved = Math.max(0, Math.min(membershipCents, totalChargedCents));
  return totalChargedCents - reserved;
}
