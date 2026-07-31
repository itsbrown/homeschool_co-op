import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../storage', () => ({
  storage: {
    getSchool: jest.fn(),
    getDiscountsBySchoolId: jest.fn(),
    getUser: jest.fn(),
    getClassById: jest.fn(),
    getProgramEnrollmentById: jest.fn(),
  },
}));

jest.mock('../db', () => ({
  getDb: jest.fn(async () => null),
}));

import { storage } from '../storage';
import { calculateCartPricing, type CartItem } from '../utils/cart-pricing';

const SCHOOL_ID = 10;
const USER_ID = 20;

function cartItems(count: number, prices: number[]): CartItem[] {
  return prices.slice(0, count).map((price, i) => ({
    id: `enrollment-${100 + i}`,
    classId: 1000 + i,
    childId: 200 + i,
    childName: `Child ${i + 1}`,
    enrollmentId: 100 + i,
    remainingBalance: price,
  }));
}

describe('free-after-threshold cart pricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storage.getUser as jest.Mock).mockResolvedValue({ id: USER_ID, memberId: null });
    (storage.getDiscountsBySchoolId as jest.Mock).mockResolvedValue([]);
    (storage.getClassById as jest.Mock).mockImplementation(async (id: number) => {
      const idx = id - 1000;
      const prices = [8000, 10000, 12000, 15000];
      return { id, title: `Class ${idx}`, price: prices[idx] ?? 10000, schoolId: SCHOOL_ID };
    });
  });

  it('applies $0 free-after when unique children are at the threshold', async () => {
    (storage.getSchool as jest.Mock).mockResolvedValue({
      id: SCHOOL_ID,
      freeAfterThresholdEnabled: true,
      freeAfterThreshold: 3,
    });

    const items = cartItems(3, [8000, 10000, 12000]);
    const result = await calculateCartPricing(items, USER_ID, SCHOOL_ID);

    expect(result.discounts.freeAfterThree).toBe(0);
    expect(result.discounts.freeItemIds).toEqual([]);
    expect(result.total).toBe(30000);
  });

  it('makes the cheapest line free when unique children exceed threshold', async () => {
    (storage.getSchool as jest.Mock).mockResolvedValue({
      id: SCHOOL_ID,
      freeAfterThresholdEnabled: true,
      freeAfterThreshold: 3,
    });

    const items = cartItems(4, [8000, 10000, 12000, 15000]);
    const result = await calculateCartPricing(items, USER_ID, SCHOOL_ID);

    expect(result.discounts.freeAfterThree).toBe(8000);
    expect(result.discounts.freeItemIds).toEqual(['enrollment-100']);
    expect(result.discounts.totalDiscountAmount).toBe(8000);
    expect(result.total).toBe(37000); // 45000 - 8000
  });

  it('suppresses sibling discount when free-after is active', async () => {
    (storage.getSchool as jest.Mock).mockResolvedValue({
      id: SCHOOL_ID,
      freeAfterThresholdEnabled: true,
      freeAfterThreshold: 3,
    });
    (storage.getDiscountsBySchoolId as jest.Mock).mockResolvedValue([
      {
        id: 99,
        schoolId: SCHOOL_ID,
        name: 'Sibling 10%',
        isActive: true,
        siblingDiscount: true,
        value: 10,
        combinableWithOthers: true,
        priority: 10,
      },
    ]);

    const items = cartItems(4, [8000, 10000, 12000, 15000]);
    const result = await calculateCartPricing(items, USER_ID, SCHOOL_ID);

    expect(result.discounts.freeAfterThree).toBe(8000);
    expect(result.discounts.siblingDiscount).toBe(0);
  });

  it('applies sibling when free-after enabled but children at or below threshold', async () => {
    (storage.getSchool as jest.Mock).mockResolvedValue({
      id: SCHOOL_ID,
      freeAfterThresholdEnabled: true,
      freeAfterThreshold: 3,
    });
    (storage.getDiscountsBySchoolId as jest.Mock).mockResolvedValue([
      {
        id: 99,
        schoolId: SCHOOL_ID,
        name: 'Sibling 10%',
        isActive: true,
        siblingDiscount: true,
        value: 10,
        combinableWithOthers: true,
        priority: 10,
      },
    ]);

    const items = cartItems(2, [10000, 8000]);
    const result = await calculateCartPricing(items, USER_ID, SCHOOL_ID);

    expect(result.discounts.freeAfterThree).toBe(0);
    expect(result.discounts.siblingDiscount).toBeGreaterThan(0);
  });
});
