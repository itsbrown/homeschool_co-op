import { describe, it, expect } from '@jest/globals';
import {
  parseBalanceIntentCredits,
  totalCentsForBalanceAllocation,
  enrollmentPoolCentsForBalanceIntent,
  membershipCentsForThisPaymentIntent,
  membershipCentsReservedForPaymentIntent,
  computeMembershipWaterfallPortion,
  allocateVolunteerCreditsWaterfall,
  proportionalMembershipPortionCents,
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

  it('waterfalls membership on biweekly installment 1 (Heather Jacks case)', () => {
    const meta = {
      hasMembership: 'true',
      membershipAmount: '17500',
      totalAmount: '167500',
      installmentNumber: '1',
      totalInstallments: '12',
    };
    const piAmount = 13958;
    const { cartMembershipTotalCents, membershipPortionThisPaymentCents } =
      membershipCentsForThisPaymentIntent(piAmount, meta, {
        cartMembershipTotalCents: 12500,
        membershipAlreadyPaidCents: 0,
      });
    expect(cartMembershipTotalCents).toBe(12500);
    expect(membershipPortionThisPaymentCents).toBe(12500);
    expect(membershipCentsReservedForPaymentIntent(piAmount, meta, {
      cartMembershipTotalCents: 12500,
      membershipAlreadyPaidCents: 0,
    })).toBe(12500);
    expect(enrollmentPoolCentsForBalanceIntent(piAmount, membershipPortionThisPaymentCents)).toBe(
      1458,
    );
  });

  it('allocates no membership when already paid', () => {
    const meta = { hasMembership: 'true', membershipAmount: '12500', totalAmount: '167500' };
    const { membershipPortionThisPaymentCents } = membershipCentsForThisPaymentIntent(13958, meta, {
      cartMembershipTotalCents: 12500,
      membershipAlreadyPaidCents: 12500,
    });
    expect(membershipPortionThisPaymentCents).toBe(0);
  });

  it('uses gross including credits for membership reserve', () => {
    const meta = {
      hasMembership: 'true',
      membershipAmount: '12500',
      creditsAppliedCents: '5000',
      originalAmountCents: '13958',
    };
    const { membershipPortionThisPaymentCents, allocationGrossCents } =
      membershipCentsForThisPaymentIntent(8958, meta, {
        cartMembershipTotalCents: 12500,
        membershipAlreadyPaidCents: 0,
        allocationGrossCents: 13958,
      });
    expect(allocationGrossCents).toBe(13958);
    expect(membershipPortionThisPaymentCents).toBe(12500);
  });

  it('computeMembershipWaterfallPortion caps at remaining fee', () => {
    expect(
      computeMembershipWaterfallPortion({
        allocationGrossCents: 13958,
        cartMembershipTotalCents: 12500,
        membershipAlreadyPaidCents: 0,
      }),
    ).toBe(12500);
    expect(
      computeMembershipWaterfallPortion({
        allocationGrossCents: 5000,
        cartMembershipTotalCents: 12500,
        membershipAlreadyPaidCents: 0,
      }),
    ).toBe(5000);
  });

  it('allocateVolunteerCreditsWaterfall pays membership first', () => {
    expect(
      allocateVolunteerCreditsWaterfall({ creditsCents: 20000, membershipOwedCents: 12500 }),
    ).toEqual({ membershipCredits: 12500, enrollmentCredits: 7500 });
    expect(
      allocateVolunteerCreditsWaterfall({ creditsCents: 5000, membershipOwedCents: 12500 }),
    ).toEqual({ membershipCredits: 5000, enrollmentCredits: 0 });
  });

  it('proportional helper differs from waterfall for Heather PI', () => {
    const meta = {
      hasMembership: 'true',
      membershipAmount: '17500',
      totalAmount: '167500',
    };
    expect(proportionalMembershipPortionCents(13958, meta)).toBe(1458);
    expect(
      computeMembershipWaterfallPortion({
        allocationGrossCents: 13958,
        cartMembershipTotalCents: 12500,
        membershipAlreadyPaidCents: 0,
      }),
    ).toBe(12500);
  });
});
