/**
 * server/tests/snapshot-trust-cache.test.ts
 *
 * Backend integration coverage for the snapshot trust path that backs the
 * /api/stripe/create-payment-intent endpoint.
 *
 * The full stripe.ts handler depends on the entire storage layer and the
 * Stripe SDK, so spinning up supertest here would balloon into a fixture
 * exercise. Instead this suite directly exercises the trust-cache module
 * — the same module that stripe.ts imports — to verify:
 *
 *   1. The cache write that happens in /api/cart/snapshot is observable
 *      from a separate verification call (cross-module contract).
 *   2. A request matching the cached fingerprint / credits / promo / user
 *      passes verification (the trust path will engage in stripe.ts).
 *   3. Common drift cases (stale TTL, fingerprint mismatch, wrong user,
 *      changed credits, changed promo) reject with the documented reason
 *      so stripe.ts falls through to the strict-validation block.
 *   4. The synthetic cartPricingResult shape that stripe.ts builds from
 *      the cached snapshot has every field the downstream discount
 *      snapshot / biweekly schedule code reads.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  cacheSnapshot,
  verifyTrustedSnapshot,
  __clearSnapshotCacheForTests,
  __snapshotCacheSizeForTests,
  evictExpiredSnapshots,
  SNAPSHOT_TRUST_TTL_MS as TRUST_TTL_MS,
  type CachedSnapshot,
} from '../lib/snapshotTrustCache.js';
import { computeCartItemFingerprint } from '../../shared/cartFingerprint.js';

const baseCartItems = [
  { classId: 101, childId: 1, variantId: undefined, enrollmentId: undefined },
  { classId: 102, childId: 2, variantId: 'morning', enrollmentId: undefined },
];

function freshCachedSnapshot(overrides: Partial<CachedSnapshot> = {}): CachedSnapshot {
  return {
    userId: 9001,
    itemsTotal: 200_00,
    subtotal: 220_00,
    membershipAmount: 25_00,
    discounts: {
      siblingDiscount: 20_00,
      freeAfterThree: 0,
      appliedDiscounts: [],
      totalDiscountAmount: 20_00,
      discountedChildIds: [],
      freeItemIds: [],
    },
    schoolSettings: {
      siblingDiscountRate: 10,
      freeAfterThreshold: 3,
      freeAfterThresholdEnabled: true,
    },
    creditsToApply: 0,
    appliedPromoCode: null,
    isFreeEnrollment: false,
    freeEnrollmentReason: null,
    cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
    cartItemMaxLineCostCents: 120_00,
    issuedAt: Date.now(),
    ...overrides,
  };
}

describe('snapshot trust path — backend integration', () => {
  beforeEach(() => {
    __clearSnapshotCacheForTests();
  });

  it('caches a snapshot from /api/cart/snapshot and verifies it on /create-payment-intent', () => {
    // Simulates: /api/cart/snapshot writes the snapshot.
    cacheSnapshot('snap_cross_module', freshCachedSnapshot());
    expect(__snapshotCacheSizeForTests()).toBe(1);

    // Simulates: /api/stripe/create-payment-intent reads it.
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_cross_module',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });

    expect(result.trusted).toBe(true);
    if (result.trusted) {
      // Every field the synthetic cartPricingResult in stripe.ts reads.
      expect(result.snapshot.itemsTotal).toBe(200_00);
      expect(result.snapshot.subtotal).toBe(220_00);
      expect(result.snapshot.discounts.totalDiscountAmount).toBe(20_00);
      expect(result.snapshot.schoolSettings.siblingDiscountRate).toBe(10);
    }
  });

  it('rejects when the user toggles plan without a cached snapshot (no trust signal)', () => {
    const result = verifyTrustedSnapshot({
      snapshotId: null,
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('no_snapshot_id');
  });

  it('rejects when a different user tries to reuse the snapshot (cross-tenant safety)', () => {
    cacheSnapshot('snap_user_mismatch', freshCachedSnapshot({ userId: 9001 }));
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_user_mismatch',
      userId: 9002, // different user
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('wrong_user');
  });

  it('rejects when the cart fingerprint changed between snapshot and intent', () => {
    cacheSnapshot('snap_fp', freshCachedSnapshot());
    const newCartItems = [
      ...baseCartItems,
      { classId: 999, childId: 3, variantId: undefined, enrollmentId: undefined },
    ];
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_fp',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(newCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('fingerprint_mismatch');
  });

  it('rejects when credits-to-apply changed (parent edited credits during plan toggle)', () => {
    cacheSnapshot('snap_credits', freshCachedSnapshot({ creditsToApply: 0 }));
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_credits',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 50_00, // changed
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('credits_mismatch');
  });

  it('rejects when promo code changed', () => {
    cacheSnapshot('snap_promo', freshCachedSnapshot({ appliedPromoCode: 'EARLYBIRD' }));
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_promo',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null, // promo removed
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('promo_mismatch');
  });

  it('rejects after the TTL expires (stale snapshot from a long-idle tab)', () => {
    const issuedAt = Date.now() - (TRUST_TTL_MS + 1_000);
    cacheSnapshot('snap_expired', freshCachedSnapshot({ issuedAt }));
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_expired',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('expired');
  });

  it('rejects when the cached itemsTotal violates the absolute sanity ceiling ($50k)', () => {
    cacheSnapshot(
      'snap_huge',
      freshCachedSnapshot({ itemsTotal: 60_000_00, cartItemMaxLineCostCents: 5_000_00 }),
    );
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_huge',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('sanity_bound_failed');
  });

  it('rejects when itemsTotal is wildly out of proportion to the cart\'s max line cost', () => {
    // cartItemMaxLineCostCents = 100, but itemsTotal = 100_000 → > 5x ceiling
    cacheSnapshot(
      'snap_relative',
      freshCachedSnapshot({ itemsTotal: 1_000_00, cartItemMaxLineCostCents: 100_00 }),
    );
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_relative',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(false);
    if (!result.trusted) expect(result.reason).toBe('sanity_bound_failed');
  });

  it('eviction sweep removes expired entries', () => {
    cacheSnapshot('snap_expired_1', freshCachedSnapshot({ issuedAt: Date.now() - (TRUST_TTL_MS + 5_000) }));
    cacheSnapshot('snap_expired_2', freshCachedSnapshot({ issuedAt: Date.now() - (TRUST_TTL_MS + 5_000) }));
    cacheSnapshot('snap_fresh', freshCachedSnapshot());
    expect(__snapshotCacheSizeForTests()).toBe(3);

    const evicted = evictExpiredSnapshots();
    expect(evicted).toBe(2);
    expect(__snapshotCacheSizeForTests()).toBe(1);

    // The fresh one is still verifiable.
    const result = verifyTrustedSnapshot({
      snapshotId: 'snap_fresh',
      userId: 9001,
      cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(result.trusted).toBe(true);
  });

  describe('biweekly schedule sizing on the trust path', () => {
    // The user-visible regression vector for #174 was: parent toggles
    // between full / monthly / biweekly, calculateCheckoutBiweeklySchedule
    // re-runs against a freshly-recomputed total that drifted by 1-2 cents,
    // and the strict-validation block then 409s. This test pins that the
    // trust path feeds calculateCheckoutBiweeklySchedule the SAME total
    // it would have computed strictly, so first-payment sizing is stable.
    it('feeds calculateCheckoutBiweeklySchedule the cached total verbatim', async () => {
      const { calculateCheckoutBiweeklySchedule } = await import(
        '../lib/payment-calculator.js'
      );

      const cachedTotal = 200_00; // $200 across many biweekly installments
      cacheSnapshot('snap_biweekly', freshCachedSnapshot({ itemsTotal: cachedTotal }));

      const verified = verifyTrustedSnapshot({
        snapshotId: 'snap_biweekly',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });
      expect(verified.trusted).toBe(true);
      if (!verified.trusted) return;

      // Anchor dates so the test is deterministic.
      const anchor = new Date('2026-04-30T12:00:00Z');
      const classStart = new Date('2026-05-15T00:00:00Z');
      const classEnd = new Date('2026-09-15T00:00:00Z');

      const schedule = calculateCheckoutBiweeklySchedule(
        verified.snapshot.itemsTotal,
        classStart,
        classEnd,
        anchor,
      );

      expect(schedule.totalAmount).toBe(cachedTotal);
      expect(schedule.numberOfPayments).toBeGreaterThan(1);
      // Sum of installments equals total (no drift).
      const sum =
        schedule.paymentAmount * (schedule.numberOfPayments - 1) +
        schedule.finalPaymentAmount;
      expect(sum).toBe(cachedTotal);
    });
  });

  describe('synthetic cartPricingResult shape', () => {
    // stripe.ts builds a synthetic cartPricingResult from the cached snapshot
    // when the trust path engages, so downstream code (discount snapshot
    // building, applied-discount usage tracking, biweekly schedule sizing)
    // can run without further branching. This test pins the contract.
    it('exposes every field the downstream code paths read', () => {
      cacheSnapshot('snap_shape', freshCachedSnapshot());
      const result = verifyTrustedSnapshot({
        snapshotId: 'snap_shape',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });
      expect(result.trusted).toBe(true);
      if (!result.trusted) return;

      // Build the same synthetic shape stripe.ts builds, then assert on it.
      const cartPricingResult = {
        subtotal: result.snapshot.subtotal,
        total: result.snapshot.itemsTotal,
        discounts: result.snapshot.discounts,
        schoolSettings: result.snapshot.schoolSettings,
        itemPrices: [],
        promoCodeValidation: undefined,
      };

      expect(cartPricingResult.subtotal).toBeGreaterThan(0);
      expect(cartPricingResult.total).toBeGreaterThan(0);
      expect(cartPricingResult.discounts).toHaveProperty('totalDiscountAmount');
      expect(cartPricingResult.discounts).toHaveProperty('appliedDiscounts');
      expect(cartPricingResult.schoolSettings).toHaveProperty('siblingDiscountRate');
      expect(cartPricingResult.schoolSettings).toHaveProperty('freeAfterThresholdEnabled');
    });
  });
});
