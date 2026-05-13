import { computeEffectiveBalance } from '@shared/schema';

export type CheckoutEnrollmentBalanceInput = {
  effectiveBalance?: number | null;
  totalCost?: number | null;
  totalPaid?: number | null;
  compAmountCents?: number | null;
};

/**
 * Same semantics as `/api/cart/calculate` `resolveEnrollmentEffectiveBalance`:
 * Stripe-managed rows often store `remaining_balance = 0` while `effective_balance`
 * (or totalCost − totalPaid − comp) carries the true amount owed.
 */
export function enrollmentOutstandingCentsForCheckout(
  enrollment: CheckoutEnrollmentBalanceInput | null | undefined,
): number {
  if (enrollment?.effectiveBalance != null && Number.isFinite(Number(enrollment.effectiveBalance))) {
    return Math.max(0, Math.floor(Number(enrollment.effectiveBalance)));
  }
  return computeEffectiveBalance(
    enrollment?.totalCost ?? 0,
    enrollment?.totalPaid ?? 0,
    enrollment?.compAmountCents ?? 0,
  );
}
