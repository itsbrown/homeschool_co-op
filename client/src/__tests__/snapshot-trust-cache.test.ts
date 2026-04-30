/**
 * Tests for the snapshot trust cache + fingerprint helper that powers the
 * "skip strict cart-vs-DB validation when the parent only toggled their
 * payment plan" path on /api/stripe/create-payment-intent.
 *
 * Co-located under client/__tests__/ because the project's jest config only
 * picks up tests from there. The modules under test live on the server, but
 * they are pure TS with no Express deps so ts-jest can transform them.
 */

import { computeCartItemFingerprint } from '../../../shared/cartFingerprint';
import {
  cacheSnapshot,
  verifyTrustedSnapshot,
  evictExpiredSnapshots,
  __clearSnapshotCacheForTests,
  __snapshotCacheSizeForTests,
  SNAPSHOT_TRUST_TTL_MS,
  ABSOLUTE_TRUSTED_AMOUNT_CEILING_CENTS,
  MIN_REASONABLE_TRUSTED_AMOUNT_CENTS,
  type CachedSnapshot,
} from '../../../server/lib/snapshotTrustCache';

const baseCart = [
  { classId: 1, childId: 10, variantId: 'v1', enrollmentId: null },
  { classId: 2, childId: 11, variantId: null, enrollmentId: null },
];

beforeEach(() => {
  __clearSnapshotCacheForTests();
});

describe('computeCartItemFingerprint', () => {
  it('is stable across reorderings of the same items', () => {
    const a = computeCartItemFingerprint(baseCart);
    const b = computeCartItemFingerprint([...baseCart].reverse());
    expect(a).toBe(b);
  });

  it('changes when a variant changes', () => {
    const a = computeCartItemFingerprint(baseCart);
    const b = computeCartItemFingerprint([
      { classId: 1, childId: 10, variantId: 'v2', enrollmentId: null },
      { classId: 2, childId: 11, variantId: null, enrollmentId: null },
    ]);
    expect(a).not.toBe(b);
  });

  it('changes when an item is added', () => {
    const a = computeCartItemFingerprint(baseCart);
    const b = computeCartItemFingerprint([
      ...baseCart,
      { classId: 3, childId: 10, variantId: null, enrollmentId: null },
    ]);
    expect(a).not.toBe(b);
  });

  it('changes when child changes on otherwise-identical class', () => {
    const a = computeCartItemFingerprint(baseCart);
    const b = computeCartItemFingerprint([
      { classId: 1, childId: 99, variantId: 'v1', enrollmentId: null },
      { classId: 2, childId: 11, variantId: null, enrollmentId: null },
    ]);
    expect(a).not.toBe(b);
  });

  it('handles an empty cart deterministically', () => {
    expect(computeCartItemFingerprint([])).toBe(computeCartItemFingerprint([]));
  });
});

describe('verifyTrustedSnapshot', () => {
  const userId = 42;
  const fingerprint = computeCartItemFingerprint(baseCart);

  function seed(overrides: Partial<CachedSnapshot> = {}, id = 'snap_abc'): CachedSnapshot {
    const value: CachedSnapshot = {
      userId,
      itemsTotal: 100_00,
      subtotal: 100_00,
      membershipAmount: 25_00,
      discounts: null,
      schoolSettings: null,
      creditsToApply: 0,
      appliedPromoCode: null,
      isFreeEnrollment: false,
      freeEnrollmentReason: null,
      cartItemFingerprint: fingerprint,
      cartItemMaxLineCostCents: 80_00,
      issuedAt: Date.now(),
      ...overrides,
    };
    cacheSnapshot(id, value);
    return value;
  }

  it('returns trusted=true on an exact, fresh, sanity-bounded match', () => {
    seed();
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(true);
    if (r.trusted) {
      expect(r.snapshot.itemsTotal).toBe(100_00);
      expect(r.snapshot.membershipAmount).toBe(25_00);
    }
  });

  it('rejects when no snapshotId is provided', () => {
    seed();
    const r = verifyTrustedSnapshot({
      snapshotId: null,
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('no_snapshot_id');
  });

  it('rejects when the snapshot is not in the cache', () => {
    const r = verifyTrustedSnapshot({
      snapshotId: 'never_cached',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('snapshot_not_found');
  });

  it('rejects when the snapshot was issued for a different user', () => {
    seed();
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId: 999,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('wrong_user');
  });

  it('rejects when the cart fingerprint does not match', () => {
    seed();
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: 'fp_different_2',
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('fingerprint_mismatch');
  });

  it('rejects when credits-to-apply changed between snapshot and intent', () => {
    seed({ creditsToApply: 0 });
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 500,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('credits_mismatch');
  });

  it('rejects when promo code changed between snapshot and intent', () => {
    seed({ appliedPromoCode: 'SUMMER25' });
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('promo_mismatch');
  });

  it('rejects when the snapshot has aged past the TTL', () => {
    const issuedAt = Date.now();
    seed({ issuedAt });
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
      now: issuedAt + SNAPSHOT_TRUST_TTL_MS + 1_000,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('expired');
  });

  it('rejects when the cached itemsTotal exceeds the absolute ceiling', () => {
    seed({
      itemsTotal: ABSOLUTE_TRUSTED_AMOUNT_CEILING_CENTS + 1,
      // Set the per-line cost high so the relative-ceiling check passes
      // and we are sure the rejection is the absolute ceiling, not the
      // relative one.
      cartItemMaxLineCostCents: ABSOLUTE_TRUSTED_AMOUNT_CEILING_CENTS,
    });
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('sanity_bound_failed');
  });

  it('rejects when itemsTotal is wildly larger than any single line item', () => {
    // Triggers the relative ceiling: itemsTotal > 5x max line cost AND
    // > MIN_REASONABLE_TRUSTED_AMOUNT_CENTS.
    seed({
      itemsTotal: MIN_REASONABLE_TRUSTED_AMOUNT_CENTS + 100_000,
      cartItemMaxLineCostCents: 10_00,
    });
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('sanity_bound_failed');
  });

  it('passes the relative sanity bound when itemsTotal is reasonable for the line cost', () => {
    seed({
      itemsTotal: 200_00,
      cartItemMaxLineCostCents: 100_00, // 5x = 500_00, well above 200_00
    });
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(true);
  });

  it('treats null and undefined promo codes as equivalent', () => {
    seed({ appliedPromoCode: null });
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(true);
  });

  it('evicts expired snapshots from the in-memory map', () => {
    const issuedAt = Date.now();
    seed({ issuedAt });
    expect(__snapshotCacheSizeForTests()).toBe(1);
    const removed = evictExpiredSnapshots(issuedAt + SNAPSHOT_TRUST_TTL_MS + 1_000);
    expect(removed).toBe(1);
    expect(__snapshotCacheSizeForTests()).toBe(0);
    // After eviction, look-up reports snapshot_not_found, not expired.
    const r = verifyTrustedSnapshot({
      snapshotId: 'snap_abc',
      userId,
      cartItemFingerprint: fingerprint,
      creditsToApply: 0,
      appliedPromoCode: null,
    });
    expect(r.trusted).toBe(false);
    if (!r.trusted) expect(r.reason).toBe('snapshot_not_found');
  });

  it('eviction does not remove still-fresh snapshots', () => {
    const issuedAt = Date.now();
    seed({ issuedAt });
    const removed = evictExpiredSnapshots(issuedAt + 1_000); // only 1s old
    expect(removed).toBe(0);
    expect(__snapshotCacheSizeForTests()).toBe(1);
  });
});
