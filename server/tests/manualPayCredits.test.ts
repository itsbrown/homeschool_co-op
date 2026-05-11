/**
 * Unit tests for the parent-manual Pay Now credit math.
 *
 * Pins the contract that the manual-pay credit application matches the
 * auto-pay scheduler exactly so a parent can never be charged more than
 * the auto-pay path would have charged for the same installment.
 *
 * Regression context (Task 173):
 *   Grace Mulcahy was charged $271.50 for two installments displayed at
 *   $90.75 each ($181.50 total) because the manual Pay Now flow defaulted
 *   `applyCredits=false` and never auto-applied her $90.00 credit. This
 *   helper is what the new server endpoint uses to compute the
 *   authoritative net charge so the displayed amount and Stripe charge
 *   can never diverge again.
 */

import {
  computeManualPayCredits,
  isChargeAmountDivergent,
  STRIPE_MIN_CHARGE_CENTS,
} from '../utils/manualPayCredits';

describe('computeManualPayCredits — mirrors auto-pay scheduler net-charge math', () => {
  it('applies full credits when credits >= amount (zero-charge path)', () => {
    const result = computeManualPayCredits({ amount: 5000, availableCredits: 5000 });
    expect(result.creditsToApply).toBe(5000);
    expect(result.chargeAmount).toBe(0);
    expect(result.isCreditsOnly).toBe(true);
  });

  it('applies full credits when credits exceed amount, capped at amount', () => {
    const result = computeManualPayCredits({ amount: 5000, availableCredits: 9000 });
    expect(result.creditsToApply).toBe(5000);
    expect(result.chargeAmount).toBe(0);
    expect(result.isCreditsOnly).toBe(true);
  });

  it('partial-cover: credits leave a charge >= $0.50', () => {
    const result = computeManualPayCredits({ amount: 5000, availableCredits: 2000 });
    expect(result.creditsToApply).toBe(2000);
    expect(result.chargeAmount).toBe(3000);
    expect(result.isCreditsOnly).toBe(false);
  });

  it('floor guard: caps credits so charge stays at exactly $0.50 minimum', () => {
    // Naive: 5000 - 4980 = 20¢ which is below the $0.50 Stripe minimum.
    // The floor guard must cap credits to leave exactly 50¢.
    const result = computeManualPayCredits({ amount: 5000, availableCredits: 4980 });
    expect(result.creditsToApply).toBe(4950);
    expect(result.chargeAmount).toBe(STRIPE_MIN_CHARGE_CENTS);
    expect(result.isCreditsOnly).toBe(false);
  });

  it('respects applyCredits=false — no credits applied even when available', () => {
    const result = computeManualPayCredits({
      amount: 5000,
      availableCredits: 5000,
      applyCredits: false,
    });
    expect(result.creditsToApply).toBe(0);
    expect(result.chargeAmount).toBe(5000);
    expect(result.isCreditsOnly).toBe(false);
  });

  it('defaults applyCredits to true when omitted', () => {
    const result = computeManualPayCredits({ amount: 5000, availableCredits: 5000 });
    expect(result.creditsToApply).toBe(5000);
    expect(result.chargeAmount).toBe(0);
    expect(result.isCreditsOnly).toBe(true);
  });

  it('zero credits available — full amount charged', () => {
    const result = computeManualPayCredits({ amount: 5000, availableCredits: 0 });
    expect(result.creditsToApply).toBe(0);
    expect(result.chargeAmount).toBe(5000);
    expect(result.isCreditsOnly).toBe(false);
  });

  it('flags installments below the $0.50 Stripe minimum as tooSmall when no credits cover', () => {
    const result = computeManualPayCredits({ amount: 30, availableCredits: 0 });
    expect(result.tooSmall).toBe(true);
    expect(result.creditsToApply).toBe(0);
    expect(result.chargeAmount).toBe(30);
  });

  it('sub-$0.50 installment fully covered by credits → credits-only path (no tooSmall)', () => {
    // Code-review fix: a 30¢ installment with 100¢ of credit must NOT be
    // rejected as "too small to charge" — credits should clear it via the
    // zero-charge path. Otherwise parents with credits get stuck on tiny
    // remaining balances they can never settle.
    const result = computeManualPayCredits({ amount: 30, availableCredits: 100 });
    expect(result.tooSmall).toBe(false);
    expect(result.isCreditsOnly).toBe(true);
    expect(result.creditsToApply).toBe(30);
    expect(result.chargeAmount).toBe(0);
  });

  it('sub-$0.50 installment with applyCredits=false → still tooSmall (card cannot be charged)', () => {
    // Opt-out of credits + below Stripe minimum → genuinely unchargeable.
    const result = computeManualPayCredits({ amount: 30, availableCredits: 100, applyCredits: false });
    expect(result.tooSmall).toBe(true);
    expect(result.isCreditsOnly).toBe(false);
    expect(result.creditsToApply).toBe(0);
  });

  it('Grace Mulcahy regression: $90.75 installment with $90.00 credit caps at $0.75 charge', () => {
    // Her installment was $90.75 (9075¢) and she had 9000¢ in credits.
    // Naive: 9075 - 9000 = 75¢ which is >= 50¢ minimum, so apply all credits.
    // Grace was charged the full 9075¢ instead of 75¢. The helper proves the
    // right behavior: 9000¢ credits applied, 75¢ charged.
    const result = computeManualPayCredits({ amount: 9075, availableCredits: 9000 });
    expect(result.creditsToApply).toBe(9000);
    expect(result.chargeAmount).toBe(75);
    expect(result.isCreditsOnly).toBe(false);
  });

  it('Grace Mulcahy regression: parent has more credit than installment → fully covered', () => {
    // If Grace had had 10000¢ in credits for a 9075¢ installment, the
    // server must take the credits-only zero-charge path.
    const result = computeManualPayCredits({ amount: 9075, availableCredits: 10000 });
    expect(result.creditsToApply).toBe(9075);
    expect(result.chargeAmount).toBe(0);
    expect(result.isCreditsOnly).toBe(true);
  });
});

describe('isChargeAmountDivergent — divergence guard tolerance', () => {
  it('returns false when expected matches actual exactly', () => {
    expect(isChargeAmountDivergent(75, 75)).toBe(false);
  });

  it('returns false within 1¢ rounding tolerance', () => {
    expect(isChargeAmountDivergent(75, 74)).toBe(false);
    expect(isChargeAmountDivergent(75, 76)).toBe(false);
  });

  it('returns true when expected diverges by more than 1¢', () => {
    expect(isChargeAmountDivergent(75, 9075)).toBe(true);
    expect(isChargeAmountDivergent(9075, 75)).toBe(true);
  });

  it('returns false when expected is null or undefined (client did not opt-in)', () => {
    expect(isChargeAmountDivergent(null, 9075)).toBe(false);
    expect(isChargeAmountDivergent(undefined, 9075)).toBe(false);
  });

  it('returns false when expected is non-finite', () => {
    expect(isChargeAmountDivergent(NaN, 9075)).toBe(false);
    expect(isChargeAmountDivergent(Infinity, 9075)).toBe(false);
  });
});
