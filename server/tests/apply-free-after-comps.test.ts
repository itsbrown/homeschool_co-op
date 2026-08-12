import { describe, it, expect } from '@jest/globals';
import { computeEffectiveBalance } from '@shared/schema';
import { allocatePaymentByBalance } from '../lib/splitIntegerEvenly';
import type { CheckoutDiscountSnapshot } from '../lib/checkout-discount-snapshot';

/**
 * Unit-level invariant for free-after fulfill:
 * after comps zero free lines, balance-aware allocation puts all class pool
 * on owing enrollments (no even-split leak to free lines).
 */
describe('free-after fulfill allocation invariant', () => {
  it('allocates class pool only to non-free enrollments', () => {
    const enrollments = [
      { enrollmentId: 1, effectiveBalanceCents: 0 }, // free via comp
      { enrollmentId: 2, effectiveBalanceCents: 10000 },
      { enrollmentId: 3, effectiveBalanceCents: 12000 },
      { enrollmentId: 4, effectiveBalanceCents: 15000 },
    ];
    const classPool = 37000; // $370 after $80 free
    const allocation = allocatePaymentByBalance(classPool, enrollments);
    const byId = Object.fromEntries(allocation.map((r) => [r.enrollmentId, r.amountCents]));

    expect(byId[1]).toBe(0);
    expect(byId[2] + byId[3] + byId[4]).toBe(37000);
    expect(byId[2]).toBeGreaterThan(0);
    expect(byId[3]).toBeGreaterThan(0);
    expect(byId[4]).toBeGreaterThan(0);
  });

  it('effective balance after free-after comp is zero', () => {
    const totalCost = 8000;
    const totalPaid = 0;
    const comp = 8000;
    expect(computeEffectiveBalance(totalCost, totalPaid, comp)).toBe(0);
  });

  it('snapshot shape includes free_after_threshold for history UI', () => {
    const snapshot: CheckoutDiscountSnapshot = {
      subtotal: 45000,
      discountTotal: 8000,
      freeAfterThree: 8000,
      freeItemIds: ['enrollment-1'],
      freeEnrollmentIds: [1],
      freeEnrollmentAmounts: { '1': 8000 },
      compEnrollmentAmounts: {},
      threshold: 3,
      appliedDiscounts: [
        {
          source: 'free_after_threshold',
          name: 'Free After 3',
          amount: 8000,
          enrollmentIds: [1],
        },
      ],
    };
    expect(snapshot.appliedDiscounts[0].source).toBe('free_after_threshold');
  });
});
