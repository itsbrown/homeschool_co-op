import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetAllScheduledPayments = jest.fn();
const mockGetEnrollmentById = jest.fn();
const mockGetSchool = jest.fn();
const mockUpdateScheduledPaymentReminderCount = jest.fn();
const mockUpdateScheduledPaymentStatus = jest.fn();
const mockSendScheduledPaymentReminder = jest.fn();
const mockSendOverduePaymentNotice = jest.fn();

jest.mock('../../../storage', () => ({
  storage: {
    getAllScheduledPayments: (...args: any[]) => mockGetAllScheduledPayments(...args),
    getEnrollmentById: (...args: any[]) => mockGetEnrollmentById(...args),
    getSchool: (...args: any[]) => mockGetSchool(...args),
    updateScheduledPaymentReminderCount: (...args: any[]) => mockUpdateScheduledPaymentReminderCount(...args),
    updateScheduledPaymentStatus: (...args: any[]) => mockUpdateScheduledPaymentStatus(...args),
  },
}));

jest.mock('../../../lib/email-service', () => ({
  sendScheduledPaymentReminder: (...args: any[]) => mockSendScheduledPaymentReminder(...args),
  sendOverduePaymentNotice: (...args: any[]) => mockSendOverduePaymentNotice(...args),
}));

describe('Integration: AutoPay notification guardrails', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-08T12:00:00.000Z'));
    mockGetAllScheduledPayments.mockReset();
    mockGetEnrollmentById.mockReset();
    mockGetSchool.mockReset();
    mockUpdateScheduledPaymentReminderCount.mockReset();
    mockUpdateScheduledPaymentStatus.mockReset();
    mockSendScheduledPaymentReminder.mockReset();
    mockSendOverduePaymentNotice.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits one pre-charge reminder notification for due-soon pending installment', async () => {
    mockGetAllScheduledPayments.mockResolvedValue([
      {
        id: 701,
        parentEmail: 'parent+autopay@test.com',
        status: 'pending',
        scheduledDate: new Date('2026-05-09T12:00:00.000Z'),
        reminderCount: 2,
        amount: 12500,
        enrollmentId: 501,
        installmentNumber: 2,
        totalInstallments: 4,
      },
    ]);
    mockGetEnrollmentById.mockResolvedValue({
      id: 501,
      childName: 'A. Student',
      className: 'Biology',
      schoolId: 9,
    });
    mockGetSchool.mockResolvedValue({ id: 9, name: 'Test School' });

    const { processScheduledPaymentReminders } = await import('../../../services/scheduled-payment-reminders');
    const result = await processScheduledPaymentReminders();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        scheduledPaymentId: 701,
        reminderType: 'upcoming',
        daysUntilDue: 1,
        sent: true,
      }),
    );
    expect(mockSendScheduledPaymentReminder).toHaveBeenCalledTimes(1);
    expect(mockSendScheduledPaymentReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        parentEmail: 'parent+autopay@test.com',
        amount: 12500,
        daysUntilDue: 1,
        paymentId: 701,
      }),
    );
    expect(mockSendOverduePaymentNotice).not.toHaveBeenCalled();
    expect(mockUpdateScheduledPaymentReminderCount).toHaveBeenCalledWith(701, 3);
  });

  it('skips emission when credit-covered installment is already terminal-completed', async () => {
    mockGetAllScheduledPayments.mockResolvedValue([
      {
        id: 702,
        parentEmail: 'parent+creditcovered@test.com',
        status: 'completed',
        scheduledDate: new Date('2026-05-09T12:00:00.000Z'),
        reminderCount: 2,
        amount: 0,
        enrollmentId: 502,
      },
    ]);

    const { processScheduledPaymentReminders } = await import('../../../services/scheduled-payment-reminders');
    const result = await processScheduledPaymentReminders();

    expect(result).toEqual([]);
    expect(mockSendScheduledPaymentReminder).not.toHaveBeenCalled();
    expect(mockSendOverduePaymentNotice).not.toHaveBeenCalled();
    expect(mockUpdateScheduledPaymentReminderCount).not.toHaveBeenCalled();
    expect(mockUpdateScheduledPaymentStatus).not.toHaveBeenCalled();
  });
});
