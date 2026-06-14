import { describe, expect, it } from '@jest/globals';
import { shouldSkipMembershipFulfillmentForPaymentIntent } from '../lib/membership-fulfillment-idempotency';

describe('shouldSkipMembershipFulfillmentForPaymentIntent', () => {
  const PI = 'pi_test_checkout_123';
  const CART_TOTAL = 12500;
  const PORTION = 12500;

  it('does not skip when notes reference PI but amount_paid is still zero (poison pill)', () => {
    expect(
      shouldSkipMembershipFulfillmentForPaymentIntent({
        paymentIntentId: PI,
        existingEnrollment: {
          notes: `Stripe payment via cart checkout (${PI})`,
          amountPaid: 0,
          remainingBalance: CART_TOTAL,
        },
        cartMembershipTotalCents: CART_TOTAL,
        membershipPortionThisPaymentCents: PORTION,
      }),
    ).toBe(false);
  });

  it('skips when membership is paid in full and notes reference PI', () => {
    expect(
      shouldSkipMembershipFulfillmentForPaymentIntent({
        paymentIntentId: PI,
        existingEnrollment: {
          notes: `Stripe payment via cart checkout (${PI})`,
          amountPaid: CART_TOTAL,
          remainingBalance: 0,
        },
        cartMembershipTotalCents: CART_TOTAL,
        membershipPortionThisPaymentCents: PORTION,
      }),
    ).toBe(true);
  });

  it('skips when allocationBreakdown is persisted on payment row', () => {
    expect(
      shouldSkipMembershipFulfillmentForPaymentIntent({
        paymentIntentId: PI,
        persistedBreakdown: {
          membershipCents: PORTION,
          classPoolCents: 150000,
          grossCents: 162500,
          paymentIntentId: PI,
        },
        cartMembershipTotalCents: CART_TOTAL,
        membershipPortionThisPaymentCents: PORTION,
      }),
    ).toBe(true);
  });

  it('skips biweekly installment when paid amount covers this PI portion', () => {
    expect(
      shouldSkipMembershipFulfillmentForPaymentIntent({
        paymentIntentId: PI,
        existingEnrollment: {
          notes: `Stripe payment via cart checkout (${PI})`,
          amountPaid: 481,
          remainingBalance: 12019,
        },
        cartMembershipTotalCents: CART_TOTAL,
        membershipPortionThisPaymentCents: 481,
      }),
    ).toBe(true);
  });

  it('does not skip when a different PI is in notes', () => {
    expect(
      shouldSkipMembershipFulfillmentForPaymentIntent({
        paymentIntentId: PI,
        existingEnrollment: {
          notes: 'Stripe payment via cart checkout (pi_other)',
          amountPaid: 0,
          remainingBalance: CART_TOTAL,
        },
        cartMembershipTotalCents: CART_TOTAL,
        membershipPortionThisPaymentCents: PORTION,
      }),
    ).toBe(false);
  });
});
