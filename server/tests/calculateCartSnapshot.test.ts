import {
  canonicalizeForChecksum,
  computeChecksum,
  verifyChecksum,
  signSnapshot,
  validateItemPrices,
  validateTotals,
  validateSnapshot,
  createSignedSnapshot,
  convertToCanonicalSnapshot,
  splitPaymentAcrossItems,
  CanonicalSnapshot,
  CanonicalCartItem,
} from '../lib/calculateCartSnapshot';

const TEST_SECRET = 'test-secret-key-for-unit-tests';

function createValidSnapshot(overrides: Partial<CanonicalSnapshot> = {}): CanonicalSnapshot {
  return {
    version: '1',
    createdAt: '2026-01-07T12:00:00.000Z',
    schoolId: 1,
    userId: 100,
    items: [
      {
        classId: 1,
        childId: 10,
        variantId: null,
        quantity: 1,
        unitPriceCents: 5000,
        totalCostCents: 5000,
        childName: 'Test Child',
      },
      {
        classId: 2,
        childId: 10,
        variantId: 'morning',
        quantity: 1,
        unitPriceCents: 7500,
        totalCostCents: 7500,
      },
    ],
    discounts: [
      {
        id: 1,
        name: 'Sibling Discount',
        type: 'percentage',
        value: 10,
        discountAmountCents: 1250,
        isPromoCode: false,
      },
    ],
    credits: {
      availableCents: 2000,
      appliedCents: 1000,
    },
    membership: {
      required: true,
      amountCents: 5000,
      alreadyPaid: false,
    },
    totals: {
      subtotalCents: 12500,
      discountTotalCents: 1250,
      membershipCents: 5000,
      creditsCents: 1000,
      grandTotalCents: 16250,
      payableAmountCents: 15250,
    },
    ...overrides,
  };
}

describe('canonicalizeForChecksum', () => {
  test('produces deterministic output regardless of key order', () => {
    const obj1 = { b: 2, a: 1, c: { z: 26, y: 25 } };
    const obj2 = { a: 1, c: { y: 25, z: 26 }, b: 2 };

    const canonical1 = canonicalizeForChecksum(obj1 as any);
    const canonical2 = canonicalizeForChecksum(obj2 as any);

    expect(canonical1).toBe(canonical2);
  });

  test('handles arrays correctly', () => {
    const snapshot = createValidSnapshot();
    const result = canonicalizeForChecksum(snapshot);
    expect(typeof result).toBe('string');
    expect(result).toContain('"items"');
  });

  test('handles null values', () => {
    const obj = { a: null, b: 1 };
    const result = canonicalizeForChecksum(obj as any);
    expect(result).toContain('null');
  });
});

