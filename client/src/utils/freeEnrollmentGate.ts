/**
 * Free-Enrollment / $0 cart UI gate.
 *
 * Why this lives in a helper:
 *   The original cart bug let the UI advertise a "$0 outstanding" balance and
 *   surface a "Request Free Enrollment" CTA from purely client-side totals. For
 *   Stripe-managed payment plans the stored `remaining_balance` is intentionally
 *   `0`, which silently collapsed cart subtotals to `0` even when the family
 *   genuinely owed money. The fix is to gate the Free Enrollment / $0 UI on the
 *   server cart snapshot's authoritative `isFreeEnrollment` flag.
 *
 *   Centralising the gate here gives us a small, regression-tested unit that the
 *   cart UI must call. If a future change reverts to gating purely on
 *   `actualPayableAmount === 0`, both the helper tests and the UI guard tests
 *   that reference these helpers will fail.
 */

export interface CartFreeEnrollmentSnapshot {
  /**
   * Server-authoritative free-enrollment flag from /api/cart/snapshot.
   * Only `true` (boolean) approves the Free Enrollment UI — `undefined`,
   * `null` or any falsy value MUST keep the UI in the regular payment flow.
   */
  isFreeEnrollment?: boolean | null;
}

/**
 * Returns true only when the local cart total is $0 AND the server snapshot
 * has explicitly flagged the cart as `isFreeEnrollment: true`.
 *
 * Never returns true on `actualPayableAmount === 0` alone — that was the
 * original bug.
 */
export function isFreeEnrollmentApproved(
  actualPayableAmount: number,
  snapshot: CartFreeEnrollmentSnapshot | null | undefined,
): boolean {
  if (actualPayableAmount !== 0) return false;
  return snapshot?.isFreeEnrollment === true;
}

/**
 * Returns true when the local cart total looks free ($0) but the server
 * snapshot has been received and disagrees (it did NOT flag the cart as
 * `isFreeEnrollment: true`).
 *
 * This is the recovery / "refresh your cart" UI path — the cart probably
 * picked up a stale Stripe-managed `remaining_balance: 0` that we should not
 * silently treat as a free enrollment.
 *
 * Returns false while the snapshot is still loading (snapshot null / undefined),
 * since the regular payment form / loading state covers that case.
 */
export function cartLooksFreeButUnverified(
  actualPayableAmount: number,
  snapshot: CartFreeEnrollmentSnapshot | null | undefined,
): boolean {
  if (actualPayableAmount !== 0) return false;
  if (!snapshot) return false;
  return snapshot.isFreeEnrollment !== true;
}
