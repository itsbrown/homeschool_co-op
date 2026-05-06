/**
 * Single source of truth for "how many cents does this program enrollment still owe?"
 *
 * Prefer recomputing from total_cost / total_paid / comp when a comp is present (fixes N2-style drift).
 * Otherwise trust stored remaining_balance when set (fast path for the common case).
 *
 * Comp columns may exist in production before they appear in the Drizzle schema; read via index signature.
 */
export type ProgramEnrollmentLike = {
  totalCost?: number | null;
  totalPaid?: number | null;
  remainingBalance?: number | null;
} & Record<string, unknown>;

function compAmountCents(enrollment: ProgramEnrollmentLike): number {
  const raw =
    (enrollment as any).compAmountCents ??
    (enrollment as any).comp_amount_cents ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function programEnrollmentOwedCents(enrollment: ProgramEnrollmentLike): number {
  const totalCost = Math.max(0, Math.round(Number(enrollment.totalCost ?? 0)));
  const totalPaid = Math.max(0, Math.round(Number(enrollment.totalPaid ?? 0)));
  const comp = compAmountCents(enrollment);

  if (comp > 0) {
    return Math.max(0, totalCost - totalPaid - comp);
  }

  if (enrollment.remainingBalance != null && enrollment.remainingBalance !== undefined) {
    return Math.max(0, Math.round(Number(enrollment.remainingBalance)));
  }

  return Math.max(0, totalCost - totalPaid);
}

export function sumProgramEnrollmentsOwedCents(
  enrollments: Array<ProgramEnrollmentLike | null | undefined>
): number {
  return enrollments.reduce((sum, e) => sum + (e ? programEnrollmentOwedCents(e) : 0), 0);
}
