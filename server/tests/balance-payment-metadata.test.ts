import { describe, it, expect } from '@jest/globals';
import {
  parseBalanceIntentCredits,
  totalCentsForBalanceAllocation,
  enrollmentPoolCentsForBalanceIntent,
  membershipCentsForThisPaymentIntent,
  membershipCentsReservedForPaymentIntent,
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

  it('prorates membership reserve on biweekly installment 1 (class + membership cart)', () => {
    const meta = {
      hasMembership: 'true',
      membershipAmount: '17500',
      totalAmount: '167500',
      installmentNumber: '1',
      totalInstallments: '12',
    };
    const piAmount = 13958;
    const { cartMembershipTotalCents, membershipPortionThisPaymentCents } =
      membershipCentsForThisPaymentIntent(piAmount, meta);
    expect(cartMembershipTotalCents).toBe(17500);
    expect(membershipPortionThisPaymentCents).toBe(1458);
    expect(membershipCentsReservedForPaymentIntent(piAmount, meta)).toBe(1458);
    expect(enrollmentPoolCentsForBalanceIntent(piAmount, membershipPortionThisPaymentCents)).toBe(
      12500,
    );
  });
});
