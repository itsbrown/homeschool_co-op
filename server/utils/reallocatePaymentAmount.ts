/**
 * Helpers for parsing the request body of
 * `POST /api/admin/enrollments/:id/reallocate-payment`.
 *
 * The endpoint contract is `amountCents: number` (positive integer). This
 * module exists so the parsing/validation rules can be unit-tested in
 * isolation without spinning up the Express handler / Postgres / Stripe.
 */

export interface ResolveReallocateAmountSuccess {
  ok: true;
  amountCents: number;
}

export interface ResolveReallocateAmountFailure {
  ok: false;
  error: string;
}

export type ResolveReallocateAmountResult =
  | ResolveReallocateAmountSuccess
  | ResolveReallocateAmountFailure;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Resolve the canonical `amountCents` from a reallocate-payment request body.
 *
 * Validation rules: must be a finite, positive integer.
 */
export function resolveReallocateAmountCents(
  body: unknown,
): ResolveReallocateAmountResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'amountCents is required (positive integer, in cents)' };
  }

  const value: unknown = (body as Record<string, unknown>).amountCents;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return { ok: false, error: 'amountCents must be a positive integer (cents)' };
  }
  return { ok: true, amountCents: value };
}
