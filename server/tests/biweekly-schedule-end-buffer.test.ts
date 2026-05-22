import {
  GOLDEN_BIWEEKLY_CHECKOUT,
  assertAllDueDatesOnOrBeforeBiweeklyBoundary,
  getExpectedBiweeklyCheckout,
} from '../lib/biweekly-checkout-contract';
import {
  BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS,
  biweeklyInstallmentScheduleEndDate,
  calculateCheckoutBiweeklySchedule,
  calculatePaymentSchedule,
} from '../lib/payment-calculator';

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
    const classEnd = new Date(2030, 7, 1);
    const schedule = calculatePaymentSchedule(500_000, start, classEnd, 'biweekly');
    expect(schedule.frequency).toBe('biweekly');
    assertAllDueDatesOnOrBeforeBiweeklyBoundary(schedule.paymentDates, classEnd);
  });

  it('calculateCheckoutBiweeklySchedule respects the same boundary (golden fixture)', () => {
    const checkout = getExpectedBiweeklyCheckout();
    expect(checkout.numberOfPayments).toBeGreaterThan(1);
    assertAllDueDatesOnOrBeforeBiweeklyBoundary(
      checkout.paymentDates,
      GOLDEN_BIWEEKLY_CHECKOUT.programEnd,
    );
  });

  it('second installment is 14 days after checkout when class starts later', () => {
    const checkoutToday = new Date(2026, 4, 21);
    const classStart = new Date(2026, 8, 13);
    const classEnd = new Date(2027, 4, 30);
    const checkout = calculateCheckoutBiweeklySchedule(
      450_000,
      classStart,
      classEnd,
      checkoutToday,
    );
    expect(checkout.numberOfPayments).toBeGreaterThanOrEqual(2);
    expect(checkout.paymentDates[0].getTime()).toBe(checkoutToday.getTime());
    const secondDue = checkout.paymentDates[1];
    const daysToSecond = Math.round(
      (secondDue.getTime() - checkoutToday.getTime()) / 86400000,
    );
    expect(daysToSecond).toBe(14);
    expect(secondDue.getTime()).toBeLessThan(classStart.getTime());
  });
});
