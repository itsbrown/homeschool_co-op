import { describe, expect, it, jest } from '@jest/globals';
import { reconcileStuckAutoPayProcessingAttempts } from '../../../services/autopay-reconciliation';
import { type AutoPayMetricEvent } from '../../../services/autopay-observability';

describe('Integration: AutoPay observability metrics contracts', () => {
  it('emits expected reconciliation transition/failure/divergence metrics', async () => {
    const metrics: AutoPayMetricEvent[] = [];
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 81, amount: 2000, status: 'processing', retryCount: 1, stripePaymentIntentId: 'pi_done' },
        { id: 82, amount: 2000, status: 'processing', retryCount: 1, stripePaymentIntentId: 'pi_retry' },
        { id: 83, amount: 2000, status: 'processing', retryCount: 2, stripePaymentIntentId: null },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async (paymentIntentId: string) => {
        if (paymentIntentId === 'pi_done') return 'succeeded' as const;
        return 'requires_payment_method' as const;
      }),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(
      repository,
      stripeGateway,
      new Date('2026-05-08T12:00:00.000Z'),
      { emit: (event) => metrics.push(event) },
    );

    expect(result).toEqual([
      { paymentId: 81, action: 'completed_from_stripe_truth' },
      { paymentId: 82, action: 'moved_to_pending_for_retry' },
      { paymentId: 83, action: 'failed_retry_cap_reached' },
    ]);

    expect(metrics).toContainEqual({
      metric: 'autopay_backlog_total',
      labels: {
        source: 'reconciliation',
        reason_code: 'stuck_processing_backlog',
        backlog_size: 3,
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_divergence_total',
      labels: {
        source: 'reconciliation',
        divergence_code: 'processing_vs_stripe_succeeded',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_transition_total',
      labels: {
        source: 'reconciliation',
        action: 'completed_from_stripe_truth',
        reason_code: 'stripe_succeeded',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_divergence_total',
      labels: {
        source: 'reconciliation',
        divergence_code: 'processing_vs_stripe_non_processing',
        stripe_status: 'requires_payment_method',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_transition_total',
      labels: {
        source: 'reconciliation',
        action: 'moved_to_pending_for_retry',
        reason_code: 'stripe_requires_payment_method',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_divergence_total',
      labels: {
        source: 'reconciliation',
        divergence_code: 'processing_without_payment_intent',
      },
    });
    expect(metrics).toContainEqual({
      metric: 'autopay_failure_total',
      labels: {
        source: 'reconciliation',
        action: 'failed_retry_cap_reached',
        reason_code: 'retry_exhausted',
        prior_reason_code: 'missing_payment_intent',
      },
    });
  });
});
