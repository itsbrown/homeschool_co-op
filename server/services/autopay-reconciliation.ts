import { AUTOPAY_MAX_RETRY_ATTEMPTS } from "./autopay-policy";

export const AUTOPAY_PROCESSING_STUCK_MINUTES = 30;

export type StripePaymentIntentTruth =
  | "succeeded"
  | "processing"
  | "requires_payment_method"
  | "requires_action"
  | "requires_confirmation"
  | "canceled";

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

    const stripeStatus = await stripeGateway.getPaymentIntentStatus(payment.stripePaymentIntentId);
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
  }

  return results;
}
