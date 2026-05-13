import { resolveEnrollmentEffectiveBalance } from './enrollment-effective-balance';

/**
 * Enrollment statuses excluded from admin parent-profile "class amount due"
 * (see server/api/parent-profile.ts summary aggregation).
 */
export const PROFILE_CLASS_AMOUNT_DUE_EXCLUDED_STATUSES = new Set([
  'cancelled',
  'waitlist',
  'withdrawn',
  'failed',
  'completed',
]);

export function isEnrollmentIncludedInProfileClassAmountDue(
  status: string | null | undefined,
): boolean {
  if (status == null || status === '') return true;
  return !PROFILE_CLASS_AMOUNT_DUE_EXCLUDED_STATUSES.has(status);
}

/**
 * Sum of positive effective enrollment balances for rows that parent-profile
 * would include in `classAmountDue` (same status gate + same cents formula as
 * billing summary / effective_balance).
 */
export function sumProfileStyleClassEnrollmentDueCents(
  enrollments: readonly any[],
): number {
  let sum = 0;
  for (const e of enrollments) {
    if (!isEnrollmentIncludedInProfileClassAmountDue(e?.status)) continue;
    const b = resolveEnrollmentEffectiveBalance(e);
    if (b > 0) sum += b;
  }
  return sum;
}
