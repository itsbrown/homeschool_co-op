/**
 * Regression: a single PaymentIntent for a balance payment that spans two
 * partially-paid enrollments must split the charge across both rows when
 * the webhook fires.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  setupMultiEnrollmentScenario,
  TEST_BASE_URL,
} from './helpers/autoPayHelpers';
import { getProgramEnrollment } from './helpers/seedCartScenario';
import { getStripeTestClient } from './helpers/stripeTestClient';
import { confirmTestPaymentIntent } from './helpers/confirmPaymentIntent';
import { signWebhook } from './helpers/signWebhook';

interface WebhookResponse {
  received: boolean;
  handled: boolean;
}

describe('Payment Flow: Balance payment splits across two enrollments', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('splits a partial combined PI across two enrollments and leaves a balance on each', async () => {
    const scenario = await setupMultiEnrollmentScenario();
    expect(scenario.enrollments).toHaveLength(2);
    const [eA, eB] = scenario.enrollments;

    // Pay only half of each enrollment in a single combined PI ($50+$50 = $100)
    // so each side ends up partially paid — exercises true split semantics
    // (not full payoff).
    const partialPerEnrollment = 5000;
    const totalAmount = partialPerEnrollment * 2;

    const stripe = await getStripeTestClient();
    const pi = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        paymentType: 'balance_payment',
        parentEmail: scenario.parent.email,
        enrollmentIds: JSON.stringify([eA.id, eB.id]),
        userId: String(scenario.parent.id),
        paymentPlan: 'full',
      },
    });

    const confirmed = await confirmTestPaymentIntent({ paymentIntentId: pi.id });
    expect(confirmed.status).toBe('succeeded');

    const event = {
      id: `evt_test_bal_${confirmed.id}`,
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

    await new Promise((r) => setTimeout(r, 400));

    const afterA = await getProgramEnrollment(eA.id);
    const afterB = await getProgramEnrollment(eB.id);
    expect(afterA).not.toBeNull();
    expect(afterB).not.toBeNull();

    // Both enrollments must receive a non-zero allocation, and the combined
    // totalPaid must equal the PI amount. Allocation strategy may be even
    // or proportional, so we don't assert an exact per-enrollment amount.
    expect(afterA!.totalPaid).toBeGreaterThan(0);
    expect(afterB!.totalPaid).toBeGreaterThan(0);
    expect(afterA!.totalPaid + afterB!.totalPaid).toBe(totalAmount);

    // Each enrollment retains a balance because we only paid half of each.
    expect(afterA!.remainingBalance).toBe(afterA!.totalCost - afterA!.totalPaid);
    expect(afterB!.remainingBalance).toBe(afterB!.totalCost - afterB!.totalPaid);
    expect(afterA!.remainingBalance).toBeGreaterThan(0);
    expect(afterB!.remainingBalance).toBeGreaterThan(0);
  });
});
