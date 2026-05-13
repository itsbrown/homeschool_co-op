import { computeEffectiveBalance } from '@shared/schema';

/**
 * Outstanding cents for a program_enrollment row: same contract as the DB-generated
 * `effective_balance` column and `client/src/utils/parentBalance.ts`.
 *
 * Prefer `effectiveBalance` when present; never use stored `remainingBalance` alone —
 * Stripe-managed plans keep `remaining_balance` at 0 while the family still owes.
 */
export function resolveEnrollmentEffectiveBalance(enrollment: any): number {
  return (
    enrollment?.effectiveBalance ??
    computeEffectiveBalance(
      enrollment?.totalCost ?? 0,
      enrollment?.totalPaid ?? 0,
      enrollment?.compAmountCents ?? 0,
    )
  );
}
