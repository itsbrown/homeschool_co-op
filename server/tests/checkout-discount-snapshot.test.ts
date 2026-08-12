import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../storage', () => ({
  storage: {
    getProgramEnrollmentById: jest.fn(),
    updateProgramEnrollment: jest.fn(),
  },
}));

import {
  allocateCartLevelDiscountComps,
  buildCartItemEnrollmentMap,
  buildCheckoutDiscountSnapshot,
  checkoutRemainingBalanceCentsForPi,
  parseCheckoutDiscountSnapshot,
  resolveFreeEnrollmentIds,
} from '../lib/checkout-discount-snapshot';
import type { CartItem, CartPricingResult } from '../utils/cart-pricing';

describe('checkout-discount-snapshot', () => {
  const freeAfterPricing: CartPricingResult = {
    subtotal: 45000,
    total: 37000,
    itemPrices: [
      { classId: 1, price: 8000 },
      { classId: 2, price: 10000 },
      { classId: 3, price: 12000 },
      { classId: 4, price: 15000 },
    ],
    discounts: {
      siblingDiscount: 0,
      freeAfterThree: 8000,
      appliedDiscounts: [],
      totalDiscountAmount: 8000,
      discountedChildIds: [],
      freeItemIds: ['enrollment-101'],
    },
    schoolSettings: {
      freeAfterThresholdEnabled: true,
      freeAfterThreshold: 3,
      siblingDiscountRate: 0,
    },
  };

  it('maps free cart item ids to enrollment ids', () => {
    const items: CartItem[] = [
      { id: 'enrollment-101', classId: 1, childId: 1, childName: 'A', enrollmentId: 101 },
      { id: 'enrollment-102', classId: 2, childId: 2, childName: 'B', enrollmentId: 102 },
    ];
    const map = buildCartItemEnrollmentMap(items, [101, 102]);
    expect(resolveFreeEnrollmentIds(['enrollment-101'], map)).toEqual([101]);
  });

  it('builds a history-friendly snapshot with free_after_threshold source', () => {
    const snapshot = buildCheckoutDiscountSnapshot({
      pricing: freeAfterPricing,
      freeEnrollmentIds: [101],
      freeEnrollmentAmounts: { 101: 8000 },
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.discountTotal).toBe(8000);
    expect(snapshot!.compEnrollmentAmounts).toEqual({});
    expect(snapshot!.appliedDiscounts[0]).toMatchObject({
      source: 'free_after_threshold',
      name: 'Free After 3',
      amount: 8000,
      enrollmentIds: [101],
    });
  });

  it('round-trips JSON metadata parsing including compEnrollmentAmounts', () => {
    const snapshot = buildCheckoutDiscountSnapshot({
      pricing: freeAfterPricing,
      freeEnrollmentIds: [101],
      freeEnrollmentAmounts: { 101: 8000 },
    });
    const parsed = parseCheckoutDiscountSnapshot(JSON.stringify(snapshot));
    expect(parsed?.freeEnrollmentIds).toEqual([101]);
    expect(parsed?.compEnrollmentAmounts).toEqual({});
    expect(parsed?.appliedDiscounts[0]?.source).toBe('free_after_threshold');
  });

  it('allocates percentage promo proportionally across enrollments', () => {
    // 20% of $1500+$1500 = $600 → $300 each
    const allocated = allocateCartLevelDiscountComps(60000, [
      { enrollmentId: 1, outstandingCents: 150000 },
      { enrollmentId: 2, outstandingCents: 150000 },
    ]);
    expect(allocated[1] + allocated[2]).toBe(60000);
    expect(allocated[1]).toBe(30000);
    expect(allocated[2]).toBe(30000);
  });

  it('builds promo snapshot with compEnrollmentAmounts for money path', () => {
    const pricing: CartPricingResult = {
      subtotal: 300000,
      total: 240000,
      itemPrices: [
        { classId: 1, price: 150000 },
        { classId: 2, price: 150000 },
      ],
      discounts: {
        siblingDiscount: 0,
        freeAfterThree: 0,
        appliedDiscounts: [
          {
            id: 15,
            name: 'Angela DeRuyter 20%',
            type: 'percentage',
            value: 20,
            discountAmount: 60000,
            priority: 100,
            sourceType: 'promo',
          },
        ],
        totalDiscountAmount: 60000,
        discountedChildIds: [],
        freeItemIds: [],
      },
      schoolSettings: {
        freeAfterThresholdEnabled: false,
        freeAfterThreshold: 3,
        siblingDiscountRate: 0,
      },
    };

    const snapshot = buildCheckoutDiscountSnapshot({
      pricing,
      freeEnrollmentIds: [],
      freeEnrollmentAmounts: {},
      enrollmentOutstandings: [
        { enrollmentId: 741, outstandingCents: 150000 },
        { enrollmentId: 742, outstandingCents: 150000 },
      ],
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.discountTotal).toBe(60000);
    expect(snapshot!.freeAfterThree).toBe(0);
    expect(Number(snapshot!.compEnrollmentAmounts['741'])).toBe(30000);
    expect(Number(snapshot!.compEnrollmentAmounts['742'])).toBe(30000);
    expect(snapshot!.appliedDiscounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'promo',
          name: 'Angela DeRuyter 20%',
          amount: 60000,
          enrollmentIds: expect.arrayContaining([741, 742]),
        }),
      ]),
    );

    const freeSet = new Set<number>();
    const pi1 = checkoutRemainingBalanceCentsForPi({
      enrollmentId: 741,
      outstandingCents: 150000,
      freeEnrollmentIdSet: freeSet,
      compEnrollmentAmounts: snapshot!.compEnrollmentAmounts,
    });
    const pi2 = checkoutRemainingBalanceCentsForPi({
      enrollmentId: 742,
      outstandingCents: 150000,
      freeEnrollmentIdSet: freeSet,
      compEnrollmentAmounts: snapshot!.compEnrollmentAmounts,
    });
    expect(pi1 + pi2).toBe(240000);
    expect(pi1 + pi2).toBe(pricing.total);
  });

  it('parses legacy snapshots missing compEnrollmentAmounts as empty', () => {
    const parsed = parseCheckoutDiscountSnapshot({
      subtotal: 10000,
      discountTotal: 2000,
      freeAfterThree: 0,
      freeItemIds: [],
      freeEnrollmentIds: [],
      freeEnrollmentAmounts: {},
      threshold: 3,
      appliedDiscounts: [{ source: 'promo', name: 'Old', amount: 2000 }],
    });
    expect(parsed?.compEnrollmentAmounts).toEqual({});
  });
});
