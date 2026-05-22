/**
 * Whether an enrollment should appear in checkout / parent cart.
 *
 * Installment plans (biweekly, deposit, etc.) are fulfilled via scheduled_payments,
 * not a second cart checkout. Families still show effectiveBalance > 0 while
 * installments remain — that must not re-add rows to the cart.
 */

export const INSTALLMENT_PAYMENT_PLANS = new Set([
  "biweekly",
  "deposit_only",
  "custom",
  "split",
  "three_payments",
]);

export type ScheduledPaymentRow = {
  enrollmentId?: number | null;
  status?: string | null;
};

const ACTIONABLE_SCHEDULE_STATUSES = new Set([
  "pending",
  "processing",
  "failed",
  "overdue",
]);

export function enrollmentHasActivePaymentSchedule(
  enrollmentId: number,
  scheduledPayments: ScheduledPaymentRow[] | null | undefined,
): boolean {
  if (!scheduledPayments?.length) return false;
  return scheduledPayments.some((sp) => {
    if (sp.enrollmentId == null || Number(sp.enrollmentId) !== enrollmentId) {
      return false;
    }
    return ACTIONABLE_SCHEDULE_STATUSES.has(String(sp.status ?? "").toLowerCase());
  });
}

export function normalizePaymentPlan(
  enrollment: { paymentPlan?: string | null; payment_plan?: string | null },
): string {
  return String(enrollment.paymentPlan ?? enrollment.payment_plan ?? "")
    .trim()
    .toLowerCase();
}

/**
 * True when checkout/cart must not offer this enrollment (pay via Payments → Upcoming).
 */
export function enrollmentShouldExcludeFromCart(
  enrollment: {
    id?: number;
    status?: string | null;
    paymentPlan?: string | null;
    payment_plan?: string | null;
    paymentSystemVersion?: string | null;
    payment_system_version?: string | null;
    totalPaid?: number | null;
    checkoutExcluded?: boolean;
    managedByPaymentPlan?: boolean;
  },
  scheduledPayments?: ScheduledPaymentRow[] | null,
): boolean {
  if (enrollment.checkoutExcluded === true || enrollment.managedByPaymentPlan === true) {
    return true;
  }

  const enrollmentId = enrollment.id;
  if (
    enrollmentId != null &&
    enrollmentHasActivePaymentSchedule(enrollmentId, scheduledPayments)
  ) {
    return true;
  }

  const plan = normalizePaymentPlan(enrollment);
  if (!plan || !INSTALLMENT_PAYMENT_PLANS.has(plan)) {
    return false;
  }

  const psv =
    enrollment.paymentSystemVersion ?? enrollment.payment_system_version ?? "";
  const paid = Number(enrollment.totalPaid ?? 0);
  const status = String(enrollment.status ?? "").toLowerCase();

  if (psv === "v2_stripe" && paid > 0) {
    return true;
  }

  if (
    status === "deposit_paid" ||
    (status === "enrolled" && (plan === "biweekly" || plan === "deposit_only"))
  ) {
    return true;
  }

  if (plan === "biweekly" && paid > 0) {
    return true;
  }

  return false;
}
