import {
  BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS,
  biweeklyInstallmentScheduleEndDate,
  calculateCheckoutBiweeklySchedule,
  calculatePaymentSchedule,
} from '../lib/payment-calculator';

function utcCalendarDay(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

describe('biweekly schedule ends before class end (2-week buffer)', () => {
  it('biweeklyInstallmentScheduleEndDate matches UTC-midnight minus 14 days (implementation contract)', () => {
    const classEnd = new Date(2030, 6, 15);
    const utcEnd = Date.UTC(
      classEnd.getFullYear(),
      classEnd.getMonth(),
      classEnd.getDate(),
    );
    const expected = new Date(utcEnd - BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS * 86400000);
    expect(biweeklyInstallmentScheduleEndDate(classEnd).getTime()).toBe(expected.getTime());
  });

  it('calculatePaymentSchedule(biweekly) keeps every due date on or before that boundary', () => {
    const start = new Date(2030, 0, 1);
    const classEnd = new Date(2030, 7, 1); // Aug 1
    const boundary = biweeklyInstallmentScheduleEndDate(classEnd);
    const schedule = calculatePaymentSchedule(500_000, start, classEnd, 'biweekly');
    expect(schedule.frequency).toBe('biweekly');
    for (const d of schedule.paymentDates) {
      expect(utcCalendarDay(d)).toBeLessThanOrEqual(utcCalendarDay(boundary));
    }
  });

  it('calculateCheckoutBiweeklySchedule respects the same boundary on class-anchored dates', () => {
    const anchor = new Date(2030, 0, 10, 12, 0, 0);
    const classStart = new Date(2030, 1, 1);
    const classEnd = new Date(2030, 9, 1);
    const boundary = biweeklyInstallmentScheduleEndDate(classEnd);
    const schedule = calculateCheckoutBiweeklySchedule(400_000, classStart, classEnd, anchor);
    expect(schedule.numberOfPayments).toBeGreaterThan(1);
    for (const d of schedule.paymentDates) {
      expect(utcCalendarDay(d)).toBeLessThanOrEqual(utcCalendarDay(boundary));
    }
  });
});
