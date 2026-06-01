import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { cancelPendingScheduledAfterEnrollmentPayoff } from '../../lib/cancel-pending-scheduled-after-payoff';

const getProgramEnrollmentById = jest.fn();
const deletePendingScheduledPaymentsByEnrollmentId = jest.fn();

jest.mock('../../storage', () => ({
  storage: {
    getProgramEnrollmentById: (...args: unknown[]) => getProgramEnrollmentById(...args),
    deletePendingScheduledPaymentsByEnrollmentId: (...args: unknown[]) =>
      deletePendingScheduledPaymentsByEnrollmentId(...args),
  },
}));

describe('cancelPendingScheduledAfterEnrollmentPayoff', () => {
  beforeEach(() => {
    getProgramEnrollmentById.mockReset();
    deletePendingScheduledPaymentsByEnrollmentId.mockReset();
  });

  it('cancels pending rows when enrollment balance is zero', async () => {
    getProgramEnrollmentById.mockResolvedValue({
      id: 351,
      totalCost: 130_000,
      totalPaid: 130_000,
      compAmountCents: 0,
    });
    deletePendingScheduledPaymentsByEnrollmentId.mockResolvedValue(5);

    const count = await cancelPendingScheduledAfterEnrollmentPayoff([351]);

    expect(count).toBe(5);
    expect(deletePendingScheduledPaymentsByEnrollmentId).toHaveBeenCalledWith(351);
  });

  it('skips cancel when enrollment still owes', async () => {
    getProgramEnrollmentById.mockResolvedValue({
      id: 351,
      totalCost: 130_000,
      totalPaid: 24_583,
      compAmountCents: 0,
    });

    const count = await cancelPendingScheduledAfterEnrollmentPayoff([351]);

    expect(count).toBe(0);
    expect(deletePendingScheduledPaymentsByEnrollmentId).not.toHaveBeenCalled();
  });
});
