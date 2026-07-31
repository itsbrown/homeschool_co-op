import { describe, it, expect } from '@jest/globals';
import {
  buildCartItemEnrollmentMap,
  buildCheckoutDiscountSnapshot,
  parseCheckoutDiscountSnapshot,
  resolveFreeEnrollmentIds,
} from '../lib/checkout-discount-snapshot';
import type { CartItem, CartPricingResult } from '../utils/cart-pricing';

describe('checkout-discount-snapshot', () => {
  const pricing: CartPricingResult = {
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
      pricing,
      freeEnrollmentIds: [101],
      freeEnrollmentAmounts: { 101: 8000 },
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.discountTotal).toBe(8000);
    expect(snapshot!.appliedDiscounts[0]).toMatchObject({
      source: 'free_after_threshold',
      name: 'Free After 3',
      amount: 8000,
      enrollmentIds: [101],
    });
  });

  it('round-trips JSON metadata parsing', () => {
    const snapshot = buildCheckoutDiscountSnapshot({
      pricing,
      freeEnrollmentIds: [101],
      freeEnrollmentAmounts: { 101: 8000 },
    });
    const parsed = parseCheckoutDiscountSnapshot(JSON.stringify(snapshot));
    expect(parsed?.freeEnrollmentIds).toEqual([101]);
    expect(parsed?.appliedDiscounts[0]?.source).toBe('free_after_threshold');
  });
});
