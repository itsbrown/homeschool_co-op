import {
  GOLDEN_BIWEEKLY_CHECKOUT,
  assertAllDueDatesOnOrBeforeBiweeklyBoundary,
  assertPhaseAmountsSumToTotal,
  buildBiweeklyCheckoutPhases,
} from '../lib/biweekly-checkout-contract';

describe('stripe biweekly checkout phases (contract)', () => {
  it('last due on or before program end minus 14 days', () => {
    const phases = buildBiweeklyCheckoutPhases(
      467_500,
      new Date(2030, 0, 15),
      new Date(2030, 7, 1),
      new Date(2030, 0, 10, 12, 0, 0),
    );
    expect(phases.length).toBeGreaterThanOrEqual(2);
    assertAllDueDatesOnOrBeforeBiweeklyBoundary(
      phases.map((p) => p.dueDate),
      new Date(2030, 7, 1),
    );
  });

  it('installment amounts sum to total', () => {
    const phases = buildBiweeklyCheckoutPhases(
      467_500,
      new Date(2030, 0, 1),
      new Date(2030, 8, 1),
      GOLDEN_BIWEEKLY_CHECKOUT.anchorDate,
    );
    assertPhaseAmountsSumToTotal(phases, 467_500);
  });
});
