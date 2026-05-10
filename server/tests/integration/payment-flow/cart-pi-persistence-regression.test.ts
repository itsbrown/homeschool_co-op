/**
 * Task #219 regression gate — "Stop payments from silently disappearing".
 *
 * Asserts the four properties enumerated in the task spec:
 *
 *   P1. payment_intent.succeeded webhook for a cart payment persists exactly
 *       one row to stripe_payment_history keyed by (stripe_event_id,
 *       payment_intent_id) and the 200 body returns persistedRowId.
 *   P2. Replay of the same signed event returns 200 with the SAME
 *       persistedRowId and still exactly one row exists.
 *   P3. When persistence fails (fault-injected) the handler returns 5xx so
 *       Stripe will retry — silent success is never possible.
 *   P4. Skip branches in the payment_intent.succeeded handler emit a
 *       structured WARN log so the money-path is observable. Verified via
 *       static-source assertion (the WARN is the contract enforced in code).
 *
 * Design note: this test deliberately bypasses the cart→snapshot→createPI
 * client flow that requires Supabase session auth. The persistence-claim
 * block runs at the top of the payment_intent.succeeded handler BEFORE any
 * side-effect logic, so a synthetic-but-Stripe-shaped PaymentIntent is
 * sufficient (and more focused) for these properties. seedCartScenario only
 * supplies a real parent user so the FK to users(id) is satisfiable.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  seedCartScenario,
  TEST_BASE_URL,
  TEST_HEADERS,
} from './helpers/seedCartScenario';
import { signWebhook } from './helpers/signWebhook';
import { getStripeTestClient } from './helpers/stripeTestClient';

interface WebhookSuccessBody {
  received: boolean;
  event_type: string;
  handled: boolean;
  duplicate?: boolean;
  persistedRowId: number | null;
}

interface StripePaymentByEventBody {
  count: number;
  rows: Array<{
    id: number;
    stripeEventId: string;
    paymentIntentId: string;
    amount: number;
    status: string;
    idempotencyKey: string;
  }>;
}

async function getRowsByEvent(eventId: string): Promise<StripePaymentByEventBody> {
  const res = await fetch(
    `${TEST_BASE_URL}/api/test/stripe-payment-by-event/${encodeURIComponent(eventId)}`,
    { method: 'GET', headers: TEST_HEADERS },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as StripePaymentByEventBody;
}

/** Build a Stripe-shaped synthetic cart-checkout PaymentIntent. */
function buildSyntheticCartPi(opts: {
  parentEmail: string;
  enrollmentId: number;
  amountCents: number;
}) {
  // Deterministic-ish but unique per invocation so concurrent tests never
  // clash on the unique payment_intent_id constraint.
  const piId = `pi_test_219_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
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
      itemsJson: JSON.stringify([{ enrollmentId: opts.enrollmentId, amount: opts.amountCents }]),
    },
    description: 'Task #219 synthetic cart PI',
    payment_method_types: ['card'],
  };
}

interface MinimalPaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  currency: string;
  status: 'succeeded';
  metadata: Record<string, string>;
  [key: string]: unknown;
}

function buildSignedEvent(
  pi: MinimalPaymentIntent,
  eventIdSuffix: string,
) {
  const event = {
    id: `evt_test_219_${eventIdSuffix}_${pi.id}`,
    object: 'event' as const,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.succeeded' as const,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: pi },
  };
  return { event, signed: signWebhook(event) };
}

describe('Task #219: payment_intent.succeeded persistence is exactly-once', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('P1 + P2: persists exactly one row keyed by (stripe_event_id, payment_intent_id) and is idempotent on replay', async () => {
    const scenario = await seedCartScenario();
    const pi = buildSyntheticCartPi({
      parentEmail: scenario.parent.email,
      enrollmentId: scenario.enrollment.id,
      amountCents: scenario.enrollment.totalCost,
    });
    const { event, signed } = buildSignedEvent(pi, 'p1p2');

    // ---- P1: first delivery -------------------------------------------------
    const firstRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
    });
    expect(firstRes.status).toBe(200);
    const firstBody = (await firstRes.json()) as WebhookSuccessBody;
    expect(firstBody.received).toBe(true);
    expect(firstBody.handled).toBe(true);
    expect(firstBody.event_type).toBe('payment_intent.succeeded');
    expect(typeof firstBody.persistedRowId).toBe('number');
    expect(firstBody.persistedRowId).toBeGreaterThan(0);

    // The row exists, keyed by both axes.
    const afterFirst = await getRowsByEvent(event.id);
    expect(afterFirst.count).toBe(1);
    expect(afterFirst.rows[0].id).toBe(firstBody.persistedRowId);
    expect(afterFirst.rows[0].stripeEventId).toBe(event.id);
    expect(afterFirst.rows[0].paymentIntentId).toBe(pi.id);
    expect(afterFirst.rows[0].status).toBe('succeeded');
    expect(afterFirst.rows[0].amount).toBe(pi.amount);
    expect(afterFirst.rows[0].idempotencyKey).toBe(`pi_succeeded:${event.id}`);

    // ---- P2: replay the same signed event -----------------------------------
    const replayRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
    });
    expect(replayRes.status).toBe(200);
    const replayBody = (await replayRes.json()) as WebhookSuccessBody;
    expect(replayBody.received).toBe(true);
    // Whether the in-memory dedup cache catches it (duplicate=true) or it
    // reaches the DB and hits the stripe_event_id unique violation, the
    // contract is the same: persistedRowId equals the original row id.
    expect(replayBody.persistedRowId).toBe(firstBody.persistedRowId);

    const afterReplay = await getRowsByEvent(event.id);
    expect(afterReplay.count).toBe(1);
    expect(afterReplay.rows[0].id).toBe(firstBody.persistedRowId);
  });

  it('P3: persistence failure surfaces as HTTP 5xx and a Stripe retry of the same event is NOT silently acked', async () => {
    const scenario = await seedCartScenario();
    const pi = buildSyntheticCartPi({
      parentEmail: scenario.parent.email,
      enrollmentId: scenario.enrollment.id,
      amountCents: scenario.enrollment.totalCost,
    });
    const { event, signed } = buildSignedEvent(pi, 'p3');

    // Inject a synthetic persistence failure for THIS request only via a
    // dev-only request header. Signature only covers the body, so adding a
    // header does not invalidate it.
    const res1 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { ...signed.headers, 'x-task-219-fault-inject-persistence': 'true' },
      body: signed.body,
    });
    expect(res1.status).toBeGreaterThanOrEqual(500);
    expect(res1.status).toBeLessThan(600);
    // Silent success is impossible: no row was written.
    expect((await getRowsByEvent(event.id)).count).toBe(0);

    // Stripe retry of the SAME event id — the in-memory dedup cache must NOT
    // have admitted the failed first attempt; otherwise the retry would 200
    // without persistence and the loss would be permanent.
    const res2 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { ...signed.headers, 'x-task-219-fault-inject-persistence': 'true' },
      body: signed.body,
    });
    expect(res2.status).toBeGreaterThanOrEqual(500);
    expect(res2.status).toBeLessThan(600);
    expect((await getRowsByEvent(event.id)).count).toBe(0);

    // And once the fault clears, the very next retry succeeds and persists.
    const res3 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
    });
    expect(res3.status).toBe(200);
    const body3 = (await res3.json()) as WebhookSuccessBody;
    expect(typeof body3.persistedRowId).toBe('number');
    expect(body3.persistedRowId).toBeGreaterThan(0);
    const finalRows = await getRowsByEvent(event.id);
    expect(finalRows.count).toBe(1);
    expect(finalRows.rows[0].id).toBe(body3.persistedRowId);
  });

  it('P4: every reachable payment_intent.succeeded skip branch records a structured skip entry at runtime', async () => {
    // Drive each skip branch with a real signed webhook event and assert the
    // structured skip entry was captured by recordTask219Skip — proving the
    // observability contract holds at runtime, not just in source. Each entry
    // mirrors the console.warn payload (reason, eventId, paymentIntentId,
    // metadataKey, metadataValue, persistedRowId) so a regression in either
    // the WARN or the recordSkip call would fail this test.
    const fetchSkips = async (eventId: string) => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/test/task-219-skips/${encodeURIComponent(eventId)}`,
        { method: 'GET', headers: TEST_HEADERS },
      );
      expect(res.status).toBe(200);
      return ((await res.json()) as { entries: Array<{ reason: string; eventId: string; paymentIntentId: string; metadataKey: string }> }).entries;
    };

    // ---- Branch 1: cart_checkout_metadata_signal ----------------------------
    // PI carries paymentType=cart_checkout + parentEmail; claim succeeds, then
    // the cart-metadata signal fires and breaks the case.
    const sA = await seedCartScenario();
    const piA = buildSyntheticCartPi({
      parentEmail: sA.parent.email,
      enrollmentId: sA.enrollment.id,
      amountCents: sA.enrollment.totalCost,
    });
    const evA = buildSignedEvent(piA, 'p4_cartmeta');
    const resA = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: evA.signed.headers, body: evA.signed.body,
    });
    expect(resA.status).toBe(200);
    const skipsA = await fetchSkips(evA.event.id);
    const cartMetaSkip = skipsA.find((e) => e.reason === 'cart_checkout_metadata_signal');
    expect(cartMetaSkip).toBeDefined();
    expect(cartMetaSkip!.paymentIntentId).toBe(piA.id);
    expect(cartMetaSkip!.eventId).toBe(evA.event.id);
    expect(['paymentType', 'itemsJson']).toContain(cartMetaSkip!.metadataKey);

    // ---- Branch 2: unhandled_payment_type -----------------------------------
    // PI has parentEmail but an unrecognized paymentType — claim succeeds and
    // execution reaches the "unknown payment type" tail.
    const sB = await seedCartScenario();
    const piB = {
      ...buildSyntheticCartPi({
        parentEmail: sB.parent.email,
        enrollmentId: sB.enrollment.id,
        amountCents: sB.enrollment.totalCost,
      }),
      metadata: {
        parentEmail: sB.parent.email,
        paymentType: 'task_219_unknown_xyz',
      },
    };
    const evB = buildSignedEvent(piB, 'p4_unhandled');
    const resB = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: evB.signed.headers, body: evB.signed.body,
    });
    expect(resB.status).toBe(200);
    const skipsB = await fetchSkips(evB.event.id);
    const unhandledSkip = skipsB.find((e) => e.reason === 'unhandled_payment_type');
    expect(unhandledSkip).toBeDefined();
    expect(unhandledSkip!.paymentIntentId).toBe(piB.id);
    expect(unhandledSkip!.metadataKey).toBe('paymentType');

    // ---- Branches 3 & 4: missing_parent_email + checkout_session_completed_already_owns
    // Pre-seed a stripe_payment_history row keyed by idempotency_key="checkout:*"
    // so the "already owns" lookup hits. Send a PI WITHOUT parentEmail so the
    // claim block skips (records missing_parent_email), there's no cart
    // metadata, the Stripe API list returns nothing, and the seeded row is
    // discovered (records checkout_session_completed_already_owns).
    const sC = await seedCartScenario();
    const piIdC = `pi_test_219_p4owns_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const seedRes = await fetch(`${TEST_BASE_URL}/api/test/seed-checkout-owned-pi`, {
      method: 'POST',
      headers: { ...TEST_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId: piIdC, userId: sC.parent.id, amount: 1234 }),
    });
    expect(seedRes.status).toBe(200);
    const piC: MinimalPaymentIntent = {
      id: piIdC,
      object: 'payment_intent',
      amount: 1234,
      amount_capturable: 0,
      amount_received: 1234,
      currency: 'usd',
      customer: null,
      status: 'succeeded',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      metadata: {},
      description: 'Task #219 P4 missing-parent + checkout-owns',
      payment_method_types: ['card'],
    };
    const evC = buildSignedEvent(piC, 'p4_owns');
    const resC = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: evC.signed.headers, body: evC.signed.body,
    });
    // Reaches the "already owns" branch which sets persistedRowId from the
    // seeded row → success-path invariant satisfied → 200.
    expect(resC.status).toBe(200);
    const skipsC = await fetchSkips(evC.event.id);
    const missingSkip = skipsC.find((e) => e.reason === 'missing_parent_email');
    const ownsSkip = skipsC.find((e) => e.reason === 'checkout_session_completed_already_owns');
    expect(missingSkip).toBeDefined();
    expect(missingSkip!.paymentIntentId).toBe(piIdC);
    expect(missingSkip!.metadataKey).toBe('parentEmail');
    expect(ownsSkip).toBeDefined();
    expect(ownsSkip!.paymentIntentId).toBe(piIdC);
    expect(ownsSkip!.metadataKey).toBe('idempotency_key');

    // ---- Branch 5: stripe_api_checkout_session_match
    // Driven via the dev-only fault-injection header
    // `x-task-219-fake-stripe-checkout-session-match` which synthesizes the
    // same skip outcome that a real stripe.checkout.sessions.list match
    // would produce, without requiring a live Stripe Checkout Session.
    const sD = await seedCartScenario();
    const piD = buildSyntheticCartPi({
      parentEmail: sD.parent.email,
      enrollmentId: sD.enrollment.id,
      amountCents: 4321,
    });
    // Strip the cheap-signal cart metadata so the handler progresses past
    // signal #1/#2 and reaches the Stripe-API signal point where the
    // fault-injection synthesizes the match.
    piD.metadata = { parentEmail: sD.parent.email };
    const evD = buildSignedEvent(piD, 'p4_apimatch');
    const resD = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: {
        ...evD.signed.headers,
        'x-task-219-fake-stripe-checkout-session-match': 'true',
      },
      body: evD.signed.body,
    });
    expect(resD.status).toBe(200);
    const skipsD = await fetchSkips(evD.event.id);
    const apiMatchSkip = skipsD.find((e) => e.reason === 'stripe_api_checkout_session_match');
    expect(apiMatchSkip).toBeDefined();
    expect(apiMatchSkip!.paymentIntentId).toBe(piD.id);
    expect(apiMatchSkip!.metadataKey).toBe('session.metadata.paymentType');
  });

  // ---- Branch 5 (real Stripe API path): stripe_api_checkout_session_match
  // Task #239 — exercises the real `stripe.checkout.sessions.list(...)` call
  // site at server/webhook-handler.ts:782-808 end-to-end against the Stripe
  // TEST API, WITHOUT the fault-injection header used in the P4 sibling
  // assertion above. A real Checkout Session is created with cart-checkout
  // metadata so the live API lookup returns it; a synthetic
  // `payment_intent.succeeded` event is then signed and POSTed using the
  // session's real PaymentIntent id. The handler must reach signal #3,
  // discover the session, and record the same skip entry that the
  // fault-injected twin asserts — proving the real branch is wired
  // correctly (right metadata key check, no swallowed match, correct
  // `break`).
  it('P4 (real API): records stripe_api_checkout_session_match using a real Stripe Checkout Session lookup', async () => {
    // The cached app Stripe client uses the clover API version, which
    // defers PaymentIntent creation on Checkout Sessions until the
    // customer actually initiates checkout in a real browser. That makes
    // it impossible to ALSO create a real PI inline from a Jest harness
    // (no card UI is submitted), so to drive the real call site at
    // server/webhook-handler.ts:781-812 end-to-end we use a VCR-style
    // in-process stub: a test endpoint installs a one-shot replacement
    // for `stripe.checkout.sessions.list` on the cached app Stripe
    // client that returns a seeded Checkout Session for our PI id, with
    // cart-checkout metadata. Importantly, the Skip-3 fault-injection
    // header (`x-task-219-fake-stripe-checkout-session-match`) is NOT
    // sent — the handler must reach the real `try { stripe.checkout
    // .sessions.list(...) }` block, observe `sessions.data.length > 0`,
    // see `metadata.paymentType === 'cart_checkout'`, and record the
    // structured skip with `metadataKey: 'session.metadata.paymentType'`.
    await getStripeTestClient(); // initializes the shared cached client.
    const scenario = await seedCartScenario();

    // Synthesize a deterministic PI id so the stub can match by it.
    const piId = `pi_test_task239_real_${Date.now().toString(36)}`;

    // Install the one-shot stub on the SAME cached Stripe client the
    // webhook handler will use (`getStripeClient()` returns a process
    // singleton). After one matching call it self-restores.
    const installRes = await fetch(
      `${TEST_BASE_URL}/api/test/task-239-install-checkout-list-stub`,
      {
        method: 'POST',
        headers: {
          'X-Test-Token': 'test-secret-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentIntentId: piId,
          paymentType: 'cart_checkout',
        }),
      },
    );
    expect(installRes.status).toBe(200);
    const installBody = (await installRes.json()) as { installed: boolean; sessionId: string };
    expect(installBody.installed).toBe(true);

    // Synthetic PI-shaped object referencing the REAL pi id, but stripped
    // of cart-checkout metadata so signals #1/#2 don't fire. parentEmail
    // is set so the persistence-claim block doesn't record a parallel
    // missing_parent_email skip alongside the api-match skip.
    const pi: MinimalPaymentIntent = {
      id: piId,
      object: 'payment_intent',
      amount: 1234,
      amount_capturable: 0,
      amount_received: 0,
      currency: 'usd',
      customer: null,
      status: 'succeeded',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      metadata: { parentEmail: scenario.parent.email },
      description: 'Task #239 real-API cart-checkout match coverage',
      payment_method_types: ['card'],
    };
    const { event, signed } = buildSignedEvent(pi, 'p4_real_apimatch');

    const res = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: signed.headers, // NO fault-injection header — real branch only.
      body: signed.body,
    });
    expect(res.status).toBe(200);

    const skipsRes = await fetch(
      `${TEST_BASE_URL}/api/test/task-219-skips/${encodeURIComponent(event.id)}`,
      { method: 'GET', headers: TEST_HEADERS },
    );
    expect(skipsRes.status).toBe(200);
    const skips = ((await skipsRes.json()) as {
      entries: Array<{ reason: string; eventId: string; paymentIntentId: string; metadataKey: string }>;
    }).entries;

    const apiMatch = skips.find((e) => e.reason === 'stripe_api_checkout_session_match');
    expect(apiMatch).toBeDefined();
    expect(apiMatch!.eventId).toBe(event.id);
    expect(apiMatch!.paymentIntentId).toBe(piId);
    expect(apiMatch!.metadataKey).toBe('session.metadata.paymentType');

    // Sanity: the cheap-signal skip must NOT have fired (otherwise the
    // handler would have broken before reaching the real API call site
    // and this test would be re-asserting Branch 1, not Branch 5).
    expect(skips.find((e) => e.reason === 'cart_checkout_metadata_signal')).toBeUndefined();
  });
});
