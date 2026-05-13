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

/** Parse volunteer-credit fields set server-side on cart / balance PaymentIntents. */
export function parseBalanceIntentCredits(
  metadata: Record<string, string | undefined> | null | undefined
): { creditsAppliedCents: number; originalAmountCents: number } {
  if (!metadata) return { creditsAppliedCents: 0, originalAmountCents: 0 };
  const creditsRaw = parseInt(String(metadata.creditsAppliedCents || '0'), 10);
  const originalRaw = parseInt(String(metadata.originalAmountCents || '0'), 10);
  return {
    creditsAppliedCents: Number.isInteger(creditsRaw) && creditsRaw > 0 ? creditsRaw : 0,
    originalAmountCents: Number.isInteger(originalRaw) && originalRaw > 0 ? originalRaw : 0,
  };
}

/**
 * Total cents to allocate across enrollments + membership reservation when credits
 * partially cover a PaymentIntent (card amount is PI.amount; metadata carries the gross).
 */
export function totalCentsForBalanceAllocation(args: {
  paymentIntentAmountCents: number;
  creditsAppliedCents: number;
  originalAmountCents: number;
}): number {
  const pi = args.paymentIntentAmountCents;
  if (!Number.isInteger(pi) || pi < 0) {
    return 0;
  }
  if (!args.creditsAppliedCents || args.creditsAppliedCents <= 0) {
    return pi;
  }
  if (args.originalAmountCents > 0) {
    return args.originalAmountCents;
  }
  return pi + args.creditsAppliedCents;
}
