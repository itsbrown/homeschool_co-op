import { sql, type SQL } from 'drizzle-orm';
import { programEnrollments } from '@shared/schema';
import { computeEffectiveBalance } from '@shared/schema';

/**
 * SQL per-row outstanding cents — matches the generated `effective_balance` column.
 * Use when the generated column may be absent (DB not yet migrated via init-db).
 */
export function sqlEnrollmentEffectiveBalanceExpr(): SQL {
  return sql`GREATEST(0, ${programEnrollments.totalCost} - ${programEnrollments.totalPaid} - COALESCE(comp_amount_cents, 0))`;
}

export function sqlEnrollmentEffectiveBalancePositive(): SQL {
  return sql`${sqlEnrollmentEffectiveBalanceExpr()} > 0`;
}

export function sqlSumEnrollmentEffectiveBalance(): SQL<number> {
  return sql<number>`COALESCE(SUM(${sqlEnrollmentEffectiveBalanceExpr()}), 0)::integer`;
}

export function sqlSumCompAmountCents(): SQL<number> {
  return sql<number>`COALESCE(SUM(COALESCE(comp_amount_cents, 0)), 0)::integer`;
}

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
