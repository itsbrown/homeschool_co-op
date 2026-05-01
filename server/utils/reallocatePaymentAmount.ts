/**
 * Helpers for parsing the request body of
 * `POST /api/admin/enrollments/:id/reallocate-payment`.
 *
 * The endpoint canonical contract is `amountCents: number` (positive integer).
 * For one release we also accept the legacy `amount: number` (dollars) field
 * so any unmigrated caller keeps working — but every dollars-path hit emits a
 * deprecation warning so we can detect remaining traffic in the logs.
 *
 * This module exists so the parsing rules (canonical vs legacy, validation,
 * deprecation logging) can be unit-tested in isolation without spinning up
 * the Express handler / Postgres / Stripe.
 */

import { CurrencyUtils } from '../../shared/currency-utils';

export type ReallocateAmountSource = 'amountCents' | 'amount-legacy';

export interface ResolveReallocateAmountSuccess {
  ok: true;
  amountCents: number;
  source: ReallocateAmountSource;
}

export interface ResolveReallocateAmountFailure {
  ok: false;
  error: string;
}

export type ResolveReallocateAmountResult =
  | ResolveReallocateAmountSuccess
  | ResolveReallocateAmountFailure;

export interface ResolveReallocateAmountOptions {
  /**
   * Optional sink for the deprecation warning. Defaults to `console.warn`.
   * Tests inject a spy here so they can assert on the warning without
   * polluting the test runner's stderr.
   */
  warn?: (message: string) => void;
  /**
   * Optional context (e.g. caller IP, route path) appended to the deprecation
   * warning so log greps can identify the unmigrated caller.
   */
  callerHint?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Resolve the canonical `amountCents` from a reallocate-payment request body.
 *
 * Precedence rules:
 *   1. If the `amountCents` KEY is present in the body (even when its value
 *      is `null`/`undefined`/invalid), the canonical field is considered
 *      "claimed" — it must validate or the request fails. We never silently
 *      fall through to the legacy field when the caller has explicitly
 *      asserted a canonical value, since that would mask client bugs and
 *      could change the charged amount in unexpected ways.
 *   2. Otherwise, if the legacy `amount` (dollars) KEY is present, convert
 *      via `CurrencyUtils.toStorage` and emit the deprecation warning.
 *   3. Otherwise, fail with a 400-style error.
 *
 * Validation rules for `amountCents`: must be a finite, positive integer.
 * Validation rules for `amount` (legacy): must be a finite, positive number
 * (dollars are allowed to be decimal, e.g. 12.34).
 */
export function resolveReallocateAmountCents(
  body: unknown,
  options: ResolveReallocateAmountOptions = {},
): ResolveReallocateAmountResult {
  const warn = options.warn ?? ((msg: string) => console.warn(msg));

  if (!isPlainObject(body)) {
    return { ok: false, error: 'amountCents is required (positive integer, in cents)' };
  }

  const hasAmountCentsKey = hasOwn(body, 'amountCents');
  const hasAmountKey = hasOwn(body, 'amount');

  if (hasAmountCentsKey) {
    const value: unknown = body.amountCents;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value <= 0
    ) {
      return { ok: false, error: 'amountCents must be a positive integer (cents)' };
    }
    return { ok: true, amountCents: value, source: 'amountCents' };
  }

  if (hasAmountKey) {
    const value: unknown = body.amount;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return { ok: false, error: 'amount must be a positive number (in dollars)' };
    }
    const hint = options.callerHint ? ` [caller=${options.callerHint}]` : '';
    warn(
      `[DEPRECATED] /reallocate-payment received "amount" in dollars; migrate caller to "amountCents"${hint}`,
    );
    return {
      ok: true,
      amountCents: CurrencyUtils.toStorage(value),
      source: 'amount-legacy',
    };
  }

  return { ok: false, error: 'amountCents is required (positive integer, in cents)' };
}
