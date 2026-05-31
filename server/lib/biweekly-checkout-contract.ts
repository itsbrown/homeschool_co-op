/**
 * Golden contract for biweekly checkout: one fixture + helpers used by unit and
 * integration tests so cart display, Stripe phases, and scheduled_payments stay aligned.
 */

import {
  BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS,
  biweeklyInstallmentScheduleEndDate,
  calculateCheckoutBiweeklySchedule,
  checkoutAnchorDate,
  type CheckoutBiweeklySchedule,
} from './payment-calculator';

/** Fixed anchor so tests are deterministic (class starts after "today"). */
export const GOLDEN_BIWEEKLY_CHECKOUT = {
  programStart: new Date(2030, 0, 1),
  programEnd: new Date(2030, 5, 1),
  anchorDate: new Date(2029, 11, 1),
  totalAmountCents: 250_000,
} as const;

export type BiweeklyCheckoutPhase = {
  dueDate: Date;
  amount: number;
  installmentNumber: number;
};

export type BiweeklyPaymentPlanShape = {
  id: string;
  amount: number;
  numberOfPayments: number;
  totalAmount: number;
  finalPaymentAmount: number;
};

export function utcCalendarDay(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getExpectedBiweeklyCheckout(
  overrides: {
    programStart?: Date;
    programEnd?: Date;
    totalAmountCents?: number;
    anchorDate?: Date;
  } = {},
): CheckoutBiweeklySchedule {
  const programStart = overrides.programStart ?? GOLDEN_BIWEEKLY_CHECKOUT.programStart;
  const programEnd = overrides.programEnd ?? GOLDEN_BIWEEKLY_CHECKOUT.programEnd;
  const totalAmountCents =
    overrides.totalAmountCents ?? GOLDEN_BIWEEKLY_CHECKOUT.totalAmountCents;
  const anchorDate = overrides.anchorDate ?? GOLDEN_BIWEEKLY_CHECKOUT.anchorDate;
  return calculateCheckoutBiweeklySchedule(
    totalAmountCents,
    programStart,
    programEnd,
    anchorDate,
  );
}

/** Same installment dates/amounts as StripePaymentPlanService biweekly branch. */
export function buildBiweeklyCheckoutPhases(
  totalAmountCents: number,
  programStart: Date,
  programEnd: Date,
  anchorDate?: Date,
): BiweeklyCheckoutPhase[] {
  const checkout = getExpectedBiweeklyCheckout({
    programStart,
    programEnd,
    totalAmountCents,
    anchorDate,
  });
  if (checkout.numberOfPayments < 2) {
    return [
      {
        dueDate: anchorDate ?? new Date(),
        amount: totalAmountCents,
        installmentNumber: 1,
      },
    ];
  }
  return checkout.paymentDates.map((dueDate, index) => ({
    dueDate,
    amount:
      index === checkout.paymentDates.length - 1
        ? checkout.finalPaymentAmount
        : checkout.paymentAmount,
    installmentNumber: index + 1,
  }));
}

/**
 * Rebuild biweekly phases from checkout PI metadata when enrollment program dates
 * are missing at webhook time but metadata still says N installments (e.g. 12).
 * Uses equal split + 14-day spacing from anchor — matches checkout amounts, not
 * necessarily program-end-boundary dates from cart.
 */
export function buildBiweeklyPhasesFromInstallmentMetadata(
  totalAmountCents: number,
  totalInstallments: number,
  anchorDate?: Date,
): BiweeklyCheckoutPhase[] {
  if (totalInstallments < 2) {
    return [
      {
        dueDate: anchorDate ?? checkoutAnchorDate(),
        amount: totalAmountCents,
        installmentNumber: 1,
      },
    ];
  }
  const base = Math.floor(totalAmountCents / totalInstallments);
  const remainder = totalAmountCents - base * totalInstallments;
  const anchor = anchorDate ?? checkoutAnchorDate();
  return Array.from({ length: totalInstallments }, (_, i) => {
    const dueDate = new Date(anchor);
    dueDate.setDate(dueDate.getDate() + i * 14);
    return {
      dueDate,
      amount: i === totalInstallments - 1 ? base + remainder : base,
      installmentNumber: i + 1,
    };
  });
}

export function assertAllDueDatesOnOrBeforeBiweeklyBoundary(
  dueDates: Date[],
  programEnd: Date,
): void {
  const boundary = biweeklyInstallmentScheduleEndDate(programEnd);
  const boundaryDay = utcCalendarDay(boundary);
  for (const d of dueDates) {
    if (utcCalendarDay(d) > boundaryDay) {
      throw new Error(
        `Due date ${d.toISOString()} is after biweekly boundary ${boundary.toISOString()} (end − ${BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS}d)`,
      );
    }
  }
}

export function assertPhaseAmountsSumToTotal(
  phases: BiweeklyCheckoutPhase[],
  totalAmountCents: number,
): void {
  const sum = phases.reduce((s, p) => s + p.amount, 0);
  if (sum !== totalAmountCents) {
    throw new Error(`Phase amounts sum ${sum} !== ${totalAmountCents}`);
  }
}

/** Cart snapshot / calculatePaymentPlans biweekly option must match checkout schedule. */
export function assertBiweeklyPlanMatchesCheckout(
  plan: BiweeklyPaymentPlanShape,
  checkout: CheckoutBiweeklySchedule,
): void {
  if (plan.id !== 'biweekly') {
    throw new Error(`Expected plan id biweekly, got ${plan.id}`);
  }
  if (plan.numberOfPayments !== checkout.numberOfPayments) {
    throw new Error(
      `numberOfPayments ${plan.numberOfPayments} !== ${checkout.numberOfPayments}`,
    );
  }
  if (plan.amount !== checkout.paymentAmount) {
    throw new Error(`amount ${plan.amount} !== ${checkout.paymentAmount}`);
  }
  if (plan.finalPaymentAmount !== checkout.finalPaymentAmount) {
    throw new Error(
      `finalPaymentAmount ${plan.finalPaymentAmount} !== ${checkout.finalPaymentAmount}`,
    );
  }
  if (plan.totalAmount !== checkout.totalAmount) {
    throw new Error(`totalAmount ${plan.totalAmount} !== ${checkout.totalAmount}`);
  }
}
