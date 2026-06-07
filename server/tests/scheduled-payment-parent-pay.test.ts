import { describe, expect, it, jest } from '@jest/globals';
import {
  resolveParentManualPayIntent,
  shouldClearStaleScheduledPaymentIntent,
  pickStripeCustomerIdForParentPay,
} from '../lib/scheduled-payment-parent-pay';
import { paymentIntentBelongsToParent } from '../lib/stripe-search-helpers';

const ctx = {
  parentEmail: 'parent@test.com',
  customerIds: ['cus_test_parent'],
};

describe('paymentIntentBelongsToParent', () => {
  it('matches metadata parentEmail', () => {
    expect(
      paymentIntentBelongsToParent(
        { metadata: { parentEmail: 'parent@test.com' } },
        'parent@test.com',
        [],
      ),
    ).toBe(true);
  });

  it('matches Stripe customer id', () => {
    expect(
      paymentIntentBelongsToParent(
        { customer: 'cus_abc' },
        'other@test.com',
        ['cus_abc'],
      ),
    ).toBe(true);
  });

  it('rejects unrelated PI', () => {
    expect(
      paymentIntentBelongsToParent(
        { customer: 'cus_other', metadata: { parentEmail: 'other@test.com' } },
        'parent@test.com',
        ['cus_test_parent'],
      ),
    ).toBe(false);
  });
});

describe('pickStripeCustomerIdForParentPay', () => {
  it('prefers user-linked customer id', () => {
    expect(
      pickStripeCustomerIdForParentPay('cus_user', ['cus_discovered']),
    ).toBe('cus_user');
  });

  it('falls back to resolved ids', () => {
    expect(pickStripeCustomerIdForParentPay(null, ['cus_discovered'])).toBe('cus_discovered');
  });
});

describe('scheduled-payment-parent-pay', () => {
  it('resumes processing parent_manual PI when Stripe status is requires_payment_method', async () => {
    const retrieve = jest.fn(async () => ({
      id: 'pi_existing',
      client_secret: 'pi_existing_secret',
      status: 'requires_payment_method',
      metadata: { parentEmail: 'parent@test.com' },
      customer: 'cus_test_parent',
    }));
    const stripe = { paymentIntents: { retrieve, cancel: jest.fn() } } as unknown as import('stripe').default;

    const result = await resolveParentManualPayIntent(
      {
        id: 1,
        status: 'processing',
        chargedBy: 'parent_manual',
        parentId: 9,
        stripePaymentIntentId: 'pi_existing',
      },
      9,
      stripe,
      ctx,
    );

    expect(result).toEqual({
      action: 'resume',
      clientSecret: 'pi_existing_secret',
      paymentIntentId: 'pi_existing',
    });
  });

  it('releases when PI belongs to another parent', async () => {
    const stripe = {
      paymentIntents: {
        retrieve: jest.fn(async () => ({
          id: 'pi_other',
          status: 'requires_payment_method',
          metadata: { parentEmail: 'other@test.com' },
          customer: 'cus_other',
        })),
      },
    } as unknown as import('stripe').default;

    const result = await resolveParentManualPayIntent(
      {
        id: 2,
        status: 'processing',
        chargedBy: 'parent_manual',
        parentId: 9,
        stripePaymentIntentId: 'pi_other',
      },
      9,
      stripe,
      ctx,
    );

    expect(result).toEqual({ action: 'release_and_retry' });
  });

  it('clears stale PI on pending rows', async () => {
    const cancel = jest.fn(async () => ({}));
    const stripe = {
      paymentIntents: {
        retrieve: jest.fn(async () => ({
          id: 'pi_stale',
          status: 'requires_payment_method',
          metadata: { parentEmail: 'parent@test.com' },
          customer: 'cus_test_parent',
        })),
        cancel,
      },
    } as unknown as import('stripe').default;

    const shouldClear = await shouldClearStaleScheduledPaymentIntent(
      { id: 3, status: 'pending', stripePaymentIntentId: 'pi_stale' },
      stripe,
      ctx,
    );

    expect(shouldClear).toBe(true);
    expect(cancel).toHaveBeenCalledWith('pi_stale');
  });
});
