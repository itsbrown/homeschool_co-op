/**
 * Regression: payment_intent.payment_failed with metadata
 * paymentType='scheduled_payment' increments retryCount each time and
 * permanently fails the scheduled payment once AUTOPAY_MAX_RETRIES is hit.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  setupAutoPayScenario,
  getScheduledPayment,
  TEST_BASE_URL,
} from './helpers/autoPayHelpers';
import { signWebhook } from './helpers/signWebhook';
import { AUTOPAY_MAX_RETRIES } from '../../../services/auto-pay-scheduler';

interface WebhookResponse {
  received: boolean;
  handled: boolean;
  event_type: string;
}

async function sendFailedWebhook(
  scheduledPaymentId: number,
  parentEmail: string,
  amount: number,
  attempt: number,
): Promise<void> {
  const piId = `pi_test_failed_${scheduledPaymentId}_${attempt}_${Date.now()}`;
  const failedPi = {
    id: piId,
    object: 'payment_intent',
    amount,
    currency: 'usd',
    status: 'requires_payment_method',
    last_payment_error: {
      message: `Synthetic decline #${attempt}`,
      code: 'card_declined',
      type: 'card_error',
    },
    metadata: {
      paymentType: 'scheduled_payment',
      scheduledPaymentId: String(scheduledPaymentId),
      parentEmail,
    },
  };
  const event = {
    id: `evt_test_failed_${piId}`,
    object: 'event' as const,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.payment_failed' as const,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: failedPi },
  };
  const { headers, body } = signWebhook(event);
  const res = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
    method: 'POST',
    headers,
    body,
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as WebhookResponse;
  expect(json.received).toBe(true);
  expect(json.handled).toBe(true);
  expect(json.event_type).toBe('payment_intent.payment_failed');
}

describe('Payment Flow: payment_intent.payment_failed retry cap', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('increments retryCount per failure and permanently fails at the cap', async () => {
    const scenario = await setupAutoPayScenario('staleness-cutoff');
    const before = await getScheduledPayment(scenario.scheduledPaymentId);
    expect(before.status).toBe('pending');
    expect(before.retryCount ?? 0).toBe(0);

    await sendFailedWebhook(scenario.scheduledPaymentId, scenario.parentEmail, before.amount, 1);
    await new Promise((r) => setTimeout(r, 200));
    let row = await getScheduledPayment(scenario.scheduledPaymentId);
    expect(row.retryCount).toBe(1);
    expect(row.status).toBe('pending');

    await sendFailedWebhook(scenario.scheduledPaymentId, scenario.parentEmail, before.amount, 2);
    await new Promise((r) => setTimeout(r, 200));
    row = await getScheduledPayment(scenario.scheduledPaymentId);
    expect(row.retryCount).toBe(2);
    expect(row.status).toBe('pending');

    await sendFailedWebhook(scenario.scheduledPaymentId, scenario.parentEmail, before.amount, 3);
    await new Promise((r) => setTimeout(r, 200));
    row = await getScheduledPayment(scenario.scheduledPaymentId);
    expect(row.retryCount).toBe(AUTOPAY_MAX_RETRIES);
    expect(row.status).toBe('failed');
    expect(row.failureReason).toContain(`Exceeded ${AUTOPAY_MAX_RETRIES}`);
  });
});
