import { AUTOPAY_PROCESSING_STUCK_MINUTES } from "./autopay-observability";
import { AUTOPAY_MAX_RETRY_ATTEMPTS } from "./autopay-policy";

export { AUTOPAY_PROCESSING_STUCK_MINUTES };
export { buildAutoPayReconciliationLabels } from "./autopay-observability";

/** Test / seed PaymentIntent ids that must never hit Stripe.retrieve (fixtures, local JSON, jest). */
const DEV_FIXTURE_STRIPE_PAYMENT_INTENT_IDS = new Set([
  "pi_multi_1",
  "pi_single_fallback",
  "pi_equiv_test_1",
  "pi_sched_success_1",
]);

export function isDevFixtureStripePaymentIntentId(paymentIntentId: string | null | undefined): boolean {
  if (!paymentIntentId || typeof paymentIntentId !== "string") return false;
  return DEV_FIXTURE_STRIPE_PAYMENT_INTENT_IDS.has(paymentIntentId.trim());
}

export type StripePaymentIntentTruth =
  | "succeeded"
  | "processing"
  | "requires_payment_method"
  | "requires_action"
  | "requires_confirmation"
  | "canceled";

/** Maps Stripe PaymentIntent.status to the reconciliation truth union (no Stripe SDK import). */
export function mapStripePaymentIntentStatusString(stripeStatus: string): StripePaymentIntentTruth {
  switch (stripeStatus) {
    case "succeeded":
      return "succeeded";
    case "processing":
      return "processing";
    case "requires_payment_method":
      return "requires_payment_method";
    case "requires_action":
      return "requires_action";
    case "requires_confirmation":
      return "requires_confirmation";
    case "canceled":
      return "canceled";
    /** Uncaptured authorized funds — treat like in-flight processing until capture or cancel. */
    case "requires_capture":
      return "processing";
    default:
      return "requires_payment_method";
  }
}

export interface ProcessingScheduledPaymentLike {
  id: number;
  amount: number;
  retryCount?: number | null;
  status: string;
  stripePaymentIntentId?: string | null;
  updatedAt?: Date | string | null;
}

export interface AutoPayReconciliationQueryCriteria {
  status: "processing";
  updatedBefore: Date;
}

export interface AutoPayReconciliationRepository<T extends ProcessingScheduledPaymentLike> {
  queryProcessingScheduledPayments(criteria: AutoPayReconciliationQueryCriteria): Promise<T[]>;
  markScheduledPaymentCompleted(id: number, processedAt: Date): Promise<void>;
  markScheduledPaymentFailed(id: number, params: { reason: string; retryCount: number }): Promise<void>;
  markScheduledPaymentPending(id: number, params: { reason: string; retryCount: number }): Promise<void>;
}

export interface StripeTruthGateway {
  getPaymentIntentStatus(paymentIntentId: string): Promise<StripePaymentIntentTruth>;
}

export interface AutoPayReconciliationResult {
  paymentId: number;
  action:
    | "completed_from_stripe_truth"
    | "left_processing"
    | "failed_missing_payment_intent"
    | "failed_retry_cap_reached"
    | "failed_dev_fixture_stripe_intent"
    | "moved_to_pending_for_retry";
}

export function buildAutoPayReconciliationCriteria(
  now: Date = new Date(),
): AutoPayReconciliationQueryCriteria {
  return {
    status: "processing",
    updatedBefore: new Date(now.getTime() - AUTOPAY_PROCESSING_STUCK_MINUTES * 60_000),
  };
}

export async function reconcileStuckAutoPayProcessingAttempts<T extends ProcessingScheduledPaymentLike>(
  repository: AutoPayReconciliationRepository<T>,
  stripeGateway: StripeTruthGateway,
  now: Date = new Date(),
): Promise<AutoPayReconciliationResult[]> {
  const criteria = buildAutoPayReconciliationCriteria(now);
  const processingPayments = await repository.queryProcessingScheduledPayments(criteria);
  const results: AutoPayReconciliationResult[] = [];

  for (const payment of processingPayments) {
    try {
      const retryCount = Number.isFinite(payment.retryCount)
        ? Math.max(0, Math.floor(Number(payment.retryCount)))
        : 0;

      if (!payment.stripePaymentIntentId) {
        const nextRetry = retryCount + 1;
        if (nextRetry >= AUTOPAY_MAX_RETRY_ATTEMPTS) {
          await repository.markScheduledPaymentFailed(payment.id, {
            reason: "missing_payment_intent",
            retryCount: nextRetry,
          });
          results.push({ paymentId: payment.id, action: "failed_retry_cap_reached" });
        } else {
          await repository.markScheduledPaymentPending(payment.id, {
            reason: "missing_payment_intent",
            retryCount: nextRetry,
          });
          results.push({ paymentId: payment.id, action: "failed_missing_payment_intent" });
        }
        continue;
      }

      const piId = payment.stripePaymentIntentId.trim();
      if (isDevFixtureStripePaymentIntentId(piId)) {
        console.warn(
          `[autopay-reconciliation] payment ${payment.id}: terminal-fail dev fixture PaymentIntent id (not live Stripe)`,
        );
        await repository.markScheduledPaymentFailed(payment.id, {
          reason: "dev_fixture_stripe_payment_intent_id",
          retryCount: AUTOPAY_MAX_RETRY_ATTEMPTS,
        });
        results.push({ paymentId: payment.id, action: "failed_dev_fixture_stripe_intent" });
        continue;
      }

      const stripeStatus = await stripeGateway.getPaymentIntentStatus(piId);
      if (stripeStatus === "succeeded") {
        await repository.markScheduledPaymentCompleted(payment.id, now);
        results.push({ paymentId: payment.id, action: "completed_from_stripe_truth" });
        continue;
      }

      if (stripeStatus === "processing") {
        results.push({ paymentId: payment.id, action: "left_processing" });
        continue;
      }

      const nextRetry = retryCount + 1;
      if (nextRetry >= AUTOPAY_MAX_RETRY_ATTEMPTS) {
        await repository.markScheduledPaymentFailed(payment.id, {
          reason: `stripe_${stripeStatus}`,
          retryCount: nextRetry,
        });
        results.push({ paymentId: payment.id, action: "failed_retry_cap_reached" });
        continue;
      }

      await repository.markScheduledPaymentPending(payment.id, {
        reason: `stripe_${stripeStatus}`,
        retryCount: nextRetry,
      });
      results.push({ paymentId: payment.id, action: "moved_to_pending_for_retry" });
    } catch (err) {
      console.error(`[autopay-reconciliation] payment ${payment.id}:`, err);
    }
  }

  return results;
}
