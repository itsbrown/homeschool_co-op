/**
 * Server-authoritative credit application for parent-initiated manual payments.
 * Mirrors the auto-pay scheduler so a parent clicking "Pay Now" can never be
 * charged more than the auto-pay path would charge for the same installment.
 *
 * Rules (in order):
 *   1. Credits cover full amount → creditsToApply = amount, chargeAmount = 0
 *      (runs BEFORE the $0.50 floor check so sub-min installments can still
 *      be cleared by credits with no card charge).
 *   2. applyCredits === false → no credits applied, full amount charged.
 *   3. Credits leave charge >= $0.50 → take all available credits.
 *   4. Otherwise → cap credits so chargeAmount = $0.50 (Stripe min guard).
 *   5. Amount < $0.50 with insufficient credits → tooSmall = true.
 */

export const STRIPE_MIN_CHARGE_CENTS = 50;

export interface ManualPayCreditDecision {
  /** Original installment amount in cents (server-authoritative). */
  originalAmount: number;
  /** Credits actually available for this user, in cents. */
  availableCredits: number;
  /** Credits the server will apply to this installment. */
  creditsToApply: number;
  /** Net amount to charge the card after credits. */
  chargeAmount: number;
  /** True iff credits fully cover the installment (zero-charge path). */
  isCreditsOnly: boolean;
  /** True iff installment amount is below the Stripe minimum and cannot be charged. */
  tooSmall: boolean;
}

export function computeManualPayCredits(input: {
  amount: number;
  availableCredits: number;
  applyCredits?: boolean;
}): ManualPayCreditDecision {
  const amount = Math.max(0, Math.round(input.amount || 0));
  const availableCredits = Math.max(0, Math.round(input.availableCredits || 0));
  const applyCredits = input.applyCredits !== false; // default true

  // RULE 1 (must run first): credits-only path takes precedence over the
  // Stripe minimum check so a $0.30 installment with $90 of credit can still
  // be settled via the zero-charge path.
  if (applyCredits && availableCredits >= amount && amount > 0) {
    return {
      originalAmount: amount,
      availableCredits,
      creditsToApply: amount,
      chargeAmount: 0,
      isCreditsOnly: true,
      tooSmall: false,
    };
  }

  // No credit cover available — installments below the Stripe minimum cannot
  // be charged on a card. Caller should surface a "credit-only or wait until
  // it accrues" message.
  if (amount < STRIPE_MIN_CHARGE_CENTS) {
    return {
      originalAmount: amount,
      availableCredits,
      creditsToApply: 0,
      chargeAmount: amount,
      isCreditsOnly: false,
      tooSmall: true,
    };
  }

  if (!applyCredits || availableCredits <= 0) {
    return {
      originalAmount: amount,
      availableCredits,
      creditsToApply: 0,
      chargeAmount: amount,
      isCreditsOnly: false,
      tooSmall: false,
    };
  }

  const maxForPartial = amount - STRIPE_MIN_CHARGE_CENTS;
  let creditsToApply = 0;
  let chargeAmount = amount;

  if (availableCredits >= amount) {
    creditsToApply = amount;
    chargeAmount = 0;
  } else if (availableCredits <= maxForPartial) {
    creditsToApply = availableCredits;
    chargeAmount = amount - availableCredits;
  } else if (maxForPartial > 0) {
    // Floor guard: applying all credits would drop charge below $0.50.
    // Cap credits so charge stays at exactly $0.50.
    creditsToApply = maxForPartial;
    chargeAmount = STRIPE_MIN_CHARGE_CENTS;
  }

  return {
    originalAmount: amount,
    availableCredits,
    creditsToApply,
    chargeAmount,
    isCreditsOnly: chargeAmount === 0 && creditsToApply > 0,
    tooSmall: false,
  };
}

/**
 * Tolerance used when comparing the client-supplied `expectedChargeAmount`
 * against the server-authoritative charge. 1 cent absorbs any floating-point
 * rounding the client may have introduced, while still catching real divergence.
 */
export const CHARGE_DIVERGENCE_TOLERANCE_CENTS = 1;

export function isChargeAmountDivergent(
  expected: number | null | undefined,
  actual: number,
): boolean {
  if (typeof expected !== 'number' || !Number.isFinite(expected)) {
    return false;
  }
  return Math.abs(Math.round(expected) - Math.round(actual)) > CHARGE_DIVERGENCE_TOLERANCE_CENTS;
}
