/**
 * Task #224: end-to-end balance-sync regression.
 *
 * `ARCHITECTURAL_PATTERNS.md` §17 declares the canonical formula for
 * `program_enrollments.effective_balance`:
 *
 *   GREATEST(0, total_cost - total_paid - COALESCE(comp_amount_cents, 0))
 *
 * Task #220 backfilled the column and added a CI script
 * (`scripts/check-effective-balance-drift.ts`) that asserts drift = 0 in
 * the running database. What was missing — and what this test adds — is a
 * Jest-level regression that exercises the real payment-flow webhooks
 * (cart payment_intent.succeeded → scheduled-payment payment_intent.succeeded
 * → charge.refunded) and asserts the canonical drift query stays at 0
 * after each step. If a future code path writes to `total_paid` /
 * `total_cost` / `comp_amount_cents` incorrectly — or someone replaces
 * the generated column with a stored value that goes stale — this test
 * fails immediately under `npm run test:server`.
 *
 * Auth approach: this test deliberately skips the cart→snapshot→createPI
 * client flow that requires a Supabase session cookie. It instead emits
 * Stripe-shaped synthetic events straight at /api/stripe/webhook — the
 * same shortcut already used by Task #219's
 * cart-pi-persistence-regression test. The drift assertion is what
 * matters: the canonical query must stay at 0 after each webhook lands.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  seedCartScenario,
  getProgramEnrollment,
  getEffectiveBalanceDrift,
  TEST_BASE_URL,
} from './helpers/seedCartScenario';
import {
  setupAutoPayScenario,
  getScheduledPayment,
  seedPaidEnrollmentWithPayment,
} from './helpers/autoPayHelpers';
import { signWebhook } from './helpers/signWebhook';

interface WebhookResponse {
  received: boolean;
  handled: boolean;
  event_type: string;
  duplicate?: boolean;
  persistedRowId?: number | null;
}

async function expectNoDrift(ids: number[], step: string): Promise<void> {
  const result = await getEffectiveBalanceDrift(ids);
  if (result.drift !== 0) {
    throw new Error(
      `Task #224 effective_balance drift after ${step}: ` +
        `${result.drift}/${result.total} program_enrollments rows do not match the canonical formula ` +
        `(GREATEST(0, total_cost - total_paid - COALESCE(comp_amount_cents, 0))). ` +
        `Investigated ids=${ids.join(',')}.`,
    );
  }
  expect(result.total).toBe(ids.length);
  expect(result.drift).toBe(0);
}

function buildSyntheticCartPi(opts: {
  parentEmail: string;
  enrollmentId: number;
  amountCents: number;
}) {
  const piId = `pi_t224_cart_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return {
    id: piId,
    object: 'payment_intent' as const,
    amount: opts.amountCents,
    amount_capturable: 0,
    amount_received: opts.amountCents,
    currency: 'usd',
    customer: null,
    status: 'succeeded' as const,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    metadata: {
      paymentType: 'cart_checkout',
      parentEmail: opts.parentEmail,
      enrollmentIds: JSON.stringify([opts.enrollmentId]),
      itemsJson: JSON.stringify([
        { enrollmentId: opts.enrollmentId, amount: opts.amountCents },
      ]),
    },
    description: 'Task #224 synthetic cart PI',
    payment_method_types: ['card'],
  };
}

function buildSyntheticScheduledPi(opts: {
  parentEmail: string;
  parentId: number;
  scheduledPaymentId: number;
  enrollmentId: number;
  amountCents: number;
  installmentNumber: number;
  totalInstallments: number;
}) {
  const piId = `pi_t224_sp_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return {
    id: piId,
    object: 'payment_intent' as const,
    amount: opts.amountCents,
    amount_capturable: 0,
    amount_received: opts.amountCents,
    currency: 'usd',
    customer: null,
    status: 'succeeded' as const,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    metadata: {
      paymentType: 'scheduled_payment',
      scheduledPaymentId: String(opts.scheduledPaymentId),
      enrollmentId: String(opts.enrollmentId),
      parentEmail: opts.parentEmail,
      installmentNumber: String(opts.installmentNumber),
      totalInstallments: String(opts.totalInstallments),
      autoPayInitiated: 'true',
      creditsAppliedCents: '0',
      originalAmountCents: String(opts.amountCents),
      userId: String(opts.parentId),
    },
    description: 'Task #224 synthetic scheduled-payment PI',
    payment_method_types: ['card'],
  };
}

function signedEvent<T extends { id: string }>(type: string, suffix: string, obj: T) {
  const event = {
    id: `evt_t224_${suffix}_${obj.id}`,
    object: 'event' as const,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: obj },
  };
  return { event, ...signWebhook(event) };
}

async function postWebhook(headers: Record<string, string>, body: Buffer | string) {
  return fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
    method: 'POST',
    headers,
    body,
  });
}

describe('Payment Flow: effective_balance stays in sync after each step (Task #224)', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('drift = 0 after seed, cart-PI success, scheduled-payment success, and refund', async () => {
    // ---------------------------------------------------------------
    // Step 1: seed a cart enrollment and emit cart payment_intent.succeeded
    // ---------------------------------------------------------------
    const cart = await seedCartScenario();
    expect(cart.enrollment.status).toBe('pending_payment');
    expect(cart.enrollment.totalCost).toBe(10000);
    await expectNoDrift([cart.enrollment.id], 'cart seed');

    const cartPi = buildSyntheticCartPi({
      parentEmail: cart.parent.email,
      enrollmentId: cart.enrollment.id,
      amountCents: cart.enrollment.totalCost,
    });
    const cartSig = signedEvent('payment_intent.succeeded', 'cart', cartPi);
    const cartRes = await postWebhook(cartSig.headers, cartSig.body);
    expect(cartRes.status).toBe(200);
    const cartJson = (await cartRes.json()) as WebhookResponse;
    expect(cartJson.received).toBe(true);
    expect(cartJson.handled).toBe(true);

    // Give the async side-effect chain (enrollment update + history insert)
    // time to settle before reading back the enrollment + drift query.
    await new Promise((r) => setTimeout(r, 350));

    const cartAfter = await getProgramEnrollment(cart.enrollment.id);
    expect(cartAfter).not.toBeNull();
    // Drift is the property under test: regardless of which side-effects
    // the synthetic webhook triggers (the canonical cart flow normally
    // routes through PaymentProcessorService with full snapshot context),
    // the generated column must continue to match the canonical formula.
    await expectNoDrift([cart.enrollment.id], 'cart payment_intent.succeeded');

    // ---------------------------------------------------------------
    // Step 2: scheduled-payment payment_intent.succeeded webhook
    // ---------------------------------------------------------------
    const sched = await setupAutoPayScenario('staleness-cutoff');
    const beforeSched = await getScheduledPayment(sched.scheduledPaymentId);
    const enrollmentBeforeSched = await getProgramEnrollment(sched.enrollmentId);
    expect(enrollmentBeforeSched).not.toBeNull();
    const startingPaid = enrollmentBeforeSched!.totalPaid;
    await expectNoDrift([sched.enrollmentId], 'scheduled-payment seed');

    const schedPi = buildSyntheticScheduledPi({
      parentEmail: sched.parentEmail,
      parentId: sched.parentId,
      scheduledPaymentId: sched.scheduledPaymentId,
      enrollmentId: sched.enrollmentId,
      amountCents: beforeSched.amount,
      installmentNumber: beforeSched.installmentNumber ?? 2,
      totalInstallments: beforeSched.totalInstallments ?? 2,
    });
    const schedSig = signedEvent('payment_intent.succeeded', 'sp', schedPi);
    const schedRes = await postWebhook(schedSig.headers, schedSig.body);
    expect(schedRes.status).toBe(200);
    const schedJson = (await schedRes.json()) as WebhookResponse;
    expect(schedJson.received).toBe(true);
    expect(schedJson.handled).toBe(true);

    await new Promise((r) => setTimeout(r, 350));

    const afterSched = await getScheduledPayment(sched.scheduledPaymentId);
    expect(afterSched.status).toBe('completed');
    const enrollmentAfterSched = await getProgramEnrollment(sched.enrollmentId);
    expect(enrollmentAfterSched).not.toBeNull();
    expect(enrollmentAfterSched!.totalPaid).toBe(startingPaid + beforeSched.amount);
    await expectNoDrift([sched.enrollmentId], 'scheduled-payment payment_intent.succeeded');

    // ---------------------------------------------------------------
    // Step 3: charge.refunded webhook against a pre-seeded paid enrollment
    // ---------------------------------------------------------------
    const refundSeed = await seedPaidEnrollmentWithPayment();
    expect(refundSeed.enrollment.totalPaid).toBe(refundSeed.enrollment.totalCost);
    expect(refundSeed.enrollment.remainingBalance).toBe(0);
    await expectNoDrift([refundSeed.enrollment.id], 'refund seed (paid)');

    const piId = refundSeed.payment.stripePaymentIntentId;
    const refundAmount = refundSeed.payment.amount;
    const chargeId = `ch_t224_seed_${piId}`;
    const refundId = `re_t224_${Date.now()}`;
    interface SyntheticRefund {
      id: string;
      object: 'refund';
      amount: number;
      currency: string;
      payment_intent: string;
      charge: string;
      reason: string;
      status: string;
      created: number;
    }
    interface SyntheticChargeRefunded {
      id: string;
      object: 'charge';
      amount: number;
      amount_refunded: number;
      currency: string;
      payment_intent: string;
      refunded: boolean;
      status: string;
      refunds: {
        object: 'list';
        data: SyntheticRefund[];
        has_more: boolean;
        url: string;
      };
    }
    const charge: SyntheticChargeRefunded = {
      id: chargeId,
      object: 'charge',
      amount: refundAmount,
      amount_refunded: refundAmount,
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
            amount: refundAmount,
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
    const refundSig = signedEvent('charge.refunded', 'ref', charge);
    const refundRes = await postWebhook(refundSig.headers, refundSig.body);
    const refundBody = await refundRes.text();
    if (refundRes.status !== 200) {
      throw new Error(
        `Task #224 charge.refunded webhook returned ${refundRes.status}: ${refundBody.slice(0, 400)}`,
      );
    }
    const refundJson = JSON.parse(refundBody) as WebhookResponse;
    expect(refundJson.received).toBe(true);
    expect(refundJson.handled).toBe(true);
    expect(refundJson.event_type).toBe('charge.refunded');

    await new Promise((r) => setTimeout(r, 400));

    const enrollmentAfterRefund = await getProgramEnrollment(refundSeed.enrollment.id);
    expect(enrollmentAfterRefund).not.toBeNull();
    expect(enrollmentAfterRefund!.paymentStatus).toBe('refunded');
    expect(enrollmentAfterRefund!.totalPaid).toBe(0);
    expect(enrollmentAfterRefund!.remainingBalance).toBe(refundSeed.enrollment.totalCost);
    await expectNoDrift([refundSeed.enrollment.id], 'charge.refunded');

    // ---------------------------------------------------------------
    // Final: combined assertion across all three enrollments touched
    // ---------------------------------------------------------------
    await expectNoDrift(
      [cart.enrollment.id, sched.enrollmentId, refundSeed.enrollment.id],
      'all three flows combined',
    );
  });
});
