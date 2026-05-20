import {
  GOLDEN_BIWEEKLY_CHECKOUT,
  assertAllDueDatesOnOrBeforeBiweeklyBoundary,
  getExpectedBiweeklyCheckout,
} from '../lib/biweekly-checkout-contract';
import {
  BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS,
  biweeklyInstallmentScheduleEndDate,
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
});
