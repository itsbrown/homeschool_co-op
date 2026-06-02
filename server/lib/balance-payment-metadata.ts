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

/** Membership-first: pay annual fee before class from each allocation gross. */
export function computeMembershipWaterfallPortion(args: {
  allocationGrossCents: number;
  cartMembershipTotalCents: number;
  membershipAlreadyPaidCents: number;
}): number {
  const gross = args.allocationGrossCents;
  const cartTotal = args.cartMembershipTotalCents;
  const priorPaid = Math.max(0, args.membershipAlreadyPaidCents);
  if (!Number.isInteger(gross) || gross <= 0 || cartTotal <= 0) {
    return 0;
  }
  const remaining = Math.max(0, cartTotal - priorPaid);
  return Math.min(gross, remaining);
}

/** Split volunteer credits: membership owed first, remainder to enrollments. */
export function allocateVolunteerCreditsWaterfall(args: {
  creditsCents: number;
  membershipOwedCents: number;
}): { membershipCredits: number; enrollmentCredits: number } {
  const credits = Math.max(0, Math.floor(args.creditsCents));
  const owed = Math.max(0, Math.floor(args.membershipOwedCents));
  const membershipCredits = Math.min(credits, owed);
  return {
    membershipCredits,
    enrollmentCredits: credits - membershipCredits,
  };
}

export type MembershipPaymentIntentAllocation = {
  cartMembershipTotalCents: number;
  membershipPortionThisPaymentCents: number;
  allocationGrossCents: number;
  classPoolCents: number;
};

/**
 * Cart membership total vs membership share of *this* payment (waterfall).
 * Use allocationGrossCents (PI + credits) when credits partially cover checkout.
 */
export function membershipCentsForThisPaymentIntent(
  paymentIntentAmountCents: number,
  metadata: Record<string, string | undefined> | null | undefined,
  options?: {
    membershipAlreadyPaidCents?: number;
    allocationGrossCents?: number;
    cartMembershipTotalCents?: number;
  },
): MembershipPaymentIntentAllocation {
  const cartMembershipTotalCents =
    options?.cartMembershipTotalCents ?? parseMetadataMembershipAmountCents(metadata);
  const { creditsAppliedCents, originalAmountCents } = parseBalanceIntentCredits(metadata);
  const allocationGrossCents =
    options?.allocationGrossCents ??
    totalCentsForBalanceAllocation({
      paymentIntentAmountCents,
      creditsAppliedCents,
      originalAmountCents,
    });

  if (cartMembershipTotalCents <= 0) {
    return {
      cartMembershipTotalCents: 0,
      membershipPortionThisPaymentCents: 0,
      allocationGrossCents,
      classPoolCents: allocationGrossCents,
    };
  }

  const membershipPortionThisPaymentCents = computeMembershipWaterfallPortion({
    allocationGrossCents,
    cartMembershipTotalCents,
    membershipAlreadyPaidCents: options?.membershipAlreadyPaidCents ?? 0,
  });

  return {
    cartMembershipTotalCents,
    membershipPortionThisPaymentCents,
    allocationGrossCents,
    classPoolCents: enrollmentPoolCentsForBalanceIntent(
      allocationGrossCents,
      membershipPortionThisPaymentCents,
    ),
  };
}

/** Gross cents allocated (card + credits) for a PaymentIntent. */
export function allocationGrossCentsFromPaymentIntent(
  paymentIntent: Pick<{ amount: number; metadata?: Record<string, string | undefined> | null }>,
): number {
  const amountCents =
    typeof paymentIntent.amount === 'number' && Number.isInteger(paymentIntent.amount)
      ? paymentIntent.amount
      : 0;
  const meta = (paymentIntent.metadata ?? {}) as Record<string, string | undefined>;
  const { creditsAppliedCents, originalAmountCents } = parseBalanceIntentCredits(meta);
  return totalCentsForBalanceAllocation({
    paymentIntentAmountCents: amountCents,
    creditsAppliedCents,
    originalAmountCents,
  });
}

/** Membership cents to subtract before allocating the class pool for a PI. */
export function membershipCentsReservedForPaymentIntent(
  paymentIntentAmountCents: number,
  metadata: Record<string, string | undefined> | null | undefined,
  options?: {
    membershipAlreadyPaidCents?: number;
    allocationGrossCents?: number;
    cartMembershipTotalCents?: number;
  },
): number {
  return membershipCentsForThisPaymentIntent(paymentIntentAmountCents, metadata, options)
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

/** Proportional membership slice (legacy); used only for post-payment regression detection. */
export function proportionalMembershipPortionCents(
  paymentIntentAmountCents: number,
  metadata: Record<string, string | undefined> | null | undefined,
): number | null {
  const cartMembershipTotalCents = parseMetadataMembershipAmountCents(metadata);
  const totalAmount = parseInt(String(metadata?.totalAmount ?? '0'), 10);
  if (
    cartMembershipTotalCents <= 0 ||
    !Number.isInteger(paymentIntentAmountCents) ||
    paymentIntentAmountCents <= 0 ||
    !Number.isInteger(totalAmount) ||
    totalAmount <= 0
  ) {
    return null;
  }
  return Math.min(
    paymentIntentAmountCents,
    Math.round(paymentIntentAmountCents * (cartMembershipTotalCents / totalAmount)),
  );
}
