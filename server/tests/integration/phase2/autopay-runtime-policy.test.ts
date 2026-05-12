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
    getProgramEnrollmentById: jest.fn(),
    getNotificationsByUserId: jest.fn(async () => []),
    createNotification: jest.fn(async () => ({ id: 1 })),
    getSchool: jest.fn(async () => ({ name: 'Test School' })),
  },
}));

describe('Integration: AutoPay runtime policy enforcement', () => {
  const storageMock = jest.requireMock('../../../storage').storage as {
    getProgramEnrollmentById: jest.Mock;
    getNotificationsByUserId: jest.Mock;
    createNotification: jest.Mock;
  };

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

    storageMock.getProgramEnrollmentById.mockReset();
    storageMock.getNotificationsByUserId.mockReset();
    storageMock.createNotification.mockReset();
    storageMock.getProgramEnrollmentById.mockResolvedValue(undefined);
    storageMock.getNotificationsByUserId.mockResolvedValue([]);
    storageMock.createNotification.mockResolvedValue({ id: 1 });
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

  it('skips with credit_covered when enrollment balance is already zero', async () => {
    storageMock.getProgramEnrollmentById.mockResolvedValue({
      id: 501,
      remainingBalance: 0,
      totalCost: 10000,
      totalPaid: 10000,
      schoolId: 1,
      childId: 1,
      classId: 1,
    });

    mockWhere.mockResolvedValue([
      {
        id: 2001,
        scheduledDate: new Date('2026-05-08T00:00:00.000Z'),
        retryCount: 0,
        status: 'pending',
        enrollmentId: 501,
        parentId: 77,
        parentEmail: 'p@example.com',
        amount: 2500,
        installmentNumber: 1,
        totalInstallments: 4,
      },
    ]);

    const { processAutoPayExecutionPath } = await import('../../../services/scheduled-payment-reminders');
    const results = await processAutoPayExecutionPath(new Date('2026-05-08T12:00:00.000Z'));

    expect(results).toEqual([{ scheduledPaymentId: 2001, action: 'skip', reason: 'credit_covered' }]);
    expect(mockUpdateScheduledPaymentStatus).toHaveBeenCalledWith(2001, 'cancelled');
    expect(storageMock.createNotification).toHaveBeenCalled();
  });
});
