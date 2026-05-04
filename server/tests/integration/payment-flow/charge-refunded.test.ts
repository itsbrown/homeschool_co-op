/**
 * Regression: charge.refunded webhook creates a negative payment row tied
 * to the original payment and flips the enrollment's paymentStatus to
 * 'refunded' (with totalPaid wound back).
 *
 * This test pre-seeds a paid enrollment + matching payments-table row so
 * the refund handler is exercised in isolation, independent of which
 * success-leg branch (legacy webhook vs PaymentProcessorService) wrote
 * the original payment in production.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  seedPaidEnrollmentWithPayment,
  getPaymentByStripeId,
  getRefundPaymentFor,
  TEST_BASE_URL,
} from './helpers/autoPayHelpers';
import { getProgramEnrollment } from './helpers/seedCartScenario';
import { signWebhook } from './helpers/signWebhook';

interface WebhookResponse {
  received: boolean;
  handled: boolean;
  event_type: string;
}

describe('Payment Flow: charge.refunded webhook', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('writes a negative payment row and flips enrollment to refunded', async () => {
    const seed = await seedPaidEnrollmentWithPayment();
    const { enrollment, payment } = seed;
    const piId = payment.stripePaymentIntentId;
    const amount = payment.amount;

    const original = await getPaymentByStripeId(piId);
    expect(original).not.toBeNull();
    expect(original!.id).toBe(payment.id);
    expect(original!.amount).toBe(amount);

    const chargeId = `ch_test_seed_${piId}`;
    const refundId = `re_test_${Date.now()}`;
    const charge = {
      id: chargeId,
      object: 'charge',
      amount,
      amount_refunded: amount,
      currency: 'usd',
      payment_intent: piId,
      refunded: true,
      status: 'succeeded',
      refunds: {
        object: 'list',
        data: [
          {
            id: refundId,
            object: 'refund',
            amount,
            currency: 'usd',
            payment_intent: piId,
            charge: chargeId,
            reason: 'requested_by_customer',
            status: 'succeeded',
            created: Math.floor(Date.now() / 1000),
          },
        ],
        has_more: false,
        url: `/v1/charges/${chargeId}/refunds`,
      },
    };

    const refundEvent = {
      id: `evt_test_ref_${refundId}`,
      object: 'event' as const,
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      type: 'charge.refunded' as const,
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      data: { object: charge },
    };
    const { headers, body } = signWebhook(refundEvent);

    const refundRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers,
      body,
    });
    expect(refundRes.status).toBe(200);
    const refundJson = (await refundRes.json()) as WebhookResponse;
    expect(refundJson.received).toBe(true);
    expect(refundJson.handled).toBe(true);
    expect(refundJson.event_type).toBe('charge.refunded');

    await new Promise((r) => setTimeout(r, 400));

    const refundPayment = await getRefundPaymentFor(payment.id);
    expect(refundPayment).not.toBeNull();
    expect(refundPayment!.amount).toBe(-amount);
    expect(refundPayment!.originalPaymentId).toBe(payment.id);
    expect(refundPayment!.status).toBe('completed');

    const after = await getProgramEnrollment(enrollment.id);
    expect(after).not.toBeNull();
    expect(after!.paymentStatus).toBe('refunded');
    expect(after!.totalPaid).toBe(0);
    expect(after!.remainingBalance).toBe(enrollment.totalCost);
  });
});
