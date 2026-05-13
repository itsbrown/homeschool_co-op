import { describe, it, expect } from '@jest/globals';
import {
  parseBalanceIntentCredits,
  totalCentsForBalanceAllocation,
  enrollmentPoolCentsForBalanceIntent,
} from '../lib/balance-payment-metadata';

describe('balance-payment-metadata', () => {
  it('parses credit fields from PI metadata', () => {
    expect(parseBalanceIntentCredits(null)).toEqual({
      creditsAppliedCents: 0,
      originalAmountCents: 0,
    });
    expect(
      parseBalanceIntentCredits({
        creditsAppliedCents: '113750',
        originalAmountCents: '400661',
      }),
    ).toEqual({ creditsAppliedCents: 113750, originalAmountCents: 400661 });
  });

  it('uses original gross for allocation when credits were applied', () => {
    const total = totalCentsForBalanceAllocation({
      paymentIntentAmountCents: 286911,
      creditsAppliedCents: 113750,
      originalAmountCents: 400661,
    });
    expect(total).toBe(400661);
    expect(enrollmentPoolCentsForBalanceIntent(total, 0)).toBe(400661);
  });

  it('falls back to PI + credits when original metadata missing', () => {
    expect(
      totalCentsForBalanceAllocation({
        paymentIntentAmountCents: 286911,
        creditsAppliedCents: 113750,
        originalAmountCents: 0,
      }),
    ).toBe(286911 + 113750);
  });

  it('uses PI amount only when no credits', () => {
    expect(
      totalCentsForBalanceAllocation({
        paymentIntentAmountCents: 400661,
        creditsAppliedCents: 0,
        originalAmountCents: 0,
      }),
    ).toBe(400661);
  });
});
