import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { consumeCreditsFromPaymentIntentMetadata } from '../lib/fulfill-balance-payment-intent';
import { storage } from '../storage';

describe('consumeCreditsFromPaymentIntentMetadata', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const pi = {
    id: 'pi_checkout_abc',
    metadata: {
      creditsAppliedCents: '3000',
      userId: '42',
    },
  };

  it('skips when no credits or user in metadata', async () => {
    const r = await consumeCreditsFromPaymentIntentMetadata({
      id: 'pi_zero',
      metadata: {},
    });
    expect(r).toEqual({ creditsConsumedCents: 0, creditsSkippedAlreadyApplied: true });
  });

  it('skips when checkout description log already covers amount', async () => {
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByCheckoutPaymentIntentId').mockResolvedValue([
      {
        id: 1,
        creditId: 1,
        amountCents: 3000,
        paymentHistoryId: null,
        description: 'Checkout pi_checkout_abc',
        createdAt: new Date(),
      },
    ] as any);

    const useSpy = jest.spyOn(storage, 'useCredits');
    const r = await consumeCreditsFromPaymentIntentMetadata(pi);
    expect(r).toEqual({ creditsConsumedCents: 3000, creditsSkippedAlreadyApplied: true });
    expect(useSpy).not.toHaveBeenCalled();
  });

  it('uses stripe_payment_history id for idempotency, not payments.id', async () => {
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByCheckoutPaymentIntentId').mockResolvedValue([]);
    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue({ id: 999 } as any);
    jest.spyOn(storage, 'getStripePaymentByIntentId').mockResolvedValue({ id: 55 } as any);
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByPaymentHistoryId').mockResolvedValue([
      {
        id: 2,
        creditId: 1,
        amountCents: 3000,
        paymentHistoryId: 55,
        description: 'x',
        createdAt: new Date(),
      },
    ] as any);

    const useSpy = jest.spyOn(storage, 'useCredits');
    const r = await consumeCreditsFromPaymentIntentMetadata(pi);
    expect(r.creditsSkippedAlreadyApplied).toBe(true);
    expect(useSpy).not.toHaveBeenCalled();
  });

  it('consumes remainder and links stripe history id', async () => {
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByCheckoutPaymentIntentId').mockResolvedValue([]);
    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue(undefined);
    jest.spyOn(storage, 'getStripePaymentByIntentId').mockResolvedValue({ id: 77 } as any);
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByPaymentHistoryId').mockResolvedValue([
      {
        id: 3,
        creditId: 1,
        amountCents: 1000,
        paymentHistoryId: 77,
        description: 'x',
        createdAt: new Date(),
      },
    ] as any);
    jest.spyOn(storage, 'useCredits').mockResolvedValue({ usedCredits: [], totalUsed: 2000 });

    const r = await consumeCreditsFromPaymentIntentMetadata(pi);
    expect(r.creditsConsumedCents).toBe(3000);
    expect(r.creditsSkippedAlreadyApplied).toBe(false);
    expect(storage.useCredits).toHaveBeenCalledWith(42, 2000, 77, 'Checkout pi_checkout_abc');
  });

  it('consumes without history row using checkout description only', async () => {
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByCheckoutPaymentIntentId').mockResolvedValue([]);
    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue(undefined);
    jest.spyOn(storage, 'getStripePaymentByIntentId').mockResolvedValue(undefined);
    jest.spyOn(storage, 'useCredits').mockResolvedValue({ usedCredits: [], totalUsed: 3000 });

    const r = await consumeCreditsFromPaymentIntentMetadata(pi);
    expect(r.creditsConsumedCents).toBe(3000);
    expect(storage.useCredits).toHaveBeenCalledWith(42, 3000, undefined, 'Checkout pi_checkout_abc');
  });
});
