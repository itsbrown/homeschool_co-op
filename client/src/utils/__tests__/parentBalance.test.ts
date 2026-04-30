import {
  getEnrollmentEffectiveBalance,
  getMembershipOutstandingBalance,
  computeParentOutstandingTotal,
  computeOutstandingDisplay,
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

/**
 * Task 173 — credit-aware Outstanding Balance display.
 *
 * The displayed "Outstanding" amount on the Payment Management overview must
 * match what the manual Pay Now flow will actually charge after the server
 * auto-applies credits. These tests pin that contract.
 */
describe('computeOutstandingDisplay (credit-aware Outstanding Balance)', () => {
  it('displays gross outstanding when there are no credits', () => {
    const r = computeOutstandingDisplay(18_150, 0);
    expect(r.displayCents).toBe(18_150);
    expect(r.netDueCents).toBe(18_150);
    expect(r.showCreditsLine).toBe(false);
  });

  it('subtracts credits and shows the breakdown when both sides are positive (Grace scenario)', () => {
    // Grace had $181.50 owed and $90.00 in approved credits → display $91.50.
    const r = computeOutstandingDisplay(18_150, 9_000);
    expect(r.displayCents).toBe(9_150);
    expect(r.netDueCents).toBe(9_150);
    expect(r.showCreditsLine).toBe(true);
  });

  it('floors net at zero when credits exceed owed (and still shows the breakdown)', () => {
    const r = computeOutstandingDisplay(5_000, 9_000);
    expect(r.displayCents).toBe(0);
    expect(r.netDueCents).toBe(0);
    expect(r.showCreditsLine).toBe(true);
  });

  it('hides the credits breakdown when credits are zero', () => {
    const r = computeOutstandingDisplay(5_000, 0);
    expect(r.showCreditsLine).toBe(false);
  });

  it('hides the credits breakdown when nothing is owed (no negative-due display)', () => {
    const r = computeOutstandingDisplay(0, 9_000);
    expect(r.displayCents).toBe(0);
    expect(r.showCreditsLine).toBe(false);
  });

  it('treats negative or NaN inputs as zero (defensive)', () => {
    const r1 = computeOutstandingDisplay(-100, 5_000);
    expect(r1.displayCents).toBe(0);
    expect(r1.showCreditsLine).toBe(false);
    const r2 = computeOutstandingDisplay(Number.NaN, Number.NaN);
    expect(r2.displayCents).toBe(0);
    expect(r2.netDueCents).toBe(0);
    expect(r2.showCreditsLine).toBe(false);
  });
});
