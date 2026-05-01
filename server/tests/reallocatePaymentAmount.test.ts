/**
 * Unit tests for `resolveReallocateAmountCents`, the request-body parser used
 * by `POST /api/admin/enrollments/:id/reallocate-payment`.
 *
 * Pins the four cases from Task 188 ("Migrate /reallocate-payment endpoint
 * and admin UI to cents"):
 *
 *   (a) `amountCents` happy path
 *   (b) legacy `amount` (dollars) still works AND emits the deprecation warning
 *   (c) when both fields are present, `amountCents` wins
 *   (d) `amountCents` is rejected when non-integer, negative, or zero
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
    it('accepts a positive integer amountCents and tags it as the canonical source', () => {
      const warn = jest.fn();
      const success = expectSuccess(resolveReallocateAmountCents({ amountCents: 5000 }, { warn }));

      expect(success.amountCents).toBe(5000);
      expect(success.source).toBe('amountCents');
      expect(warn).not.toHaveBeenCalled();
    });

    it('accepts large integer amountCents values', () => {
      const success = expectSuccess(resolveReallocateAmountCents({ amountCents: 1_234_567 }));
      expect(success.amountCents).toBe(1_234_567);
    });
  });

  // -------------------------------------------------------------------------
  // (b) legacy `amount` (dollars) still works and emits deprecation warning
  // -------------------------------------------------------------------------
  describe('legacy amount (dollars) deprecated fallback', () => {
    it('accepts a positive dollar amount, converts to cents, and warns', () => {
      const warn = jest.fn();
      const success = expectSuccess(resolveReallocateAmountCents({ amount: 50 }, { warn }));

      expect(success.amountCents).toBe(5000);
      expect(success.source).toBe('amount-legacy');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/\[DEPRECATED\]/);
      expect(warn.mock.calls[0][0]).toMatch(/amountCents/);
    });

    it('rounds dollar amounts to nearest cent (no floating-point drift)', () => {
      const warn = jest.fn();
      // 12.34 dollars → 1234 cents, even with float imprecision.
      const success = expectSuccess(resolveReallocateAmountCents({ amount: 12.34 }, { warn }));
      expect(success.amountCents).toBe(1234);
    });

    it('includes the caller hint in the deprecation warning when provided', () => {
      const warn = jest.fn();
      resolveReallocateAmountCents(
        { amount: 10 },
        { warn, callerHint: 'POST /api/admin/enrollments/42/reallocate-payment' },
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/caller=POST \/api\/admin\/enrollments\/42\/reallocate-payment/);
    });

    it('rejects a non-positive legacy amount', () => {
      const warn = jest.fn();
      expect(resolveReallocateAmountCents({ amount: 0 }, { warn }).ok).toBe(false);
      expect(resolveReallocateAmountCents({ amount: -10 }, { warn }).ok).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric legacy amount', () => {
      const warn = jest.fn();
      expect(resolveReallocateAmountCents({ amount: '50' }, { warn }).ok).toBe(false);
      expect(resolveReallocateAmountCents({ amount: NaN }, { warn }).ok).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // (c) both fields present → amountCents wins (or fails if invalid),
  //     legacy fallback is NEVER used as a silent backup
  // -------------------------------------------------------------------------
  describe('both amountCents and amount present — canonical takes precedence', () => {
    it('prefers a valid amountCents and never emits the deprecation warning', () => {
      const warn = jest.fn();
      const success = expectSuccess(
        resolveReallocateAmountCents({ amountCents: 7500, amount: 999 }, { warn }),
      );
      expect(success.amountCents).toBe(7500);
      expect(success.source).toBe('amountCents');
      expect(warn).not.toHaveBeenCalled();
    });

    // Regression guard for the "claimed canonical field" contract: once a
    // caller asserts the canonical key, an invalid value must fail rather
    // than silently fall back to the legacy dollars field — otherwise a
    // client bug could change the charged amount unexpectedly.
    it('rejects when amountCents key is present but null, even if a valid legacy amount is also present', () => {
      const warn = jest.fn();
      const failure = expectFailure(
        resolveReallocateAmountCents({ amountCents: null, amount: 50 }, { warn }),
      );
      expect(failure.error).toMatch(/amountCents/);
      expect(warn).not.toHaveBeenCalled();
    });

    it('rejects when amountCents key is present but invalid (decimal/zero/negative), even with a legacy amount fallback', () => {
      const warn = jest.fn();
      expect(resolveReallocateAmountCents({ amountCents: 50.5, amount: 50 }, { warn }).ok).toBe(false);
      expect(resolveReallocateAmountCents({ amountCents: 0, amount: 50 }, { warn }).ok).toBe(false);
      expect(resolveReallocateAmountCents({ amountCents: -1, amount: 50 }, { warn }).ok).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it('falls through to legacy amount only when the amountCents key is fully absent', () => {
      const warn = jest.fn();
      const success = expectSuccess(resolveReallocateAmountCents({ amount: 25 }, { warn }));
      expect(success.amountCents).toBe(2500);
      expect(success.source).toBe('amount-legacy');
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // (d) amountCents rejected when non-integer, negative, or zero
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
  });
});
