import { calculateEnrollmentOwedCents, normalizeToNonNegativeIntegerCents } from "./cents-utils";

export interface SummaryEnrollmentLike {
  id: number;
  childId?: number | null;
  childName?: string | null;
  className?: string | null;
  classType?: string | null;
  classId?: number | null;
  marketplaceClassId?: number | null;
  programId?: number | null;
  status?: string | null;
  paymentStatus?: string | null;
  totalCost?: unknown;
  totalPaid?: unknown;
  remainingBalance?: unknown;
}

export interface SummaryScheduledPaymentLike {
  id: number;
  amount?: unknown;
  status?: string | null;
}

export interface BillingSummaryComputation {
  canonicalBalanceCents: number;
  enrollmentBalanceCents: number;
  scheduledPaymentsBalanceCents: number;
  pendingScheduledPaymentCount: number;
  includedEnrollmentCount: number;
}

/**
 * Computes billing summary totals from already-fetched rows.
 *
 * Important: pending scheduled payments are surfaced separately and are NOT added
 * to canonical balance to avoid double-counting enrollment debt.
 */
export function computeBillingSummaryTotals(
  enrollments: SummaryEnrollmentLike[],
  scheduledPayments: SummaryScheduledPaymentLike[],
): BillingSummaryComputation {
  const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];
  const safeScheduled = Array.isArray(scheduledPayments) ? scheduledPayments : [];

  // Include all enrollment variants (regular + marketplace + legacy) as long as they are not cancelled.
  const includedEnrollments = safeEnrollments.filter((enrollment) => {
    const status = String(enrollment.status ?? "").toLowerCase();
    return status !== "cancelled" && status !== "canceled" && status !== "withdrawn";
  });

  const enrollmentBalanceCents = includedEnrollments.reduce((sum, enrollment) => {
    const owed = calculateEnrollmentOwedCents({
      totalCostCents: enrollment.totalCost,
      totalPaidCents: enrollment.totalPaid,
      remainingBalanceCents: enrollment.remainingBalance,
    });
    return sum + owed;
  }, 0);

  const pendingScheduled = safeScheduled.filter(
    (payment) => String(payment.status ?? "").toLowerCase() === "pending",
  );
  const scheduledPaymentsBalanceCents = pendingScheduled.reduce((sum, payment) => {
    return sum + normalizeToNonNegativeIntegerCents(payment.amount);
  }, 0);

  return {
    canonicalBalanceCents: enrollmentBalanceCents,
    enrollmentBalanceCents,
    scheduledPaymentsBalanceCents,
    pendingScheduledPaymentCount: pendingScheduled.length,
    includedEnrollmentCount: includedEnrollments.length,
  };
}
