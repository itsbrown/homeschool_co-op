/**
 * Task #222 regression gate — "Fix refunds silently failing AND make refund
 * webhook events durable".
 *
 * Asserts the five properties enumerated in the task spec:
 *
 *   P1. charge.refunded for a UNIFIED-processor payment (stripe_payment_history
 *       only, no legacy `payments` row) resolves the original payment via
 *       stripe_payment_history.id and persists exactly one refund_events row.
 *       This is the Bug-A fix — the legacy handler returned silently because
 *       it only checked the `payments` table.
 *   P2. Replay of the same signed event returns 200 with the SAME persistedRowId
 *       and refund_events still contains exactly one row (DB-level uniqueness
 *       on stripe_event_id, not race-prone app-level checks).
 *   P3. When persistence fails (fault-injected) the handler returns 5xx so
 *       Stripe will retry — silent success is impossible.
 *   P4. refund.updated and refund.failed are persistence-required: each writes
 *       its own row keyed by stripe_event_id, with the correct event_type and
 *       refund_status snapshot.
 *   P5. Every reachable refund-handler skip branch records a STRUCTURED skip
 *       entry at runtime (not just a console.warn) so the money path is
 *       observable. Exercised here: no_refund_data_in_event AND
 *       original_payment_not_found_in_either_table.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  seedCartScenario,
  TEST_BASE_URL,
  TEST_HEADERS,
} from './helpers/seedCartScenario';
import { signWebhook } from './helpers/signWebhook';

interface WebhookSuccessBody {
  received: boolean;
  event_type: string;
  handled: boolean;
  duplicate?: boolean;
  persistedRowId: number | null;
}

interface RefundEventRow {
  id: number;
  stripeEventId: string;
  stripeRefundId: string;
  stripePaymentIntentId: string | null;
  eventType: string;
  amountCents: number;
  refundStatus: string | null;
  processingStatus: string;
  originalPaymentId: number | null;
  originalPaymentHistoryId: number | null;
}
interface RefundEventByEventBody {
  count: number;
  rows: RefundEventRow[];
}
interface SkipEntry {
  reason: string;
  eventId: string;
  eventType: string;
  refundId: string | null;
  paymentIntentId: string | null;
  metadataKey: string;
  metadataValue: string | null;
  persistedRowId: number | null;
}

async function getRefundEventByEvent(eventId: string): Promise<RefundEventByEventBody> {
  const res = await fetch(
    `${TEST_BASE_URL}/api/test/refund-event-by-event/${encodeURIComponent(eventId)}`,
    { method: 'GET', headers: TEST_HEADERS },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as RefundEventByEventBody;
}

async function getRefundEventCountByRefundId(refundId: string): Promise<number> {
  const res = await fetch(
    `${TEST_BASE_URL}/api/test/refund-event-count-by-refund-id/${encodeURIComponent(refundId)}`,
    { method: 'GET', headers: TEST_HEADERS },
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { count: number }).count;
}

async function fetchSkips(eventId: string): Promise<SkipEntry[]> {
  const res = await fetch(
    `${TEST_BASE_URL}/api/test/task-222-skips/${encodeURIComponent(eventId)}`,
    { method: 'GET', headers: TEST_HEADERS },
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: SkipEntry[] }).entries;
}

async function seedUnifiedPayment(opts: {
  paymentIntentId: string;
  userId: number;
  amount: number;
  enrollmentId?: number;
}) {
  const res = await fetch(`${TEST_BASE_URL}/api/test/seed-unified-payment`, {
    method: 'POST',
    headers: { ...TEST_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: number; paymentIntentId: string };
}

async function getProgramEnrollment(id: number) {
  const res = await fetch(
    `${TEST_BASE_URL}/api/test/program-enrollment/${id}`,
    { method: 'GET', headers: TEST_HEADERS },
  );
  expect(res.status).toBe(200);
  const enrollment = (await res.json()) as {
    id: number;
    totalPaid: number;
    remainingBalance: number;
    totalCost: number;
    paymentStatus: string;
  } | null;
  return { enrollment };
}

interface StripeRefundLite {
  id: string;
  object: 'refund';
  amount: number;
  charge: string;
  currency: string;
  payment_intent: string;
  reason: string | null;
  status: string;
  failure_reason?: string | null;
}

function buildChargeRefundedEvent(opts: {
  paymentIntentId: string;
  refundId?: string;
  chargeId?: string;
  amountCents: number;
  eventIdSuffix: string;
}) {
  const refundId = opts.refundId ?? `re_test_222_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  const chargeId = opts.chargeId ?? `ch_test_222_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  const refund: StripeRefundLite = {
    id: refundId,
    object: 'refund',
    amount: opts.amountCents,
    charge: chargeId,
    currency: 'usd',
    payment_intent: opts.paymentIntentId,
    reason: 'requested_by_customer',
    status: 'succeeded',
  };
  const charge = {
    id: chargeId,
    object: 'charge' as const,
    amount: opts.amountCents,
    amount_refunded: opts.amountCents,
    currency: 'usd',
    payment_intent: opts.paymentIntentId,
    refunded: true,
    refunds: { object: 'list', data: [refund] },
  };
  const event = {
    id: `evt_test_222_${opts.eventIdSuffix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
    object: 'event' as const,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type: 'charge.refunded' as const,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: charge },
  };
  return { event, refund, charge, signed: signWebhook(event) };
}

function buildRefundLifecycleEvent(opts: {
  type: 'refund.updated' | 'refund.failed';
  paymentIntentId: string;
  refundId: string;
  chargeId: string;
  amountCents: number;
  status: string;
  failureReason?: string;
  eventIdSuffix: string;
}) {
  const refund: StripeRefundLite = {
    id: opts.refundId,
    object: 'refund',
    amount: opts.amountCents,
    charge: opts.chargeId,
    currency: 'usd',
    payment_intent: opts.paymentIntentId,
    reason: 'requested_by_customer',
    status: opts.status,
    failure_reason: opts.failureReason ?? null,
  };
  const event = {
    id: `evt_test_222_${opts.eventIdSuffix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
    object: 'event' as const,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type: opts.type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: refund },
  };
  return { event, signed: signWebhook(event) };
}

describe('Task #222: refund webhook persistence is exactly-once and durable', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('P1 + P2 (Bug A fix): charge.refunded for a UNIFIED-only payment persists exactly one row and is idempotent on replay', async () => {
    const scenario = await seedCartScenario();
    const piId = `pi_test_222_unified_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    await seedUnifiedPayment({
      paymentIntentId: piId,
      userId: scenario.parent.id,
      amount: 5000,
      enrollmentId: scenario.enrollment.id,
    });

    // Snapshot enrollment state BEFORE refund: seeded a $50 payment against
    // the $100 enrollment, so totalPaid=$50, remainingBalance=$50.
    const before = await getProgramEnrollment(scenario.enrollment.id);
    expect(before.enrollment).not.toBeNull();
    expect(before.enrollment!.totalPaid).toBe(5000);
    expect(before.enrollment!.remainingBalance).toBe(5000);
    expect(before.enrollment!.paymentStatus).toBe('partial_payment');

    const { event, refund, signed } = buildChargeRefundedEvent({
      paymentIntentId: piId,
      amountCents: 5000,
      eventIdSuffix: 'p1p2',
    });

    // ---- P1 first delivery -----------------------------------------
    const r1 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: signed.headers, body: signed.body,
    });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as WebhookSuccessBody;
    expect(b1.handled).toBe(true);
    expect(typeof b1.persistedRowId).toBe('number');
    expect(b1.persistedRowId).toBeGreaterThan(0);

    const after1 = await getRefundEventByEvent(event.id);
    expect(after1.count).toBe(1);
    const row = after1.rows[0];
    expect(row.id).toBe(b1.persistedRowId);
    expect(row.stripeRefundId).toBe(refund.id);
    expect(row.stripePaymentIntentId).toBe(piId);
    expect(row.eventType).toBe('charge.refunded');
    expect(row.amountCents).toBe(5000);
    // Bug A proof: lookup hit stripe_payment_history (NOT payments).
    expect(row.originalPaymentHistoryId).not.toBeNull();
    expect(row.originalPaymentHistoryId!).toBeGreaterThan(0);
    expect(row.originalPaymentId).toBeNull();
    // Side effects ran (unified allocation path).
    expect(row.processingStatus).toBe('processed');

    // The lookup-skip branch fired because the legacy `payments` row is
    // absent — proves the dual-lookup path is taken AND structured-logged.
    const skipsP1 = await fetchSkips(event.id);
    const unifiedSkip = skipsP1.find((e) => e.reason === 'unified_processor_payment_no_legacy_row');
    expect(unifiedSkip).toBeDefined();
    expect(unifiedSkip!.refundId).toBe(refund.id);
    expect(unifiedSkip!.paymentIntentId).toBe(piId);

    // ---- P2 replay --------------------------------------------------
    const r2 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: signed.headers, body: signed.body,
    });
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as WebhookSuccessBody;
    expect(b2.persistedRowId).toBe(b1.persistedRowId);

    const after2 = await getRefundEventByEvent(event.id);
    expect(after2.count).toBe(1);
    expect(after2.rows[0].id).toBe(b1.persistedRowId);

    // And uniqueness on stripe_refund_id holds across event-id space too:
    // re-issuing the SAME refund under a fresh stripe_event_id WOULD insert
    // a second row (different event), so we use the same event id here.
    expect(await getRefundEventCountByRefundId(refund.id)).toBe(1);

    // ---- Reviewer requirement: assert REAL enrollment rollback ------
    // After a $50 refund against the $50 paid enrollment, totalPaid should
    // drop to 0, remainingBalance return to $100, and status become 'refunded'.
    const after = await getProgramEnrollment(scenario.enrollment.id);
    expect(after.enrollment).not.toBeNull();
    expect(after.enrollment!.totalPaid).toBe(0);
    expect(after.enrollment!.remainingBalance).toBe(after.enrollment!.totalCost);
    expect(after.enrollment!.paymentStatus).toBe('refunded');
  });

  it('P3: persistence failure surfaces as HTTP 5xx and a Stripe retry of the same event is NOT silently acked', async () => {
    const scenario = await seedCartScenario();
    const piId = `pi_test_222_p3_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    await seedUnifiedPayment({ paymentIntentId: piId, userId: scenario.parent.id, amount: 1000 });

    const { event, signed } = buildChargeRefundedEvent({
      paymentIntentId: piId,
      amountCents: 1000,
      eventIdSuffix: 'p3',
    });

    const res1 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { ...signed.headers, 'x-task-222-fault-inject-persistence': 'true' },
      body: signed.body,
    });
    expect(res1.status).toBeGreaterThanOrEqual(500);
    expect(res1.status).toBeLessThan(600);
    expect((await getRefundEventByEvent(event.id)).count).toBe(0);

    // Stripe retry of the same event id under fault injection — must still 5xx
    // (the in-memory dedup cache must NOT have admitted the failed first attempt).
    const res2 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { ...signed.headers, 'x-task-222-fault-inject-persistence': 'true' },
      body: signed.body,
    });
    expect(res2.status).toBeGreaterThanOrEqual(500);
    expect(res2.status).toBeLessThan(600);
    expect((await getRefundEventByEvent(event.id)).count).toBe(0);

    // Fault clears, retry succeeds and persists exactly one row.
    const res3 = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: signed.headers, body: signed.body,
    });
    expect(res3.status).toBe(200);
    const body3 = (await res3.json()) as WebhookSuccessBody;
    expect(typeof body3.persistedRowId).toBe('number');
    const final = await getRefundEventByEvent(event.id);
    expect(final.count).toBe(1);
    expect(final.rows[0].id).toBe(body3.persistedRowId);
  });

  it('P4: refund.updated and refund.failed each persist their own row keyed by stripe_event_id', async () => {
    const scenario = await seedCartScenario();
    const piId = `pi_test_222_p4_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    await seedUnifiedPayment({ paymentIntentId: piId, userId: scenario.parent.id, amount: 2500 });

    // Drive a charge.refunded so a refund id exists in our universe.
    const { refund, charge, signed: refundedSigned } = buildChargeRefundedEvent({
      paymentIntentId: piId,
      amountCents: 2500,
      eventIdSuffix: 'p4_seed',
    });
    const seedRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: refundedSigned.headers, body: refundedSigned.body,
    });
    expect(seedRes.status).toBe(200);

    // refund.updated → status 'pending'
    const upd = buildRefundLifecycleEvent({
      type: 'refund.updated',
      paymentIntentId: piId,
      refundId: refund.id,
      chargeId: charge.id,
      amountCents: 2500,
      status: 'pending',
      eventIdSuffix: 'p4_updated',
    });
    const updRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: upd.signed.headers, body: upd.signed.body,
    });
    expect(updRes.status).toBe(200);
    const updBody = (await updRes.json()) as WebhookSuccessBody;
    expect(typeof updBody.persistedRowId).toBe('number');
    const updRows = await getRefundEventByEvent(upd.event.id);
    expect(updRows.count).toBe(1);
    expect(updRows.rows[0].eventType).toBe('refund.updated');
    expect(updRows.rows[0].refundStatus).toBe('pending');
    expect(updRows.rows[0].stripeRefundId).toBe(refund.id);

    // refund.failed → status 'failed'
    const fail = buildRefundLifecycleEvent({
      type: 'refund.failed',
      paymentIntentId: piId,
      refundId: refund.id,
      chargeId: charge.id,
      amountCents: 2500,
      status: 'failed',
      failureReason: 'expired_or_canceled_card',
      eventIdSuffix: 'p4_failed',
    });
    const failRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: fail.signed.headers, body: fail.signed.body,
    });
    expect(failRes.status).toBe(200);
    const failRows = await getRefundEventByEvent(fail.event.id);
    expect(failRows.count).toBe(1);
    expect(failRows.rows[0].eventType).toBe('refund.failed');
    expect(failRows.rows[0].refundStatus).toBe('failed');

    // Three distinct event rows for the SAME refund (charge.refunded + updated + failed).
    expect(await getRefundEventCountByRefundId(refund.id)).toBe(3);
  });

  it('P5: every reachable refund-handler skip branch records a structured skip entry at runtime', async () => {
    // ---- Branch 1: no_refund_data_in_event -------------------------
    // Build a charge.refunded with refunds.data = [] — handler must skip
    // without crashing AND record the structured entry.
    const piEmpty = `pi_test_222_p5empty_${Date.now()}`;
    const emptyEvent = {
      id: `evt_test_222_p5empty_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
      object: 'event' as const,
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      type: 'charge.refunded' as const,
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: `ch_test_222_p5empty_${Date.now()}`,
          object: 'charge',
          amount: 0,
          amount_refunded: 0,
          currency: 'usd',
          payment_intent: piEmpty,
          refunded: true,
          refunds: { object: 'list', data: [] },
        },
      },
    };
    const emptySigned = signWebhook(emptyEvent);
    // Persistence-required event must NOT 200 with no row — but our handler
    // breaks BEFORE the persistence claim when refunds.data is empty (we have
    // no stripe_refund_id to insert). This is intentionally NOT acked 200 —
    // the success-path invariant returns 5xx with persistedRowId=null.
    const eRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: emptySigned.headers, body: emptySigned.body,
    });
    expect(eRes.status).toBeGreaterThanOrEqual(500);
    const emptySkips = await fetchSkips(emptyEvent.id);
    const emptySkip = emptySkips.find((e) => e.reason === 'no_refund_data_in_event');
    expect(emptySkip).toBeDefined();
    expect(emptySkip!.refundId).toBeNull();
    expect(emptySkip!.metadataKey).toBe('refunds.data');

    // ---- Branch 2: original_payment_not_found_in_either_table ------
    // PI that does not exist in EITHER `payments` OR `stripe_payment_history`.
    const piMissing = `pi_test_222_p5missing_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const missing = buildChargeRefundedEvent({
      paymentIntentId: piMissing,
      amountCents: 1500,
      eventIdSuffix: 'p5_missing',
    });
    const mRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST', headers: missing.signed.headers, body: missing.signed.body,
    });
    expect(mRes.status).toBe(200);
    const missingSkips = await fetchSkips(missing.event.id);
    const lookupSkip = missingSkips.find(
      (e) => e.reason === 'original_payment_not_found_in_either_table',
    );
    expect(lookupSkip).toBeDefined();
    expect(lookupSkip!.refundId).toBe(missing.refund.id);
    expect(lookupSkip!.paymentIntentId).toBe(piMissing);
    expect(lookupSkip!.metadataKey).toBe('payment_intent_id');
    expect(lookupSkip!.persistedRowId).not.toBeNull();
    // The durable row STILL exists (failed_lookup state) — lookup miss does
    // NOT vaporize the event; it preserves it for ops replay.
    const missingRow = await getRefundEventByEvent(missing.event.id);
    expect(missingRow.count).toBe(1);
    expect(missingRow.rows[0].processingStatus).toBe('failed_lookup');
  });
});
