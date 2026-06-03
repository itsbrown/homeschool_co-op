/**
 * Parent Payments overview totals — separates "due now" from "remaining on plan"
 * so families on biweekly/custom plans see total left to pay, not $0 outstanding.
 */

export type BillingSummaryForOutstanding = {
  enrollmentBalance?: number;
  totalBalance?: number;
  enrollmentDetails?: Array<{ balance?: number }>;
};

/** Prefer /api/billing/summary balances over cart-filtered enrollments. */
export function resolveEnrollmentOutstandingForOverview(input: {
  billingSummary?: BillingSummaryForOutstanding | null;
  cartOutstandingCents: number;
}): number {
  if (input.billingSummary != null) {
    if (typeof input.billingSummary.enrollmentBalance === 'number') {
      return Math.max(0, Math.round(input.billingSummary.enrollmentBalance));
    }
    const fromDetails = (input.billingSummary.enrollmentDetails ?? []).reduce(
      (sum, row) => sum + Math.max(0, Math.round(row.balance ?? 0)),
      0,
    );
    if (fromDetails > 0) {
      return fromDetails;
    }
    if (typeof input.billingSummary.totalBalance === 'number') {
      return Math.max(0, Math.round(input.billingSummary.totalBalance));
    }
  }
  return Math.max(0, Math.round(input.cartOutstandingCents));
}

export function countBillingOutstandingEnrollments(
  billingSummary?: BillingSummaryForOutstanding | null,
): number {
  return (billingSummary?.enrollmentDetails ?? []).filter(
    (row) => (row.balance ?? 0) > 0,
  ).length;
}

export interface UpcomingPaymentForOverview {
  amount?: number | null;
  dueDate?: Date | string | null;
  status?: string | null;
  overdue?: boolean;
  isCheckoutDue?: boolean;
}

export interface PaymentOverviewTotals {
  paidSoFarCents: number;
  /** Enrollment balances + overdue/failed/checkout-due installments */
  dueNowCents: number;
  /** Future scheduled installments (not yet due) */
  planRemainingCents: number;
  /** dueNow + plan remaining */
  totalRemainingCents: number;
  upcomingInstallmentCount: number;
  nextPayment: { amountCents: number; dueDate: Date } | null;
}

function isUrgentScheduledPayment(p: UpcomingPaymentForOverview): boolean {
  const status = String(p.status ?? '').toLowerCase();
  return (
    p.isCheckoutDue === true ||
    status === 'checkout_due' ||
    status === 'failed' ||
    p.overdue === true
  );
}

function parseDueDate(dueDate: Date | string | null | undefined): Date | null {
  if (dueDate == null || dueDate === '') return null;
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computePaymentOverviewTotals(input: {
  enrollmentOutstandingCents: number;
  upcomingPayments: UpcomingPaymentForOverview[];
  paidSoFarCents: number;
}): PaymentOverviewTotals {
  const enrollmentOutstandingCents = Math.max(
    0,
    Math.round(input.enrollmentOutstandingCents),
  );
  const paidSoFarCents = Math.max(0, Math.round(input.paidSoFarCents));

  let dueNowFromSchedule = 0;
  let planRemainingCents = 0;
  let upcomingInstallmentCount = 0;
  const installmentDates: { amountCents: number; dueDate: Date }[] = [];

  for (const p of input.upcomingPayments) {
    const amountCents = Math.max(0, Math.round(p.amount ?? 0));
    if (amountCents <= 0) continue;

    upcomingInstallmentCount += 1;
    const due = parseDueDate(p.dueDate ?? null);
    if (due) {
      installmentDates.push({ amountCents, dueDate: due });
    }

    if (isUrgentScheduledPayment(p)) {
      dueNowFromSchedule += amountCents;
    } else {
      planRemainingCents += amountCents;
    }
  }

  const dueNowCents = enrollmentOutstandingCents + dueNowFromSchedule;
  const totalRemainingCents = dueNowCents + planRemainingCents;

  installmentDates.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const nextPayment = installmentDates[0] ?? null;

  return {
    paidSoFarCents,
    dueNowCents,
    planRemainingCents,
    totalRemainingCents,
    upcomingInstallmentCount,
    nextPayment,
  };
}

/** Net remaining after FIFO credit application to upcoming installments (then due now). */
export function computeNetTotalRemainingCents(
  overview: PaymentOverviewTotals,
  creditsAvailableCents: number,
): number {
  let creditsLeft = Math.max(0, Math.round(creditsAvailableCents));
  let planNet = overview.planRemainingCents;
  let dueNet = overview.dueNowCents;

  if (creditsLeft > 0 && planNet > 0) {
    const applied = Math.min(planNet, creditsLeft);
    planNet -= applied;
    creditsLeft -= applied;
  }
  if (creditsLeft > 0 && dueNet > 0) {
    const applied = Math.min(dueNet, creditsLeft);
    dueNet -= applied;
  }

  return Math.max(0, dueNet + planNet);
}
