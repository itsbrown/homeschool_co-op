import { AUTOPAY_MAX_RETRY_ATTEMPTS } from "./autopay-policy";
import { type AutoPayMetricsSink, emitAutoPayMetric } from "./autopay-observability";

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
  metricsSink?: AutoPayMetricsSink,
): Promise<AutoPayReconciliationResult[]> {
  const criteria = buildAutoPayReconciliationCriteria(now);
  const processingPayments = await repository.queryProcessingScheduledPayments(criteria);
  const results: AutoPayReconciliationResult[] = [];
  emitAutoPayMetric(metricsSink, {
    metric: "autopay_backlog_total",
    labels: {
      source: "reconciliation",
      reason_code: "stuck_processing_backlog",
      backlog_size: processingPayments.length,
    },
  });

  for (const payment of processingPayments) {
    const retryCount = Number.isFinite(payment.retryCount)
      ? Math.max(0, Math.floor(Number(payment.retryCount)))
      : 0;

    if (!payment.stripePaymentIntentId) {
      emitAutoPayMetric(metricsSink, {
        metric: "autopay_divergence_total",
        labels: {
          source: "reconciliation",
          divergence_code: "processing_without_payment_intent",
        },
      });
      const nextRetry = retryCount + 1;
      if (nextRetry >= AUTOPAY_MAX_RETRY_ATTEMPTS) {
        await repository.markScheduledPaymentFailed(payment.id, {
          reason: "missing_payment_intent",
          retryCount: nextRetry,
        });
        emitAutoPayMetric(metricsSink, {
          metric: "autopay_failure_total",
          labels: {
            source: "reconciliation",
            action: "failed_retry_cap_reached",
            reason_code: "retry_exhausted",
            prior_reason_code: "missing_payment_intent",
          },
        });
        results.push({ paymentId: payment.id, action: "failed_retry_cap_reached" });
      } else {
        await repository.markScheduledPaymentPending(payment.id, {
          reason: "missing_payment_intent",
          retryCount: nextRetry,
        });
        emitAutoPayMetric(metricsSink, {
          metric: "autopay_failure_total",
          labels: {
            source: "reconciliation",
            action: "moved_to_pending_for_retry",
            reason_code: "missing_payment_intent",
          },
        });
        results.push({ paymentId: payment.id, action: "failed_missing_payment_intent" });
      }
      continue;
    }

    const stripeStatus = await stripeGateway.getPaymentIntentStatus(payment.stripePaymentIntentId);
    if (stripeStatus === "succeeded") {
      await repository.markScheduledPaymentCompleted(payment.id, now);
      emitAutoPayMetric(metricsSink, {
        metric: "autopay_divergence_total",
        labels: {
          source: "reconciliation",
          divergence_code: "processing_vs_stripe_succeeded",
        },
      });
      emitAutoPayMetric(metricsSink, {
        metric: "autopay_transition_total",
        labels: {
          source: "reconciliation",
          action: "completed_from_stripe_truth",
          reason_code: "stripe_succeeded",
        },
      });
      results.push({ paymentId: payment.id, action: "completed_from_stripe_truth" });
      continue;
    }

    if (stripeStatus === "processing") {
      emitAutoPayMetric(metricsSink, {
        metric: "autopay_transition_total",
        labels: {
          source: "reconciliation",
          action: "left_processing",
          reason_code: "stripe_processing",
        },
      });
      results.push({ paymentId: payment.id, action: "left_processing" });
      continue;
    }

    emitAutoPayMetric(metricsSink, {
      metric: "autopay_divergence_total",
      labels: {
        source: "reconciliation",
        divergence_code: "processing_vs_stripe_non_processing",
        stripe_status: stripeStatus,
      },
    });
    const nextRetry = retryCount + 1;
    if (nextRetry >= AUTOPAY_MAX_RETRY_ATTEMPTS) {
      await repository.markScheduledPaymentFailed(payment.id, {
        reason: `stripe_${stripeStatus}`,
        retryCount: nextRetry,
      });
      emitAutoPayMetric(metricsSink, {
        metric: "autopay_failure_total",
        labels: {
          source: "reconciliation",
          action: "failed_retry_cap_reached",
          reason_code: "retry_exhausted",
          stripe_status: `stripe_${stripeStatus}`,
        },
      });
      results.push({ paymentId: payment.id, action: "failed_retry_cap_reached" });
      continue;
    }

    await repository.markScheduledPaymentPending(payment.id, {
      reason: `stripe_${stripeStatus}`,
      retryCount: nextRetry,
    });
    emitAutoPayMetric(metricsSink, {
      metric: "autopay_transition_total",
      labels: {
        source: "reconciliation",
        action: "moved_to_pending_for_retry",
        reason_code: `stripe_${stripeStatus}`,
      },
    });
    results.push({ paymentId: payment.id, action: "moved_to_pending_for_retry" });
  }

  return results;
}
