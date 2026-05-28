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
  metadata?: unknown;
  totalInstallments?: number | null;
  frequency?: string | null;
};

const ACTIONABLE_SCHEDULE_STATUSES = new Set([
  "pending",
  "processing",
  "failed",
  "overdue",
]);

/** All enrollment IDs covered by one scheduled_payment row (cart checkout often bundles many). */
export function resolveEnrollmentIdsFromScheduledRow(row: {
  enrollmentId?: number | null;
  metadata?: unknown;
}): number[] {
  const meta = row.metadata as Record<string, unknown> | null | undefined;
  const fromMeta = meta?.enrollmentIds;
  if (typeof fromMeta === "string" && fromMeta.trim() !== "") {
    try {
      const parsed = JSON.parse(fromMeta) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed.filter(
          (id): id is number => typeof id === "number" && Number.isFinite(id),
        );
        if (ids.length > 0) return ids;
      }
    } catch {
      /* ignore */
    }
  }
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    const ids = fromMeta.filter(
      (id): id is number => typeof id === "number" && Number.isFinite(id),
    );
    if (ids.length > 0) return ids;
  }
  if (row.enrollmentId != null && Number.isFinite(Number(row.enrollmentId))) {
    return [Number(row.enrollmentId)];
  }
  return [];
}

function scheduledRowIsInstallmentPlan(sp: ScheduledPaymentRow): boolean {
  const meta = sp.metadata as Record<string, unknown> | null | undefined;
  const plan = String(meta?.paymentPlan ?? "")
    .trim()
    .toLowerCase();
  if (INSTALLMENT_PAYMENT_PLANS.has(plan) || plan.includes("biweekly")) {
    return true;
  }
  const freq = String(sp.frequency ?? meta?.frequency ?? "")
    .trim()
    .toLowerCase();
  if (freq === "biweekly") return true;
  const total = Number(sp.totalInstallments ?? meta?.totalInstallments ?? 0);
  return Number.isFinite(total) && total > 1;
}

/** Enrollment IDs tied to any actionable installment row for this parent. */
export function enrollmentIdsOnActiveInstallmentSchedules(
  scheduledPayments: ScheduledPaymentRow[] | null | undefined,
): Set<number> {
  const ids = new Set<number>();
  if (!scheduledPayments?.length) return ids;
  for (const sp of scheduledPayments) {
    if (!ACTIONABLE_SCHEDULE_STATUSES.has(String(sp.status ?? "").toLowerCase())) {
      continue;
    }
    if (!scheduledRowIsInstallmentPlan(sp)) continue;
    for (const id of resolveEnrollmentIdsFromScheduledRow(sp)) {
      ids.add(id);
    }
  }
  return ids;
}

export function enrollmentHasActivePaymentSchedule(
  enrollmentId: number,
  scheduledPayments: ScheduledPaymentRow[] | null | undefined,
): boolean {
  if (!scheduledPayments?.length) return false;
  return scheduledPayments.some((sp) => {
    const linkedIds = resolveEnrollmentIdsFromScheduledRow(sp);
    if (!linkedIds.includes(enrollmentId)) return false;
    return ACTIONABLE_SCHEDULE_STATUSES.has(String(sp.status ?? "").toLowerCase());
  });
}

export function normalizePaymentPlan(
  enrollment: {
    paymentPlan?: string | null;
    payment_plan?: string | null;
    paymentFrequency?: string | null;
    payment_frequency?: string | null;
    metadata?: unknown;
  },
): string {
  const column = String(enrollment.paymentPlan ?? enrollment.payment_plan ?? "")
    .trim()
    .toLowerCase();
  if (column) return column;

  const meta = enrollment.metadata as Record<string, unknown> | null | undefined;
  if (meta?.paymentPlan != null) {
    const fromMeta = String(meta.paymentPlan).trim().toLowerCase();
    if (fromMeta === "full") return "full_payment";
    if (fromMeta) return fromMeta;
  }

  const freq = String(
    enrollment.paymentFrequency ?? enrollment.payment_frequency ?? "",
  )
    .trim()
    .toLowerCase();
  if (freq === "biweekly") return "biweekly";

  return "";
}

export function isStripeManagedPaymentSystem(
  enrollment: {
    paymentSystemVersion?: string | null;
    payment_system_version?: string | null;
  },
): boolean {
  const psv = String(
    enrollment.paymentSystemVersion ?? enrollment.payment_system_version ?? "",
  )
    .trim()
    .toLowerCase();
  return psv === "v2_stripe" || psv.startsWith("v2_stripe");
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
  const paid = Number(enrollment.totalPaid ?? 0);
  const status = String(enrollment.status ?? "").toLowerCase();

  if (status === "location_wishlist") {
    return true;
  }

  if (enrollment.checkoutExcluded === true || enrollment.managedByPaymentPlan === true) {
    return true;
  }

  const paymentStatus = String(
    (enrollment as { paymentStatus?: string }).paymentStatus ?? "",
  ).toLowerCase();
  if (paymentStatus === "stripe_managed") {
    return true;
  }

  const enrollmentId = enrollment.id;
  if (enrollmentId != null && scheduledPayments?.length) {
    const onInstallmentSchedule =
      enrollmentIdsOnActiveInstallmentSchedules(scheduledPayments);
    if (onInstallmentSchedule.has(enrollmentId)) {
      // Pre-first-payment enrollments can carry stale scheduled rows from abandoned checkouts.
      // Keep these cart-eligible so families can complete the first payment instead of hitting
      // a "payment due goes nowhere" dead-end on the dashboard.
      const isPreFirstPayment =
        paid <= 0 &&
        (status === "pending_payment" || status === "pending_admin_approval");
      if (!isPreFirstPayment) {
        return true;
      }
    }
    if (enrollmentHasActivePaymentSchedule(enrollmentId, scheduledPayments)) {
      const isPreFirstPayment =
        paid <= 0 &&
        (status === "pending_payment" || status === "pending_admin_approval");
      if (!isPreFirstPayment) {
        return true;
      }
    }
  }

  const plan = normalizePaymentPlan(enrollment);
  const isInstallmentPlan =
    INSTALLMENT_PAYMENT_PLANS.has(plan) || plan.includes("biweekly");

  if (!isInstallmentPlan) {
    return false;
  }

  if (isStripeManagedPaymentSystem(enrollment) && paid > 0) {
    return true;
  }

  if (
    status === "deposit_paid" ||
    paymentStatus === "partial_payment" ||
    (status === "enrolled" && isInstallmentPlan)
  ) {
    return true;
  }

  if (isInstallmentPlan && paid > 0) {
    return true;
  }

  return false;
}
