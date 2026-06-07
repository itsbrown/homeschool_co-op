import { describe, expect, it, jest } from '@jest/globals';
import {
  resolveParentManualPayIntent,
  shouldClearStaleScheduledPaymentIntent,
} from '../lib/scheduled-payment-parent-pay';

describe('scheduled-payment-parent-pay', () => {
  it('resumes processing parent_manual PI when Stripe status is requires_payment_method', async () => {
    const retrieve = jest.fn(async () => ({
      id: 'pi_existing',
      client_secret: 'pi_existing_secret',
      status: 'requires_payment_method',
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
    );

    expect(result).toEqual({
      action: 'resume',
      clientSecret: 'pi_existing_secret',
      paymentIntentId: 'pi_existing',
    });
  });

  it('requests release when processing PI is canceled', async () => {
    const stripe = {
      paymentIntents: {
        retrieve: jest.fn(async () => ({
          id: 'pi_dead',
          status: 'canceled',
        })),
      },
    } as unknown as import('stripe').default;

    const result = await resolveParentManualPayIntent(
      {
        id: 2,
        status: 'processing',
        chargedBy: 'parent_manual',
        parentId: 9,
        stripePaymentIntentId: 'pi_dead',
      },
      9,
      stripe,
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
        })),
        cancel,
      },
    } as unknown as import('stripe').default;

    const shouldClear = await shouldClearStaleScheduledPaymentIntent(
      { id: 3, status: 'pending', stripePaymentIntentId: 'pi_stale' },
      stripe,
    );

    expect(shouldClear).toBe(true);
    expect(cancel).toHaveBeenCalledWith('pi_stale');
  });
});