describe('computeChecksum', () => {
  test('produces consistent checksum for same input', () => {
    const snapshot = createValidSnapshot();
    const checksum1 = computeChecksum(snapshot, TEST_SECRET);
    const checksum2 = computeChecksum(snapshot, TEST_SECRET);
    expect(checksum1).toBe(checksum2);
  });

  test('produces different checksum for different input', () => {
    const snapshot1 = createValidSnapshot();
    const snapshot2 = createValidSnapshot({ userId: 999 });
    
    const checksum1 = computeChecksum(snapshot1, TEST_SECRET);
    const checksum2 = computeChecksum(snapshot2, TEST_SECRET);
    
    expect(checksum1).not.toBe(checksum2);
  });

  test('produces different checksum for different secrets', () => {
    const snapshot = createValidSnapshot();
    const checksum1 = computeChecksum(snapshot, 'secret-1');
    const checksum2 = computeChecksum(snapshot, 'secret-2');
    expect(checksum1).not.toBe(checksum2);
  });

  test('produces 64-character hex string (SHA256)', () => {
    const snapshot = createValidSnapshot();
    const checksum = computeChecksum(snapshot, TEST_SECRET);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  test('throws if no secret provided and env var not set', () => {
    const originalEnv = process.env.PAYMENT_SNAPSHOT_SECRET;
    delete process.env.PAYMENT_SNAPSHOT_SECRET;

    const snapshot = createValidSnapshot();
    expect(() => computeChecksum(snapshot)).toThrow('PAYMENT_SNAPSHOT_SECRET');

    process.env.PAYMENT_SNAPSHOT_SECRET = originalEnv;
  });
});

describe('verifyChecksum', () => {
  test('returns true for valid checksum', () => {
    const snapshot = createValidSnapshot();
    const checksum = computeChecksum(snapshot, TEST_SECRET);
    expect(verifyChecksum(snapshot, checksum, TEST_SECRET)).toBe(true);
  });

  test('returns false for tampered snapshot', () => {
    const snapshot = createValidSnapshot();
    const checksum = computeChecksum(snapshot, TEST_SECRET);

    const tamperedSnapshot = { ...snapshot, userId: 999 };
    expect(verifyChecksum(tamperedSnapshot, checksum, TEST_SECRET)).toBe(false);
  });

  test('returns false for wrong checksum', () => {
    const snapshot = createValidSnapshot();
    const wrongChecksum = 'a'.repeat(64);
    expect(verifyChecksum(snapshot, wrongChecksum, TEST_SECRET)).toBe(false);
  });

  test('returns false for invalid checksum format', () => {
    const snapshot = createValidSnapshot();
    expect(verifyChecksum(snapshot, 'invalid', TEST_SECRET)).toBe(false);
  });
});

describe('signSnapshot', () => {
  test('returns snapshot with checksum', () => {
    const snapshot = createValidSnapshot();
    const signed = signSnapshot(snapshot, TEST_SECRET);

    expect(signed.snapshot).toBe(snapshot);
    expect(signed.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('validateItemPrices', () => {
  test('passes for valid items', () => {
    const items: CanonicalCartItem[] = [
      { classId: 1, childId: 1, variantId: null, quantity: 1, unitPriceCents: 100, totalCostCents: 100 },
      { classId: 2, childId: 1, variantId: null, quantity: 2, unitPriceCents: 50, totalCostCents: 100 },
    ];
    expect(() => validateItemPrices(items)).not.toThrow();
  });

  test('throws for negative price', () => {
    const items: CanonicalCartItem[] = [
      { classId: 1, childId: 1, variantId: null, quantity: 1, unitPriceCents: -100, totalCostCents: -100 },
    ];
    expect(() => validateItemPrices(items)).toThrow('non-negative integer');
  });

  test('throws for non-integer price', () => {
    const items: CanonicalCartItem[] = [
      { classId: 1, childId: 1, variantId: null, quantity: 1, unitPriceCents: 10.5, totalCostCents: 10.5 },
    ];
    expect(() => validateItemPrices(items)).toThrow('non-negative integer');
  });

  test('throws for price/quantity mismatch', () => {
    const items: CanonicalCartItem[] = [
      { classId: 1, childId: 1, variantId: null, quantity: 2, unitPriceCents: 100, totalCostCents: 150 },
    ];
    expect(() => validateItemPrices(items)).toThrow('mismatch');
  });
});

describe('validateTotals', () => {
  test('passes for valid totals', () => {
    const snapshot = createValidSnapshot();
    expect(() => validateTotals(snapshot)).not.toThrow();
  });

  test('throws for subtotal mismatch', () => {
    const snapshot = createValidSnapshot({
      totals: {
        ...createValidSnapshot().totals,
        subtotalCents: 99999,
      },
    });
    expect(() => validateTotals(snapshot)).toThrow('Subtotal mismatch');
  });

  test('throws for discount mismatch', () => {
    const snapshot = createValidSnapshot({
      totals: {
        ...createValidSnapshot().totals,
        discountTotalCents: 99999,
      },
    });
    expect(() => validateTotals(snapshot)).toThrow('Discount mismatch');
  });

  test('throws for grand total mismatch', () => {
    const snapshot = createValidSnapshot({
      totals: {
        ...createValidSnapshot().totals,
        grandTotalCents: 99999,
      },
    });
    expect(() => validateTotals(snapshot)).toThrow('Grand total mismatch');
  });

  test('throws when credits applied exceed available', () => {
    const snapshot = createValidSnapshot({
      credits: {
        availableCents: 100,
        appliedCents: 200,
      },
    });
    expect(() => validateTotals(snapshot)).toThrow('exceeds available');
  });
});

describe('validateSnapshot', () => {
  test('passes for fully valid snapshot', () => {
    const snapshot = createValidSnapshot();
    expect(() => validateSnapshot(snapshot)).not.toThrow();
  });

  test('catches price validation errors', () => {
    const snapshot = createValidSnapshot({
      items: [
        { classId: 1, childId: 1, variantId: null, quantity: 1, unitPriceCents: -1, totalCostCents: -1 },
      ],
    });
    expect(() => validateSnapshot(snapshot)).toThrow();
  });
});

describe('createSignedSnapshot', () => {
  test('validates and signs valid snapshot', () => {
    const snapshot = createValidSnapshot();
    const signed = createSignedSnapshot(snapshot, TEST_SECRET);

    expect(signed.snapshot).toBe(snapshot);
    expect(verifyChecksum(signed.snapshot, signed.checksum, TEST_SECRET)).toBe(true);
  });

  test('throws for invalid snapshot', () => {
    const snapshot = createValidSnapshot({
      items: [
        { classId: 1, childId: 1, variantId: null, quantity: 1, unitPriceCents: -1, totalCostCents: -1 },
      ],
    });
    expect(() => createSignedSnapshot(snapshot, TEST_SECRET)).toThrow();
  });
});

describe('convertToCanonicalSnapshot', () => {
  test('converts existing snapshot format', () => {
    const existingSnapshot = {
      pricing: {
        subtotal: 10000,
        total: 9000,
        itemPrices: [
          { classId: 1, price: 5000 },
          { classId: 2, price: 5000 },
        ],
        discounts: {
          totalDiscountAmount: 1000,
          appliedDiscounts: [
            { id: 1, name: 'Test', type: 'percentage', value: 10, discountAmount: 1000 },
          ],
        },
      },
      membership: {
        required: false,
        amount: 0,
        discountedAmount: 0,
        alreadyPaid: true,
      },
      credits: {
        available: 500,
        applied: 0,
      },
      totals: {
        itemsTotal: 10000,
        membershipTotal: 0,
        grandTotal: 9000,
        payableAmount: 9000,
      },
    };

    const cartItems = [
      { classId: 1, childId: 10, childName: 'Child A' },
      { classId: 2, childId: 11, childName: 'Child B' },
    ];

    const canonical = convertToCanonicalSnapshot(existingSnapshot, 100, 1, cartItems);

    expect(canonical.version).toBe('1');
    expect(canonical.userId).toBe(100);
    expect(canonical.schoolId).toBe(1);
    expect(canonical.items.length).toBe(2);
    expect(canonical.items[0].unitPriceCents).toBe(5000);
    expect(canonical.discounts.length).toBe(1);
  });

  test('throws for missing price', () => {
    const existingSnapshot = {
      pricing: {
        subtotal: 0,
        total: 0,
        itemPrices: [],
        discounts: { totalDiscountAmount: 0, appliedDiscounts: [] },
      },
      membership: { required: false, amount: 0, discountedAmount: 0, alreadyPaid: true },
      credits: { available: 0, applied: 0 },
      totals: { itemsTotal: 0, membershipTotal: 0, grandTotal: 0, payableAmount: 0 },
    };

    const cartItems = [{ classId: 999, childId: 10 }];

    expect(() => convertToCanonicalSnapshot(existingSnapshot, 100, 1, cartItems)).toThrow('Missing or zero price');
  });
});

describe('splitPaymentAcrossItems', () => {
  test('splits evenly when divisible', () => {
    const result = splitPaymentAcrossItems(300, [1, 2, 3]);
    expect(result).toEqual([
      { enrollmentId: 1, allocatedCents: 100 },
      { enrollmentId: 2, allocatedCents: 100 },
      { enrollmentId: 3, allocatedCents: 100 },
    ]);
  });

  test('distributes remainder correctly', () => {
    const result = splitPaymentAcrossItems(100, [10, 20, 30]);
    expect(result).toEqual([
      { enrollmentId: 10, allocatedCents: 34 },
      { enrollmentId: 20, allocatedCents: 33 },
      { enrollmentId: 30, allocatedCents: 33 },
    ]);
  });

  test('handles empty enrollments', () => {
    const result = splitPaymentAcrossItems(100, []);
    expect(result).toEqual([]);
  });

  test('sum equals total', () => {
    const result = splitPaymentAcrossItems(12345, [1, 2, 3, 4, 5]);
    const sum = result.reduce((a, r) => a + r.allocatedCents, 0);
    expect(sum).toBe(12345);
  });
});
