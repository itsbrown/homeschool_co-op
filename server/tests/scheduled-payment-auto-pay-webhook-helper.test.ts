import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { storage } from '../storage';
import { handleScheduledPaymentFailed } from '../services/auto-pay-webhook-helpers';

describe('handleScheduledPaymentFailed (auto-pay webhook helper)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('increments retry and returns pending when under the retry cap', async () => {
    jest.spyOn(storage, 'getScheduledPaymentsByParentEmail').mockResolvedValue([
      { id: 5, retryCount: 0, metadata: {} } as any,
    ]);
    const updateSpy = jest.spyOn(storage, 'updateScheduledPayment').mockResolvedValue({} as any);
    jest.spyOn(storage as any, 'releaseCreditHolds').mockResolvedValue({ releasedCount: 0, totalReleased: 0 });

    const result = await handleScheduledPaymentFailed(5, {
      parentEmail: 'parent@example.com',
      lastPaymentErrorMessage: 'insufficient_funds',
    });

    expect(result.newStatus).toBe('pending');
    expect(result.newRetryCount).toBe(1);
    expect(result.exhausted).toBe(false);
    expect(updateSpy).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        status: 'pending',
        retryCount: 1,
        failureReason: 'insufficient_funds',
        metadata: expect.objectContaining({ pendingCreditsReservation: 0 }),
      }),
    );
  });

  it('releases credit holds when a hold session id is provided', async () => {
    jest.spyOn(storage, 'getScheduledPaymentsByParentEmail').mockResolvedValue([
      { id: 6, retryCount: 0, metadata: { pendingCreditsReservation: 2500 } } as any,
    ]);
    jest.spyOn(storage, 'updateScheduledPayment').mockResolvedValue({} as any);
    const releaseSpy = jest.spyOn(storage as any, 'releaseCreditHolds').mockResolvedValue({
      releasedCount: 1,
      totalReleased: 2500,
    });

    const result = await handleScheduledPaymentFailed(6, {
      parentEmail: 'parent@example.com',
      creditHoldSessionId: 'hold_sess_xyz',
      lastPaymentErrorMessage: 'processing_error',
    });

    expect(releaseSpy).toHaveBeenCalledWith('hold_sess_xyz');
    expect(result.released).toBe(true);
    expect(result.totalReleased).toBe(2500);
    expect(result.creditHoldSessionId).toBe('hold_sess_xyz');
  });

  it('marks failed when the next retry count reaches the cap', async () => {
    jest.spyOn(storage, 'getScheduledPaymentsByParentEmail').mockResolvedValue([
      { id: 7, retryCount: 2, metadata: {} } as any,
    ]);
    const updateSpy = jest.spyOn(storage, 'updateScheduledPayment').mockResolvedValue({} as any);
    jest.spyOn(storage as any, 'releaseCreditHolds').mockResolvedValue({ releasedCount: 0, totalReleased: 0 });

    const result = await handleScheduledPaymentFailed(7, {
      parentEmail: 'parent@example.com',
      lastPaymentErrorMessage: 'canceled',
    });

    expect(result.exhausted).toBe(true);
    expect(result.newStatus).toBe('failed');
    expect(result.newRetryCount).toBe(3);
    expect(updateSpy).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: 'failed',
        retryCount: 3,
        failureReason: expect.stringContaining('3'),
      }),
    );
  });
});
