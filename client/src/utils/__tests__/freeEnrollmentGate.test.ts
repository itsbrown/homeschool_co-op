import {
  isFreeEnrollmentApproved,
  cartLooksFreeButUnverified,
} from '../freeEnrollmentGate';

/**
 * Regression tests for the cart's $0 / Free-Enrollment UI gates.
 *
 * These tests lock in the contract that the cart UI must follow:
 *   1. The Free Enrollment CTA may ONLY appear when the server cart snapshot
 *      has explicitly returned `isFreeEnrollment: true`.
 *   2. A locally-computed $0 cart total is NEVER enough on its own.
 *
 * If a regression reintroduces the original client-side bug — e.g. checking
 * `actualPayableAmount === 0` directly to flip the Free Enrollment UI — these
 * tests will fail, because the helper they exercise is the same one wired into
 * `client/src/pages/CartCheckout.tsx`.
 */
describe('isFreeEnrollmentApproved', () => {
  it('returns false when the cart total is non-zero, even if the snapshot says free', () => {
    expect(
      isFreeEnrollmentApproved(15_000, { isFreeEnrollment: true }),
    ).toBe(false);
  });

  it('returns false when the snapshot has not been received yet (loading)', () => {
    expect(isFreeEnrollmentApproved(0, null)).toBe(false);
    expect(isFreeEnrollmentApproved(0, undefined)).toBe(false);
  });

  it('returns false when the snapshot is loaded but isFreeEnrollment is missing', () => {
    expect(isFreeEnrollmentApproved(0, {})).toBe(false);
  });

  it('returns false when the snapshot explicitly says isFreeEnrollment=false', () => {
    expect(
      isFreeEnrollmentApproved(0, { isFreeEnrollment: false }),
    ).toBe(false);
  });

  it('returns false for truthy-but-not-true values (regression guard)', () => {
    // The server contract is a strict boolean. Any non-true truthy value
    // (e.g. a string from a stale/legacy response) must NOT approve free
    // enrollment — this is the very bug the gate was added to prevent.
    expect(
      isFreeEnrollmentApproved(0, { isFreeEnrollment: 'true' }),
    ).toBe(false);
    expect(
      isFreeEnrollmentApproved(0, { isFreeEnrollment: 1 }),
    ).toBe(false);
  });

  it('returns true ONLY when total is $0 AND snapshot.isFreeEnrollment === true', () => {
    expect(
      isFreeEnrollmentApproved(0, { isFreeEnrollment: true }),
    ).toBe(true);
  });
});

describe('cartLooksFreeButUnverified', () => {
  it('returns false when cart total is non-zero', () => {
    expect(
      cartLooksFreeButUnverified(15_000, { isFreeEnrollment: false }),
    ).toBe(false);
  });

  it('returns false while the snapshot is still loading', () => {
    // No snapshot yet means we cannot conclude the cart is "stale free" —
    // the regular loading state should be shown, not the recovery card.
    expect(cartLooksFreeButUnverified(0, null)).toBe(false);
    expect(cartLooksFreeButUnverified(0, undefined)).toBe(false);
  });

  it('returns true when total is $0 but the snapshot disagrees (recovery path)', () => {
    // This is the original bug scenario: the local cart says $0 because a
    // Stripe-managed enrollment has remainingBalance=0, but the server snapshot
    // says it is NOT a free enrollment. The UI must show the recovery card.
    expect(
      cartLooksFreeButUnverified(0, { isFreeEnrollment: false }),
    ).toBe(true);
    expect(cartLooksFreeButUnverified(0, {})).toBe(true);
  });

  it('returns false when the snapshot DOES approve free enrollment', () => {
    expect(
      cartLooksFreeButUnverified(0, { isFreeEnrollment: true }),
    ).toBe(false);
  });
});
