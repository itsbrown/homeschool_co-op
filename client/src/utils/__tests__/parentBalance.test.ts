import {
  getEnrollmentEffectiveBalance,
  getMembershipOutstandingBalance,
  computeParentOutstandingTotal,
} from '../parentBalance';

/**
 * Regression tests for the parent Payment Management page's outstanding
 * balance gate.
 *
 * The original bug surfaced "$0 outstanding" for parents whose enrollments
 * were on a Stripe-managed payment plan, because `enrollment.remaining_balance`
 * is intentionally stored as `0` on those rows. The UI now derives outstanding
 * balances from the DB-generated `effective_balance` column (the same value
 * the cart snapshot exposes as `payableAmount`).
 *
 * These tests pin that contract on the helper that the Payment Management
 * page wires through.
 */
describe('getEnrollmentEffectiveBalance', () => {
  it('returns effectiveBalance when present, even if remainingBalance is 0', () => {
    // This is the EXACT regression scenario: a Stripe-managed payment plan
    // where remainingBalance=0 (intentionally) but the family still owes
    // $125.00. The helper must surface the real balance, not silently zero-out.
    const enrollment = {
      effectiveBalance: 12_500,
      remainingBalance: 0,
      totalCost: 50_000,
      totalPaid: 37_500,
      compAmountCents: 0,
    };
    expect(getEnrollmentEffectiveBalance(enrollment)).toBe(12_500);
  });

  it('NEVER reads remainingBalance even when effectiveBalance is missing', () => {
    // If a regression makes the helper fall through to remainingBalance, this
    // test fails — the expected fallback formula is totalCost - totalPaid - comp.
    const enrollment = {
      remainingBalance: 999_999, // bogus value to trip a regression
      totalCost: 30_000,
      totalPaid: 10_000,
      compAmountCents: 5_000,
    };
    expect(getEnrollmentEffectiveBalance(enrollment)).toBe(15_000);
  });

  it('falls back to totalCost - totalPaid - compAmountCents when effectiveBalance missing', () => {
    expect(
      getEnrollmentEffectiveBalance({
        totalCost: 20_000,
        totalPaid: 5_000,
        compAmountCents: 0,
      }),
    ).toBe(15_000);
  });

  it('clamps the fallback at 0 (never returns a negative balance)', () => {
    expect(
      getEnrollmentEffectiveBalance({
        totalCost: 10_000,
        totalPaid: 25_000,
        compAmountCents: 0,
      }),
    ).toBe(0);
  });

  it('respects an effectiveBalance of exactly 0 (not a falsy fallback)', () => {
    // Using `??` (not `||`) is critical so a genuine $0 balance is preserved.
    expect(
      getEnrollmentEffectiveBalance({
        effectiveBalance: 0,
        totalCost: 10_000,
        totalPaid: 10_000,
      }),
    ).toBe(0);
  });

  it('returns 0 for null/undefined enrollment', () => {
    expect(getEnrollmentEffectiveBalance(null)).toBe(0);
    expect(getEnrollmentEffectiveBalance(undefined)).toBe(0);
  });
});

describe('getMembershipOutstandingBalance', () => {
  it('uses remainingBalance when present', () => {
    expect(
      getMembershipOutstandingBalance({
        remainingBalance: 5_000,
        amount: 10_000,
        amountPaid: 5_000,
        status: 'active',
      }),
    ).toBe(5_000);
  });

  it('falls back to amount - amountPaid when remainingBalance missing', () => {
    expect(
      getMembershipOutstandingBalance({
        amount: 10_000,
        amountPaid: 3_000,
        status: 'active',
      }),
    ).toBe(7_000);
  });

  it('skips expired memberships', () => {
    expect(
      getMembershipOutstandingBalance({
        remainingBalance: 5_000,
        status: 'expired',
      }),
    ).toBe(0);
  });

  it('skips suspended memberships', () => {
    expect(
      getMembershipOutstandingBalance({
        remainingBalance: 5_000,
        status: 'suspended',
      }),
    ).toBe(0);
  });

  it('includes grace_period memberships (overdue but still active)', () => {
    expect(
      getMembershipOutstandingBalance({
        remainingBalance: 5_000,
        status: 'grace_period',
      }),
    ).toBe(5_000);
  });
});

describe('computeParentOutstandingTotal', () => {
  it('totals enrollments via effectiveBalance — even when remainingBalance is 0', () => {
    // Mixed scenario: one Stripe-managed plan (remainingBalance=0,
    // effectiveBalance=$125) and one regular enrollment with no balance yet.
    // The Outstanding Balance card MUST show $125.00, not $0.00.
    const enrollments = [
      {
        effectiveBalance: 12_500,
        remainingBalance: 0,
        totalCost: 50_000,
        totalPaid: 37_500,
      },
      {
        effectiveBalance: 0,
        totalCost: 10_000,
        totalPaid: 10_000,
      },
    ];
    expect(computeParentOutstandingTotal(enrollments)).toBe(12_500);
  });

  it('adds active memberships on top of enrollments', () => {
    const enrollments = [{ effectiveBalance: 5_000 }];
    const memberships = [
      { remainingBalance: 2_500, status: 'active' },
      { remainingBalance: 2_500, status: 'expired' }, // skipped
    ];
    expect(computeParentOutstandingTotal(enrollments, memberships)).toBe(7_500);
  });

  it('handles null / undefined / empty inputs gracefully', () => {
    expect(computeParentOutstandingTotal(null)).toBe(0);
    expect(computeParentOutstandingTotal(undefined, undefined)).toBe(0);
    expect(computeParentOutstandingTotal([], [])).toBe(0);
  });
});
