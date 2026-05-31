import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ensureScheduledPaymentCreditsConsumed,
  scheduledPaymentCreditUsageDescription,
} from '../lib/ensure-scheduled-payment-credits-consumed';
import { storage } from '../storage';

describe('ensureScheduledPaymentCreditsConsumed', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('builds stable usage descriptions for log lookup', () => {
    expect(scheduledPaymentCreditUsageDescription(42, '2', '4')).toBe(
      'Scheduled payment 42 — installment 2/4',
    );
  });

  it('skips when usage logs already cover creditsAppliedCents', async () => {
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByScheduledPaymentId').mockResolvedValue([
      { id: 1, creditId: 10, amountCents: 5000, paymentHistoryId: null, description: null, createdAt: new Date() },
    ] as any);

    const finalizeSpy = jest.spyOn(storage, 'finalizeCreditHolds');
    const useSpy = jest.spyOn(storage, 'useCredits');

    const result = await ensureScheduledPaymentCreditsConsumed({
      scheduledPaymentId: 99,
      userId: 7,
      creditsAppliedCents: 5000,
    });

    expect(result).toEqual({ consumedCents: 5000, skippedAlreadyApplied: true });
    expect(finalizeSpy).not.toHaveBeenCalled();
    expect(useSpy).not.toHaveBeenCalled();
  });

  it('FIFO-consumes remainder when no hold session', async () => {
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByScheduledPaymentId').mockResolvedValue([]);
    jest.spyOn(storage, 'useCredits').mockResolvedValue({
      usedCredits: [],
      totalUsed: 2000,
    });

    const result = await ensureScheduledPaymentCreditsConsumed({
      scheduledPaymentId: 12,
      userId: 3,
      creditsAppliedCents: 2000,
      installmentNumber: '1',
      totalInstallments: '3',
    });

    expect(result.consumedCents).toBe(2000);
    expect(storage.useCredits).toHaveBeenCalledWith(
      3,
      2000,
      undefined,
      'Scheduled payment 12 — installment 1/3',
    );
  });

  it('finalizes holds then tops up with useCredits if needed', async () => {
    jest
      .spyOn(storage, 'getUnifiedCreditUsageLogsByScheduledPaymentId')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 2, creditId: 11, amountCents: 1500, paymentHistoryId: null, description: null, createdAt: new Date() },
      ] as any);
    jest.spyOn(storage, 'finalizeCreditHolds').mockResolvedValue({
      finalizedCount: 1,
      totalFinalized: 1500,
      usageLogs: [],
    });
    jest.spyOn(storage, 'useCredits').mockResolvedValue({ usedCredits: [], totalUsed: 500 });

    const result = await ensureScheduledPaymentCreditsConsumed({
      scheduledPaymentId: 5,
      userId: 2,
      creditsAppliedCents: 2000,
      creditHoldSessionId: 'hold_sess_abc',
    });

    expect(storage.finalizeCreditHolds).toHaveBeenCalled();
    expect(result.consumedCents).toBe(2000);
  });
});
