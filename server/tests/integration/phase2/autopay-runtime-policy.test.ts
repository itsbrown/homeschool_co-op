import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type AutoPayMetricEvent } from '../../../services/autopay-observability';

const mockWhere = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockGetDb = jest.fn();
const mockUpdateScheduledPaymentStatus = jest.fn();
const mockGetAllScheduledPayments = jest.fn();
const mockCreateNotification = jest.fn();
const mockGetAllNotifications = jest.fn();
const existingNotifications: Array<{ targetData?: Record<string, unknown> }> = [];

jest.mock('../../../db', () => ({
  getDb: (...args: any[]) => mockGetDb(...args),
}));

jest.mock('../../../storage', () => ({
  storage: {
    updateScheduledPaymentStatus: (...args: any[]) => mockUpdateScheduledPaymentStatus(...args),
    getAllScheduledPayments: (...args: any[]) => mockGetAllScheduledPayments(...args),
    createNotification: (...args: any[]) => mockCreateNotification(...args),
    getAllNotifications: (...args: any[]) => mockGetAllNotifications(...args),
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
    mockCreateNotification.mockReset();
    mockGetAllNotifications.mockReset();
    existingNotifications.length = 0;

    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockGetDb.mockResolvedValue({ select: mockSelect });

    mockGetAllScheduledPayments.mockImplementation(() => {
      throw new Error('AutoPay execution path must not use in-memory due filtering');
    });
    mockCreateNotification.mockImplementation(async (payload: any) => {
      existingNotifications.push({ targetData: payload?.targetData ?? {} });
      return { id: existingNotifications.length, ...payload };
    });
    mockGetAllNotifications.mockImplementation(async () => [...existingNotifications]);
  });

  it('uses DB query due criteria and marks retry-cap/stale candidates as terminal', async () => {
    const metrics: AutoPayMetricEvent[] = [];
    mockWhere.mockResolvedValue([
      { id: 1001, scheduledDate: new Date('2026-05-08T00:00:00.000Z'), retryCount: 3, status: 'pending' },
      { id: 1002, scheduledDate: new Date('2026-04-01T00:00:00.000Z'), retryCount: 0, status: 'pending' },
      { id: 1003, scheduledDate: new Date('2026-05-08T00:00:00.000Z'), retryCount: 1, status: 'pending' },
    ]);

    const { processAutoPayExecutionPath } = await import('../../../services/scheduled-payment-reminders');
    const results = await processAutoPayExecutionPath(new Date('2026-05-08T12:00:00.000Z'), {
      emit: (event) => metrics.push(event),
    });

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
    expect(metrics).toContainEqual({
      metric: 'autopay_backlog_total',
      labels: {
        source: 'execution_path',
        reason_code: 'stuck_processing_backlog',
        backlog_size: 3,
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_failure_total',
      labels: {
        source: 'execution_path',
        action: 'skip',
        reason_code: 'retry_cap_reached',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_failure_total',
      labels: {
        source: 'execution_path',
        action: 'skip',
        reason_code: 'stale_attempt',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_transition_total',
      labels: {
        source: 'execution_path',
        action: 'process',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_failure_total',
      labels: {
        source: 'policy',
        action: 'skip',
        reason_code: 'retry_cap_reached',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_failure_total',
      labels: {
        source: 'policy',
        action: 'skip',
        reason_code: 'stale_attempt',
      },
    });
  });

  it('emits pre-charge notification once for a replayed due candidate', async () => {
    mockWhere.mockResolvedValue([
      {
        id: 2001,
        scheduledDate: new Date('2026-05-08T00:00:00.000Z'),
        retryCount: 0,
        status: 'pending',
        parentId: 7001,
        parentEmail: 'autopay-parent@test.com',
        amount: 2500,
        metadata: {},
      },
    ]);

    const { processAutoPayExecutionPath } = await import('../../../services/scheduled-payment-reminders');
    await processAutoPayExecutionPath(new Date('2026-05-08T12:00:00.000Z'));
    await processAutoPayExecutionPath(new Date('2026-05-08T12:00:00.000Z'));

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'AutoPay charge scheduled',
        targetData: expect.objectContaining({
          userIds: [7001],
          scheduledPaymentId: 2001,
          autopayEventType: 'pre_charge_notice',
        }),
      }),
    );
  });

  it('emits credit-covered skip notification once and remains replay-safe', async () => {
    mockWhere.mockResolvedValue([
      {
        id: 3001,
        scheduledDate: new Date('2026-05-08T00:00:00.000Z'),
        retryCount: 0,
        status: 'pending',
        parentId: 8001,
        parentEmail: 'credit-parent@test.com',
        amount: 0,
        metadata: {},
      },
    ]);

    const { processAutoPayExecutionPath } = await import('../../../services/scheduled-payment-reminders');
    const firstRun = await processAutoPayExecutionPath(new Date('2026-05-08T12:00:00.000Z'));
    const secondRun = await processAutoPayExecutionPath(new Date('2026-05-08T12:00:00.000Z'));

    expect(firstRun).toEqual([{ scheduledPaymentId: 3001, action: 'skip', reason: 'credit_covered' }]);
    expect(secondRun).toEqual([{ scheduledPaymentId: 3001, action: 'skip', reason: 'credit_covered' }]);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subject: 'AutoPay skipped',
        targetData: expect.objectContaining({
          userIds: [8001],
          scheduledPaymentId: 3001,
          autopayEventType: 'credit_covered_skip_notice',
        }),
      }),
    );
  });
});
