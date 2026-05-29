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

/**
 * Cart membership total (metadata.membershipAmount) vs the membership share of *this*
 * PaymentIntent. On biweekly/ deposit plans, PI.amount is one installment while
 * metadata.membershipAmount is the full annual fee — reserving the full fee zeroes out
 * the class pool on installment 1 (Heather Jacks / $139.58 of $1675 case).
 */
export function membershipCentsForThisPaymentIntent(
  paymentIntentAmountCents: number,
  metadata: Record<string, string | undefined> | null | undefined,
): { cartMembershipTotalCents: number; membershipPortionThisPaymentCents: number } {
  const cartMembershipTotalCents = parseMetadataMembershipAmountCents(metadata);
  if (cartMembershipTotalCents <= 0) {
    return { cartMembershipTotalCents: 0, membershipPortionThisPaymentCents: 0 };
  }
  if (!Number.isInteger(paymentIntentAmountCents) || paymentIntentAmountCents <= 0) {
    return { cartMembershipTotalCents, membershipPortionThisPaymentCents: 0 };
  }

  const totalAmount = parseInt(String(metadata?.totalAmount ?? '0'), 10);
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    const portion = Math.min(cartMembershipTotalCents, paymentIntentAmountCents);
    return { cartMembershipTotalCents, membershipPortionThisPaymentCents: portion };
  }

  const portion = Math.min(
    paymentIntentAmountCents,
    Math.round(paymentIntentAmountCents * (cartMembershipTotalCents / totalAmount)),
  );
  return { cartMembershipTotalCents, membershipPortionThisPaymentCents: portion };
}

/** Membership cents to subtract before allocating the class pool for a PI. */
export function membershipCentsReservedForPaymentIntent(
  paymentIntentAmountCents: number,
  metadata: Record<string, string | undefined> | null | undefined,
): number {
  return membershipCentsForThisPaymentIntent(paymentIntentAmountCents, metadata)
    .membershipPortionThisPaymentCents;
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
