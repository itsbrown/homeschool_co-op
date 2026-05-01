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
    // Sum of authoritative per-line costs (drives the new primary
    // sanity bound). Defaulted slightly above itemsTotal so the default
    // fixture passes the bound; tests override it for the relevant cases.
    cartItemTotalLineCostCents: 220_00,
    biweeklyPlan: null,
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

  it('rejects when itemsTotal is wildly out of proportion to the cart\'s line costs', () => {
    // Both the sum-based ceiling AND the single-line ceiling are violated.
    // sum = $100, max-line = $100, itemsTotal = $1000 → reject (sanity_bound_failed).
    cacheSnapshot(
      'snap_relative',
      freshCachedSnapshot({
        itemsTotal: 1_000_00,
        cartItemMaxLineCostCents: 100_00,
        cartItemTotalLineCostCents: 100_00,
      }),
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

  // ──────────────────────────────────────────────────────────────────────
  // Sum-based sanity bound (#186) — multi-item cart whose itemsTotal far
  // exceeds 5x the largest single line but legitimately equals the sum of
  // per-line costs must NOT be rejected. The previous "5 * maxLineCost"
  // heuristic was the trust-cache half of the false-positive that
  // produced the "Prices Have Changed" screen on biweekly toggle.
  // ──────────────────────────────────────────────────────────────────────
  describe('sum-based sanity bound (#186)', () => {
    it('TRUSTS a 21-line multi-child cart whose itemsTotal ≈ sum of per-line costs', () => {
      // Production-shaped repro: parent jocimarie@gmail.com had 21
      // enrollments across 8 children, items total $8,200.63, largest
      // single per-line cost $900. Old rule: 5 * $900 = $4,500 ceiling →
      // false reject. New rule: sum-based ceiling ≈ $8,200 → TRUST.
      const itemsTotalCents = 820_063; // $8,200.63
      const lineSumCents = 825_000; // $8,250 — slightly above itemsTotal (post-discount)
      const maxLineCents = 90_000; // $900 — well below 5x trick

      cacheSnapshot(
        'snap_21_line_cart',
        freshCachedSnapshot({
          itemsTotal: itemsTotalCents,
          subtotal: lineSumCents,
          cartItemTotalLineCostCents: lineSumCents,
          cartItemMaxLineCostCents: maxLineCents,
        }),
      );

      const result = verifyTrustedSnapshot({
        snapshotId: 'snap_21_line_cart',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });

      expect(result.trusted).toBe(true);
      if (result.trusted) {
        expect(result.snapshot.itemsTotal).toBe(itemsTotalCents);
      }
    });

    it('REJECTS a snapshot whose itemsTotal is wildly inflated above the sum of per-line costs', () => {
      // Same shape as the TRUST case above but itemsTotal has been
      // implausibly inflated to $30,000 while per-line sum is still $8,250.
      // Both bounds are violated → sanity_bound_failed (no false trust).
      cacheSnapshot(
        'snap_inflated',
        freshCachedSnapshot({
          itemsTotal: 3_000_000, // $30,000 (still under absolute ceiling)
          subtotal: 825_000,
          cartItemTotalLineCostCents: 825_000,
          cartItemMaxLineCostCents: 90_000,
        }),
      );

      const result = verifyTrustedSnapshot({
        snapshotId: 'snap_inflated',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });

      expect(result.trusted).toBe(false);
      if (!result.trusted) expect(result.reason).toBe('sanity_bound_failed');
    });

    it('REJECTS when sum bound is exceeded even if max-line ceiling would have passed', () => {
      // Defense against trust-cache bypass: if cartItemTotalLineCostCents
      // is small (e.g. $200) but cartItemMaxLineCostCents is large
      // (e.g. $5,000 → 5x ceiling = $25,000), the snapshot must STILL
      // reject when itemsTotal exceeds the sum bound. Sum is primary;
      // max-line is not an escape hatch for multi-line carts.
      cacheSnapshot(
        'snap_sum_primary',
        freshCachedSnapshot({
          itemsTotal: 10_000_00, // $10,000 — would slip under 5*$5,000 = $25,000
          subtotal: 200_00,
          cartItemTotalLineCostCents: 200_00, // sum bound: max($210, $500) = $500
          cartItemMaxLineCostCents: 5_000_00, // single $5,000 line
        }),
      );
      const result = verifyTrustedSnapshot({
        snapshotId: 'snap_sum_primary',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });
      expect(result.trusted).toBe(false);
      if (!result.trusted) expect(result.reason).toBe('sanity_bound_failed');
    });

    it('TRUSTS a tiny single-line cart (edge case: max-line guard kicks in via MIN floor)', () => {
      // Single $50 enrollment. sum = max-line = $50.
      // sum ceiling = max($50 + $10, $500) = $500 → TRUST.
      // max-line ceiling = max(5 * $50, $500) = $500 → TRUST.
      cacheSnapshot(
        'snap_single_line_tiny',
        freshCachedSnapshot({
          itemsTotal: 50_00,
          subtotal: 50_00,
          cartItemTotalLineCostCents: 50_00,
          cartItemMaxLineCostCents: 50_00,
        }),
      );

      const result = verifyTrustedSnapshot({
        snapshotId: 'snap_single_line_tiny',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });
      expect(result.trusted).toBe(true);
    });
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

  // ──────────────────────────────────────────────────────────────────────
  // Cached biweekly plan (#186) — when the snapshot includes a biweekly
  // plan, the trust path in /create-payment-intent uses its
  // firstPaymentAmount directly to size the PaymentIntent so the
  // schedule re-verification (which previously diverged on
  // first-enrollment-only date lookup) is skipped entirely.
  // ──────────────────────────────────────────────────────────────────────
  describe('cached biweekly plan (#186)', () => {
    it('exposes biweekly plan numbers needed to size the PaymentIntent', () => {
      const biweeklyPlan = {
        firstPaymentAmount: 273_354, // $2,733.54
        numberOfPayments: 3,
        totalAmount: 820_063, // $8,200.63
        finalPaymentAmount: 273_355, // remainder rounded into final
      };
      cacheSnapshot(
        'snap_biweekly_plan',
        freshCachedSnapshot({
          itemsTotal: 820_063,
          subtotal: 850_000,
          cartItemTotalLineCostCents: 850_000,
          cartItemMaxLineCostCents: 90_000,
          biweeklyPlan,
        }),
      );
      const result = verifyTrustedSnapshot({
        snapshotId: 'snap_biweekly_plan',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });
      expect(result.trusted).toBe(true);
      if (result.trusted) {
        expect(result.snapshot.biweeklyPlan).toEqual(biweeklyPlan);
      }
    });

    it('snapshots that omit a biweekly plan still trust (full-payment carts)', () => {
      cacheSnapshot('snap_no_biweekly', freshCachedSnapshot({ biweeklyPlan: null }));
      const result = verifyTrustedSnapshot({
        snapshotId: 'snap_no_biweekly',
        userId: 9001,
        cartItemFingerprint: computeCartItemFingerprint(baseCartItems),
        creditsToApply: 0,
        appliedPromoCode: null,
      });
      expect(result.trusted).toBe(true);
      if (result.trusted) {
        expect(result.snapshot.biweeklyPlan).toBeNull();
      }
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
