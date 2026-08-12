import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../storage', () => ({
  storage: {
    getProgramEnrollmentById: jest.fn(),
    updateProgramEnrollment: jest.fn(),
  },
}));

import { storage } from '../storage';
import { computeEffectiveBalance } from '@shared/schema';
import { allocatePaymentByBalance } from '../lib/splitIntegerEvenly';
import {
  CHECKOUT_CART_COMP_REASON,
  applyCartLevelDiscountCompsFromSnapshot,
  type CheckoutDiscountSnapshot,
} from '../lib/checkout-discount-snapshot';

describe('applyCartLevelDiscountCompsFromSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes proportional promo comps and leaves payable matching discounted total', async () => {
    const enrollments: Record<number, any> = {
      1: {
        id: 1,
        totalCost: 150000,
        totalPaid: 0,
        compAmountCents: 0,
        compReason: null,
        status: 'pending_payment',
      },
      2: {
        id: 2,
        totalCost: 150000,
        totalPaid: 0,
        compAmountCents: 0,
        compReason: null,
        status: 'pending_payment',
      },
    };

    (storage.getProgramEnrollmentById as jest.Mock).mockImplementation(async (id: number) => enrollments[id]);
    (storage.updateProgramEnrollment as jest.Mock).mockImplementation(
      async (id: number, patch: Record<string, unknown>) => {
        enrollments[id] = { ...enrollments[id], ...patch };
      },
    );

    const snapshot: CheckoutDiscountSnapshot = {
      subtotal: 300000,
      discountTotal: 60000,
      freeAfterThree: 0,
      freeItemIds: [],
      freeEnrollmentIds: [],
      freeEnrollmentAmounts: {},
      compEnrollmentAmounts: { '1': 30000, '2': 30000 },
      threshold: 3,
      appliedDiscounts: [
        {
          source: 'promo',
          name: 'Angela DeRuyter 20%',
          amount: 60000,
          enrollmentIds: [1, 2],
        },
      ],
    };

    const applied = await applyCartLevelDiscountCompsFromSnapshot(snapshot);
    expect(applied).toEqual([1, 2]);
    expect(enrollments[1].compAmountCents).toBe(30000);
    expect(enrollments[2].compAmountCents).toBe(30000);
    expect(String(enrollments[1].compReason)).toContain(CHECKOUT_CART_COMP_REASON);

    const owed1 = computeEffectiveBalance(
      enrollments[1].totalCost,
      enrollments[1].totalPaid,
      enrollments[1].compAmountCents,
    );
    const owed2 = computeEffectiveBalance(
      enrollments[2].totalCost,
      enrollments[2].totalPaid,
      enrollments[2].compAmountCents,
    );
    expect(owed1 + owed2).toBe(240000);

    const classPool = 240000;
    const allocation = allocatePaymentByBalance(classPool, [
      { enrollmentId: 1, effectiveBalanceCents: owed1 },
      { enrollmentId: 2, effectiveBalanceCents: owed2 },
    ]);
    expect(allocation.reduce((s, r) => s + r.amountCents, 0)).toBe(240000);
  });

  it('is idempotent on webhook replay', async () => {
    const enrollment = {
      id: 9,
      totalCost: 100000,
      totalPaid: 0,
      compAmountCents: 20000,
      compReason: `${CHECKOUT_CART_COMP_REASON}: Promo`,
      status: 'pending_payment',
    };
    (storage.getProgramEnrollmentById as jest.Mock).mockResolvedValue(enrollment);

    const snapshot: CheckoutDiscountSnapshot = {
      subtotal: 100000,
      discountTotal: 20000,
      freeAfterThree: 0,
      freeItemIds: [],
      freeEnrollmentIds: [],
      freeEnrollmentAmounts: {},
      compEnrollmentAmounts: { '9': 20000 },
      threshold: 3,
      appliedDiscounts: [{ source: 'promo', name: 'Promo', amount: 20000 }],
    };

    await applyCartLevelDiscountCompsFromSnapshot(snapshot);
    expect(storage.updateProgramEnrollment).not.toHaveBeenCalled();
  });
});
