/**
 * Snapshot trust cache for /api/stripe/create-payment-intent.
 *
 * Background: Switching the payment plan / frequency in CartCheckout used to
 * re-run the full UNIFIED STRICT VALIDATION block on the server, which compares
 * the client's cart total against a freshly recomputed authoritative total.
 * Tiny drift between two `calculateCartPricing` calls within seconds (existing
 * enrollment effective_balance refresh, credit holds, promo usage tick,
 * rounding inside discount allocation, etc.) could trip the >5% guard and
 * spuriously block the parent with the "Prices Have Changed" screen.
 *
 * This module lets `/api/cart/snapshot` cache the authoritative values it just
 * computed and lets `/api/stripe/create-payment-intent` honour a short-lived,
 * fingerprint-bound, per-user trust signal so plan/frequency toggles can reuse
 * those values without re-running strict validation. On any check failure
 * (missing snapshot, expired, wrong user, fingerprint mismatch, credits or
 * promo mismatch, sanity bound failure) the call falls through to today's
 * full strict-validation path.
 *
 * IMPORTANT: This is in-process state, intentional for the single-instance
 * Reserved VM deployment per asa-testing-deployment. On a multi-instance
 * deployment the trust path will silently miss across instances and degrade
 * gracefully back to strict validation.
 */

export const SNAPSHOT_TRUST_TTL_MS = 90_000; // 90 seconds — must be <= 120s
export const ABSOLUTE_TRUSTED_AMOUNT_CEILING_CENTS = 5_000_000; // $50,000
export const MIN_REASONABLE_TRUSTED_AMOUNT_CENTS = 50_000; // $500 — see sanity bound below
// Slack added on top of cartItemTotalLineCostCents when applying the sum-based
// sanity bound. Allows tiny rounding drift between the cached items total and
// the sum of per-line authoritative prices, while still catching gross tampering.
export const SANITY_BOUND_SLACK_CENTS = 1_000; // $10

const EVICTION_INTERVAL_MS = 30_000; // sweep stale entries every 30s

/**
 * Trimmed biweekly plan entry cached alongside the snapshot so the trust
 * path in /create-payment-intent can size the PaymentIntent off the exact
 * authoritative number the parent was shown (no recompute, no false 409).
 */
export interface CachedBiweeklyPlan {
  firstPaymentAmount: number; // cents — what the PaymentIntent gets sized to
  numberOfPayments: number;
  totalAmount: number; // cents — full payable amount across the schedule
  finalPaymentAmount: number; // cents — last installment (handles rounding remainder)
}

export interface CachedSnapshot {
  userId: number; // integer DB user id (req.user.id), NEVER the Supabase UUID
  itemsTotal: number; // cents — discounted total (== cartPricingResult.total)
  // cents — pre-discount items subtotal (== cartPricingResult.subtotal). Stored
  // so the trust path can build a synthetic cartPricingResult downstream and
  // skip re-running calculateCartPricing.
  subtotal: number;
  membershipAmount: number; // cents
  discounts: any; // == cartPricingResult.discounts (siblingDiscount, freeAfterThree, appliedDiscounts[], totalDiscountAmount, discountedChildIds, freeItemIds)
  schoolSettings: any | null; // == cartPricingResult.schoolSettings (siblingDiscountRate, freeAfterThreshold, freeAfterThresholdEnabled)
  creditsToApply: number; // cents
  appliedPromoCode: string | null;
  isFreeEnrollment: boolean;
  freeEnrollmentReason: string | null;
  cartItemFingerprint: string;
  cartItemMaxLineCostCents: number; // cents — secondary guard for single-line carts
  // cents — sum of authoritative per-line costs (snapshot.pricing.itemPrices
  // sums + any remainingBalance for existing-enrollment lines). Drives the
  // primary sum-based sanity bound so multi-item carts whose largest single
  // line is small (e.g. $900) but whose legitimate cart total is large
  // (e.g. $8,200 across 21 items) are NOT spuriously rejected.
  cartItemTotalLineCostCents: number;
  // Cached biweekly plan from the snapshot (when payable amount > 0).
  // The trust path in /create-payment-intent uses these numbers directly
  // when the parent toggles to biweekly so the PaymentIntent is sized off
  // the exact figure the parent was shown — no schedule re-verification,
  // no false 409 from recomputed dates / drift.
  biweeklyPlan: CachedBiweeklyPlan | null;
  issuedAt: number; // epoch ms (Date.now())
}

export type TrustRejectionReason =
  | 'no_snapshot_id'
  | 'snapshot_not_found'
  | 'wrong_user'
  | 'expired'
  | 'fingerprint_mismatch'
  | 'credits_mismatch'
  | 'promo_mismatch'
  | 'sanity_bound_failed';

export interface TrustVerificationInput {
  snapshotId: string | null | undefined;
  userId: number;
  cartItemFingerprint: string | null | undefined;
  creditsToApply: number;
  appliedPromoCode: string | null;
  now?: number; // injectable for tests
}

export type TrustVerificationResult =
  | { trusted: true; snapshot: CachedSnapshot; ageMs: number }
  | { trusted: false; reason: TrustRejectionReason; ageMs?: number };

const cache = new Map<string, CachedSnapshot>();

// Re-export the shared fingerprint helper so server modules can import it
// from one place (cache + verify use the same source of truth as the client).
export { computeCartItemFingerprint } from '@shared/cartFingerprint';

/**
 * Cache an authoritative snapshot just produced by calculateCartSnapshot()
 * so a subsequent create-payment-intent call within the TTL can reuse it
 * without re-running calculateCartPricing.
 */
export function cacheSnapshot(snapshotId: string, value: CachedSnapshot): void {
  cache.set(snapshotId, value);
}

