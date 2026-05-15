import { computeEffectiveBalance } from '@shared/schema';

/** Enrollment row shape from DB / storage (may include generated `effective_balance`). */
export type EnrollmentBalanceInput = {
  effectiveBalance?: number | null;
  totalCost?: number | null;
  totalPaid?: number | null;
  compAmountCents?: number | null;
};

/**
 * Canonical outstanding cents for an enrollment — prefer DB `effective_balance`,
 * else computeEffectiveBalance (matches generated column formula).
 */
export function resolveEnrollmentOutstandingCents(enrollment: EnrollmentBalanceInput): number {
  const fromGenerated = (enrollment as { effectiveBalance?: number | null }).effectiveBalance;
  if (fromGenerated != null && Number.isFinite(Number(fromGenerated))) {
    return Math.max(0, Number(fromGenerated));
  }
  return computeEffectiveBalance(
    enrollment.totalCost ?? 0,
    enrollment.totalPaid ?? 0,
    enrollment.compAmountCents ?? 0,
  );
}
