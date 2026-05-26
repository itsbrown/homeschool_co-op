import { computeEffectiveBalance } from '@shared/schema';

/**
 * Outstanding cents for a program_enrollment row: same contract as the DB-generated
 * `effective_balance` column and `client/src/utils/parentBalance.ts`.
 *
 * Prefer `effectiveBalance` when present; never use stored `remainingBalance` alone —
 * Stripe-managed plans keep `remaining_balance` at 0 while the family still owes.
 */
export function resolveEnrollmentEffectiveBalance(enrollment: any): number {
  const computed = computeEffectiveBalance(
    enrollment?.totalCost ?? 0,
    enrollment?.totalPaid ?? 0,
    enrollment?.compAmountCents ?? 0,
  );
  const fromDb = enrollment?.effectiveBalance;
  if (fromDb != null && Number.isFinite(Number(fromDb))) {
    const stored = Math.max(0, Number(fromDb));
    if (stored !== computed) {
      // stored effective_balance drifted from formula (e.g. comp_amount_cents applied after
      // the generated column was last written); prefer the computed value
      return computed;
    }
    return stored;
  }
  return computed;
}
