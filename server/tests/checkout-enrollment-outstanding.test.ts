import { enrollmentOutstandingCentsForCheckout } from '../lib/checkout-enrollment-balance';

describe('enrollmentOutstandingCentsForCheckout', () => {
  it('prefers effectiveBalance over stale remaining_balance semantics', () => {
    expect(
      enrollmentOutstandingCentsForCheckout({
        totalCost: 391500,
        totalPaid: 0,
        compAmountCents: 0,
        effectiveBalance: 391500,
      }),
    ).toBe(391500);
  });

  it('uses effectiveBalance when DB remaining would be zero but money is still owed', () => {
    expect(
      enrollmentOutstandingCentsForCheckout({
        totalCost: 391500,
        totalPaid: 100000,
        compAmountCents: 0,
        effectiveBalance: 291500,
      }),
    ).toBe(291500);
  });

  it('falls back to computeEffectiveBalance when effectiveBalance is absent', () => {
    expect(
      enrollmentOutstandingCentsForCheckout({
        totalCost: 50000,
        totalPaid: 10000,
        compAmountCents: 0,
      }),
    ).toBe(40000);
  });

  it('floors effectiveBalance to a whole cent', () => {
    expect(
      enrollmentOutstandingCentsForCheckout({
        effectiveBalance: 391500.7,
      }),
    ).toBe(391500);
  });
});
