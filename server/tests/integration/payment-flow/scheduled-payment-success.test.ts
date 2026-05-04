/**
 * Regression: a scheduled-payment PaymentIntent that succeeds via webhook
 * marks the scheduled_payment row 'completed' and applies its full amount
 * against the linked enrollment balance.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  setupAutoPayScenario,
  getScheduledPayment,
  TEST_BASE_URL,
} from './helpers/autoPayHelpers';
import { getProgramEnrollment } from './helpers/seedCartScenario';
import { getStripeTestClient } from './helpers/stripeTestClient';
import { confirmTestPaymentIntent } from './helpers/confirmPaymentIntent';
import { signWebhook } from './helpers/signWebhook';

interface WebhookResponse {
  received: boolean;
  handled: boolean;
  event_type: string;
}

describe('Payment Flow: Scheduled payment succeeds via webhook', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('marks the scheduled payment completed and credits the enrollment', async () => {
    // staleness-cutoff scenario: pending status, placeholder customer/PM,
    // amount=5000¢. The PI is synthesized directly with scheduled-payment
    // metadata so the webhook routes through the scheduled_payment branch.
    const scenario = await setupAutoPayScenario('staleness-cutoff');
    const before = await getScheduledPayment(scenario.scheduledPaymentId);
    expect(before.status).toBe('pending');
    expect(before.amount).toBe(5000);

    const enrollmentBefore = await getProgramEnrollment(scenario.enrollmentId);
    expect(enrollmentBefore).not.toBeNull();
    const startingPaid = enrollmentBefore!.totalPaid;

    const stripe = await getStripeTestClient();
    const pi = await stripe.paymentIntents.create({
      amount: before.amount,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        paymentType: 'scheduled_payment',
        scheduledPaymentId: String(scenario.scheduledPaymentId),
        enrollmentId: String(scenario.enrollmentId),
        parentEmail: scenario.parentEmail,
        installmentNumber: String(before.installmentNumber ?? 2),
        totalInstallments: String(before.totalInstallments ?? 2),
        autoPayInitiated: 'true',
        creditsAppliedCents: '0',
        originalAmountCents: String(before.amount),
        userId: String(scenario.parentId),
      },
    });

    const confirmed = await confirmTestPaymentIntent({ paymentIntentId: pi.id });
    expect(confirmed.status).toBe('succeeded');

    const event = {
      id: `evt_test_sp_${confirmed.id}`,
      object: 'event' as const,
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      type: 'payment_intent.succeeded' as const,
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      data: { object: confirmed },
    };
    const { headers, body } = signWebhook(event);

    const webhookRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers,
      body,
    });
    expect(webhookRes.status).toBe(200);
    const json = (await webhookRes.json()) as WebhookResponse;
    expect(json.received).toBe(true);
    expect(json.handled).toBe(true);
    expect(json.event_type).toBe('payment_intent.succeeded');

    await new Promise((r) => setTimeout(r, 300));

    const after = await getScheduledPayment(scenario.scheduledPaymentId);
    expect(after.status).toBe('completed');

    const enrollmentAfter = await getProgramEnrollment(scenario.enrollmentId);
    expect(enrollmentAfter).not.toBeNull();
    expect(enrollmentAfter!.totalPaid).toBe(startingPaid + before.amount);
    expect(['completed', 'partial_payment', 'stripe_managed']).toContain(enrollmentAfter!.paymentStatus);
  });
});