export function getCachedSnapshot(snapshotId: string): CachedSnapshot | undefined {
  return cache.get(snapshotId);
}

/**
 * Verify an inbound trust signal against the cache. Returns either
 * { trusted: true } with the cached snapshot, or { trusted: false } with
 * the precise reason so the caller can fall through to strict validation
 * and emit a structured log line.
 *
 * Checks in order (fail-fast):
 *   1. snapshotId present
 *   2. snapshot exists in cache
 *   3. userId matches
 *   4. not expired (age <= SNAPSHOT_TRUST_TTL_MS)
 *   5. cartItemFingerprint matches
 *   6. creditsToApply matches
 *   7. appliedPromoCode matches (null === null OK)
 *   8. sanity bound: cachedItemsTotal must be plausibly small relative to
 *      max single-line cost AND below the absolute ceiling
 */
export function verifyTrustedSnapshot(
  input: TrustVerificationInput,
): TrustVerificationResult {
  const now = input.now ?? Date.now();

  if (!input.snapshotId) {
    return { trusted: false, reason: 'no_snapshot_id' };
  }
  const snapshot = cache.get(input.snapshotId);
  if (!snapshot) {
    return { trusted: false, reason: 'snapshot_not_found' };
  }
  const ageMs = now - snapshot.issuedAt;
  if (snapshot.userId !== input.userId) {
    return { trusted: false, reason: 'wrong_user', ageMs };
  }
  if (ageMs > SNAPSHOT_TRUST_TTL_MS) {
    return { trusted: false, reason: 'expired', ageMs };
  }
  if (!input.cartItemFingerprint || input.cartItemFingerprint !== snapshot.cartItemFingerprint) {
    return { trusted: false, reason: 'fingerprint_mismatch', ageMs };
  }
  // Strict equality on credits — any drift means user toggled the credits
  // switch and we must re-validate.
  if ((input.creditsToApply ?? 0) !== (snapshot.creditsToApply ?? 0)) {
    return { trusted: false, reason: 'credits_mismatch', ageMs };
  }
  // null-safe promo equality
  const cachedPromo = snapshot.appliedPromoCode || null;
  const incomingPromo = input.appliedPromoCode || null;
  if (cachedPromo !== incomingPromo) {
    return { trusted: false, reason: 'promo_mismatch', ageMs };
  }
  // PRIMARY sanity bound — sum-based: itemsTotal (post-discount) must
  // not exceed the sum of authoritative per-line costs (pre-discount)
  // plus a small slack. Mathematically impossible for a legitimate
  // snapshot (discounts can only lower the total), so a violation means
  // the cached value is implausibly inflated and we fall through to
  // strict validation. MIN_REASONABLE_TRUSTED_AMOUNT_CENTS gives a $500
  // floor so genuinely tiny carts ($50 single class) still trust.
  //
  // SECONDARY guard for single-line carts only — when there is no sum
  // signal (legacy snapshot where cartItemTotalLineCostCents wasn't
  // recorded, OR a single-line cart where sum == max-line by definition),
  // also enforce the previous "5x max line cost" ceiling. For multi-line
  // carts the sum check fully subsumes this, so we don't apply it (that
  // was the #186 false-reject root cause for the 21-line $8,200 cart
  // with $900 max-line).
  //
  // ABSOLUTE ceiling — anything above $50,000 outright rejected.
  const sumCeiling = Math.max(
    snapshot.cartItemTotalLineCostCents + SANITY_BOUND_SLACK_CENTS,
    MIN_REASONABLE_TRUSTED_AMOUNT_CENTS,
  );
  const exceedsAbsolute = snapshot.itemsTotal > ABSOLUTE_TRUSTED_AMOUNT_CEILING_CENTS;
  const exceedsSum = snapshot.itemsTotal > sumCeiling;

  if (exceedsAbsolute || exceedsSum) {
    return { trusted: false, reason: 'sanity_bound_failed', ageMs };
  }

  // Single-line / legacy fallback: only fire when we have no usable sum
  // signal (cartItemTotalLineCostCents is 0 or absent). Multi-line carts
  // already passed the sum check above.
  const hasSumSignal = snapshot.cartItemTotalLineCostCents > 0;
  if (!hasSumSignal && snapshot.cartItemMaxLineCostCents > 0) {
    const maxLineCeiling = Math.max(
      5 * snapshot.cartItemMaxLineCostCents,
      MIN_REASONABLE_TRUSTED_AMOUNT_CENTS,
    );
    if (snapshot.itemsTotal > maxLineCeiling) {
      return { trusted: false, reason: 'sanity_bound_failed', ageMs };
    }
  }

  return { trusted: true, snapshot, ageMs };
}

/**
 * Periodic eviction of expired entries. Kept simple — runs every
 * EVICTION_INTERVAL_MS and removes anything past TTL. Idempotent so a
 * caller can also invoke it directly from a test.
 */
export function evictExpiredSnapshots(now: number = Date.now()): number {
  let removed = 0;
  for (const [key, value] of cache.entries()) {
    if (now - value.issuedAt > SNAPSHOT_TRUST_TTL_MS) {
      cache.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Test-only: clear the cache between cases. */
export function __clearSnapshotCacheForTests(): void {
  cache.clear();
}

/** Test-only: cache size. */
export function __snapshotCacheSizeForTests(): number {
  return cache.size;
}

// Start the eviction loop unless we're in a test environment. Using
// unref() so it doesn't block process shutdown.
if (process.env.NODE_ENV !== 'test') {
  const timer = setInterval(() => {
    try {
      evictExpiredSnapshots();
    } catch (e) {
      console.warn('snapshotTrustCache eviction failed:', e);
    }
  }, EVICTION_INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}
