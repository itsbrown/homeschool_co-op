/**
 * Unit tests for `resolveReallocateAmountCents`, the request-body parser used
 * by `POST /api/admin/enrollments/:id/reallocate-payment`.
 *
 * Pins the contract:
 *   (a) `amountCents` happy path
 *   (b) `amountCents` is rejected when non-integer, negative, zero, or missing
 *
 * The helper exists specifically so this contract can be tested without
 * spinning up Express / Postgres / Stripe.
 */

import {
  resolveReallocateAmountCents,
  type ResolveReallocateAmountSuccess,
  type ResolveReallocateAmountFailure,
} from '../utils/reallocatePaymentAmount';

function expectSuccess(result: ReturnType<typeof resolveReallocateAmountCents>): ResolveReallocateAmountSuccess {
  if (!result.ok) {
    throw new Error(`Expected success, got failure: ${result.error}`);
  }
  return result;
}

function expectFailure(result: ReturnType<typeof resolveReallocateAmountCents>): ResolveReallocateAmountFailure {
  if (result.ok) {
    throw new Error(`Expected failure, got success with amountCents=${result.amountCents}`);
  }
  return result;
}

describe('resolveReallocateAmountCents — /reallocate-payment body parser', () => {
  // -------------------------------------------------------------------------
  // (a) amountCents happy path
  // -------------------------------------------------------------------------
  describe('amountCents (canonical) happy path', () => {
    it('accepts a positive integer amountCents', () => {
      const success = expectSuccess(resolveReallocateAmountCents({ amountCents: 5000 }));
      expect(success.amountCents).toBe(5000);
    });

    it('accepts large integer amountCents values', () => {
      const success = expectSuccess(resolveReallocateAmountCents({ amountCents: 1_234_567 }));
      expect(success.amountCents).toBe(1_234_567);
    });
  });

  // -------------------------------------------------------------------------
  // (b) amountCents rejected when non-integer, negative, or zero
  // -------------------------------------------------------------------------
  describe('amountCents validation rejections', () => {
    it('rejects non-integer amountCents (decimal)', () => {
      expect(resolveReallocateAmountCents({ amountCents: 50.5 }).ok).toBe(false);
    });

    it('rejects zero amountCents', () => {
      expect(resolveReallocateAmountCents({ amountCents: 0 }).ok).toBe(false);
    });

    it('rejects negative amountCents', () => {
      expect(resolveReallocateAmountCents({ amountCents: -100 }).ok).toBe(false);
    });

    it('rejects NaN / Infinity amountCents', () => {
      expect(resolveReallocateAmountCents({ amountCents: NaN }).ok).toBe(false);
      expect(resolveReallocateAmountCents({ amountCents: Infinity }).ok).toBe(false);
    });

    it('rejects non-numeric amountCents', () => {
      expect(resolveReallocateAmountCents({ amountCents: '5000' }).ok).toBe(false);
      expect(resolveReallocateAmountCents({ amountCents: null }).ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Missing / empty body
  // -------------------------------------------------------------------------
  describe('missing fields', () => {
    it('rejects an empty body with a clear error mentioning amountCents', () => {
      const failure = expectFailure(resolveReallocateAmountCents({}));
      expect(failure.error).toMatch(/amountCents/);
    });

    it('rejects null/undefined body', () => {
      expect(resolveReallocateAmountCents(null).ok).toBe(false);
      expect(resolveReallocateAmountCents(undefined).ok).toBe(false);
    });

    it('rejects a body that only contains a legacy "amount" (dollars) field', () => {
      // Regression guard: the legacy dollars-based field was removed; sending
      // it alone must fail rather than silently being accepted as cents.
      const failure = expectFailure(resolveReallocateAmountCents({ amount: 50 }));
      expect(failure.error).toMatch(/amountCents/);
    });
  });
});
