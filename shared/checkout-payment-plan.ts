/**
 * Single source of truth for cart checkout payment plan + frequency.
 * Prevents mismatches where paymentFrequency builds biweekly installments
 * while paymentPlan stamps enrollments as full_payment.
 */

export type CheckoutPaymentPlanId = "full" | "deposit" | "split" | "biweekly";

export type CheckoutPaymentFrequency =
  | "one_time"
  | "weekly"
  | "biweekly"
  | "monthly";

export type DbPaymentPlan =
  | "full_payment"
  | "deposit_only"
  | "biweekly"
  | "custom";

const PLAN_TO_DB: Record<CheckoutPaymentPlanId, DbPaymentPlan> = {
  full: "full_payment",
  deposit: "deposit_only",
  split: "custom",
  biweekly: "biweekly",
};

const VALID_PLANS = new Set<string>(["full", "deposit", "split", "biweekly"]);
const VALID_FREQUENCIES = new Set<string>([
  "one_time",
  "weekly",
  "biweekly",
  "monthly",
]);

export function mapCheckoutPlanToDbPaymentPlan(
  plan: CheckoutPaymentPlanId,
): DbPaymentPlan {
  return PLAN_TO_DB[plan];
}

/**
 * Normalize client checkout payload so plan, frequency, and DB column agree.
 * When plan is biweekly but frequency was left one_time (or vice versa), plan wins.
 */
export function normalizeCheckoutPaymentPlanRequest(
  rawPlan: string | null | undefined,
  rawFrequency: string | null | undefined,
): {
  paymentPlan: CheckoutPaymentPlanId;
  paymentFrequency: CheckoutPaymentFrequency;
  dbPaymentPlan: DbPaymentPlan;
  corrected: boolean;
} {
  const planRaw = String(rawPlan ?? "full")
    .trim()
    .toLowerCase();
  const paymentPlan: CheckoutPaymentPlanId = VALID_PLANS.has(planRaw)
    ? (planRaw as CheckoutPaymentPlanId)
    : "full";

  let freqRaw = String(rawFrequency ?? "one_time")
    .trim()
    .toLowerCase();
  if (!VALID_FREQUENCIES.has(freqRaw)) {
    freqRaw = "one_time";
  }

  let paymentFrequency = freqRaw as CheckoutPaymentFrequency;
  let corrected = false;

  if (paymentPlan === "biweekly") {
    if (paymentFrequency !== "biweekly") {
      paymentFrequency = "biweekly";
      corrected = true;
    }
  } else if (paymentPlan === "full" || paymentPlan === "deposit") {
    if (paymentFrequency !== "one_time") {
      paymentFrequency = "one_time";
      corrected = true;
    }
  } else if (paymentPlan === "split") {
    // Split allows weekly / biweekly / monthly; default one_time if invalid combo
    if (
      paymentFrequency !== "weekly" &&
      paymentFrequency !== "biweekly" &&
      paymentFrequency !== "monthly"
    ) {
      paymentFrequency = "one_time";
      corrected = true;
    }
  }

  return {
    paymentPlan,
    paymentFrequency,
    dbPaymentPlan: mapCheckoutPlanToDbPaymentPlan(paymentPlan),
    corrected,
  };
}

/** True when checkout should build installment phases (not pay-in-full today). */
export function checkoutPlanUsesInstallmentPhases(
  paymentPlan: CheckoutPaymentPlanId,
  paymentFrequency: CheckoutPaymentFrequency,
): boolean {
  if (paymentPlan === "biweekly") return true;
  if (paymentPlan === "deposit" || paymentPlan === "split") return true;
  return false;
}
