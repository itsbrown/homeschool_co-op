import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockWhere = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockGetDb = jest.fn();
const mockUpdateScheduledPaymentStatus = jest.fn();
const mockGetAllScheduledPayments = jest.fn();

jest.mock('../../../db', () => ({
  getDb: (...args: any[]) => mockGetDb(...args),
}));

jest.mock('../../../storage', () => ({
  storage: {
    updateScheduledPaymentStatus: (...args: any[]) => mockUpdateScheduledPaymentStatus(...args),
    getAllScheduledPayments: (...args: any[]) => mockGetAllScheduledPayments(...args),
  },
}));

describe('Integration: AutoPay runtime policy enforcement', () => {
  beforeEach(() => {
    mockWhere.mockReset();
    mockFrom.mockReset();
    mockSelect.mockReset();
    mockGetDb.mockReset();
    mockUpdateScheduledPaymentStatus.mockReset();
    mockGetAllScheduledPayments.mockReset();

    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockGetDb.mockResolvedValue({ select: mockSelect });

    mockGetAllScheduledPayments.mockImplementation(() => {
      throw new Error('AutoPay execution path must not use in-memory due filtering');
    });
  });

  it('uses DB query due criteria and marks retry-cap/stale candidates as terminal', async () => {
    mockWhere.mockResolvedValue([
      { id: 1001, scheduledDate: new Date('2026-05-08T00:00:00.000Z'), retryCount: 3, status: 'pending' },
      { id: 1002, scheduledDate: new Date('2026-04-01T00:00:00.000Z'), retryCount: 0, status: 'pending' },
      { id: 1003, scheduledDate: new Date('2026-05-08T00:00:00.000Z'), retryCount: 1, status: 'pending' },
    ]);

    const { processAutoPayExecutionPath } = await import('../../../services/scheduled-payment-reminders');
    const results = await processAutoPayExecutionPath(new Date('2026-05-08T12:00:00.000Z'));

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockGetAllScheduledPayments).not.toHaveBeenCalled();

    expect(results).toEqual([
      { scheduledPaymentId: 1001, action: 'skip', reason: 'retry_cap_reached' },
      { scheduledPaymentId: 1002, action: 'skip', reason: 'stale_attempt' },
      { scheduledPaymentId: 1003, action: 'process' },
    ]);

    expect(mockUpdateScheduledPaymentStatus).toHaveBeenCalledTimes(2);
    expect(mockUpdateScheduledPaymentStatus).toHaveBeenCalledWith(1001, 'cancelled');
    expect(mockUpdateScheduledPaymentStatus).toHaveBeenCalledWith(1002, 'cancelled');
  });
});
