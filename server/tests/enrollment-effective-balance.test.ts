import { describe, expect, it } from '@jest/globals';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';

describe('resolveEnrollmentEffectiveBalance', () => {
  it('prefers effectiveBalance when set, even if remainingBalance is 0', () => {
    expect(
      resolveEnrollmentEffectiveBalance({
        effectiveBalance: 45_000,
        totalCost: 80_000,
        totalPaid: 35_000,
        remainingBalance: 0,
      }),
    ).toBe(45_000);
  });

  it('uses computeEffectiveBalance when effectiveBalance is absent', () => {
    expect(
      resolveEnrollmentEffectiveBalance({
        totalCost: 80_000,
        totalPaid: 35_000,
        compAmountCents: 0,
        remainingBalance: 0,
      }),
    ).toBe(45_000);
  });

  it('subtracts comp when effectiveBalance is absent', () => {
    expect(
      resolveEnrollmentEffectiveBalance({
        totalCost: 10_000,
        totalPaid: 2_000,
        compAmountCents: 3_000,
        remainingBalance: 10_000,
      }),
    ).toBe(5_000);
  });
});
