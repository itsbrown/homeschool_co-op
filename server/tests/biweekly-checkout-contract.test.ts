import {
  GOLDEN_BIWEEKLY_CHECKOUT,
  assertAllDueDatesOnOrBeforeBiweeklyBoundary,
  assertBiweeklyPlanMatchesCheckout,
  assertPhaseAmountsSumToTotal,
  buildBiweeklyCheckoutPhases,
  buildBiweeklyPhasesFromInstallmentMetadata,
  getExpectedBiweeklyCheckout,
} from '../lib/biweekly-checkout-contract';
import { biweeklyInstallmentScheduleEndDate } from '../lib/payment-calculator';

describe('biweekly checkout golden contract', () => {
  const checkout = getExpectedBiweeklyCheckout();
  const phases = buildBiweeklyCheckoutPhases(
    GOLDEN_BIWEEKLY_CHECKOUT.totalAmountCents,
    GOLDEN_BIWEEKLY_CHECKOUT.programStart,
    GOLDEN_BIWEEKLY_CHECKOUT.programEnd,
    GOLDEN_BIWEEKLY_CHECKOUT.anchorDate,
  );

  it('golden fixture produces multi-payment biweekly schedule', () => {
    expect(checkout.numberOfPayments).toBeGreaterThanOrEqual(2);
    expect(checkout.totalAmount).toBe(GOLDEN_BIWEEKLY_CHECKOUT.totalAmountCents);
    expect(checkout.firstPaymentAmount).toBe(checkout.paymentAmount);
  });

  it('phases respect end − 14 day boundary and sum to total', () => {
    assertAllDueDatesOnOrBeforeBiweeklyBoundary(
      phases.map((p) => p.dueDate),
      GOLDEN_BIWEEKLY_CHECKOUT.programEnd,
    );
    assertPhaseAmountsSumToTotal(phases, GOLDEN_BIWEEKLY_CHECKOUT.totalAmountCents);
  });

  it('cart payment plan shape matches checkout schedule', () => {
    assertBiweeklyPlanMatchesCheckout(
      {
        id: 'biweekly',
        amount: checkout.paymentAmount,
        numberOfPayments: checkout.numberOfPayments,
        totalAmount: checkout.totalAmount,
        finalPaymentAmount: checkout.finalPaymentAmount,
      },
      checkout,
    );
  });

  it('boundary date is program end minus 14 calendar days', () => {
    const boundary = biweeklyInstallmentScheduleEndDate(GOLDEN_BIWEEKLY_CHECKOUT.programEnd);
    const lastPhase = phases[phases.length - 1];
    expect(lastPhase.dueDate.getTime()).toBeLessThanOrEqual(boundary.getTime());
  });

  it('metadata fallback rebuilds 12 installments for $1675 cart (Heather case)', () => {
    const phases = buildBiweeklyPhasesFromInstallmentMetadata(167_500, 12, new Date(2026, 4, 29));
    expect(phases).toHaveLength(12);
    expect(phases[0].amount).toBe(13_958);
    assertPhaseAmountsSumToTotal(phases, 167_500);
    expect(phases[1].dueDate.getTime() - phases[0].dueDate.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });
});
