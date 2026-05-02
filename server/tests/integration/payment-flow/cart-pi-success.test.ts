/**
 * Regression gate: cart → snapshot → PI → confirm → webhook → enrollment.
 *
 * Task #203 audit findings asserted by this test:
 *   #1 silent MemStorage fallback for /api/test/setup-cart-scenario
 *   #2 webhook handled:false routing miss
 *   #3 duplicate stripe_payment_history rows
 *   #4 receipt missing from /api/payment-history/history
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  seedCartScenario,
  getProgramEnrollment,
  getStripePayment,
  getStripePaymentCount,
  TEST_BASE_URL,
  TEST_HEADERS,
} from './helpers/seedCartScenario';
import { confirmTestPaymentIntent } from './helpers/confirmPaymentIntent';
import { signWebhook } from './helpers/signWebhook';

interface PaymentPlanOption {
  id: string;
  amount?: number;
  numberOfPayments?: number;
  totalAmount?: number;
}

interface CartSnapshotResponse {
  snapshotId: string;
  totals: {
    grandTotal: number;
    payableAmount: number;
    itemsTotal?: number;
    membershipTotal?: number;
  };
  paymentPlans: PaymentPlanOption[];
}

interface CreatePaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
}

interface PaymentHistoryEntry {
  stripePaymentIntentId: string | null;
  amount: number;
  status: string;
}

interface PaymentHistoryResponse {
  payments?: PaymentHistoryEntry[];
  history?: PaymentHistoryEntry[];
  data?: PaymentHistoryEntry[];
}

interface WebhookResponse {
  received: boolean;
  event_type: string;
  handled: boolean;
}

type FetchHeadersWithCookies = Headers & {
  getSetCookie?: () => string[];
  raw?: () => Record<string, string[]>;
};

function createCookieJar() {
  const jar = new Map<string, string>();
  return {
    capture(res: Response): void {
      const headers = res.headers as FetchHeadersWithCookies;
      const setCookies: string[] =
        typeof headers.getSetCookie === 'function'
          ? headers.getSetCookie()
          : typeof headers.raw === 'function'
            ? (headers.raw()['set-cookie'] ?? [])
            : [];
      const single = res.headers.get('set-cookie');
      const all = setCookies.length > 0 ? setCookies : single ? [single] : [];
      for (const cookie of all) {
        const [pair] = cookie.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) {
          jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
      }
    },
    header(): string {
      return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

function assertFinding(condition: boolean, finding: string, detail: string): void {
  if (!condition) {
    throw new Error(`Task #203 ${finding}: ${detail}`);
  }
}

describe('Payment Flow: Cart snapshot → PaymentIntent → Webhook → Enrollment', () => {
  beforeAll(() => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set so signWebhook matches the dev server.');
    }
  });

  it('persists enrollment update + stripe_payment_history when PI succeeds via webhook', async () => {
    const scenario = await seedCartScenario();
    expect(scenario.enrollment.id).toBeGreaterThan(0);
    expect(scenario.enrollment.status).toBe('pending_payment');
    expect(scenario.enrollment.totalCost).toBe(10000);
    expect(scenario.enrollment.remainingBalance).toBe(10000);

    const seeded = await getProgramEnrollment(scenario.enrollment.id);
    assertFinding(
      seeded !== null,
      'Finding #1',
      `seeded enrollment ${scenario.enrollment.id} not in Postgres after setup-cart-scenario`,
    );
    expect(seeded!.status).toBe('pending_payment');
    expect(seeded!.remainingBalance).toBe(10000);

    const cookies = createCookieJar();
    const loginRes = await fetch(`${TEST_BASE_URL}/api/test/login`, {
      method: 'POST',
      headers: TEST_HEADERS,
      body: JSON.stringify({
        email: scenario.parent.email,
        password: scenario.parent.password,
      }),
    });
    cookies.capture(loginRes);
    expect(loginRes.status).toBe(200);

    const cartLine = {
      id: `${scenario.class.id}-${scenario.child.id}`,
      classId: scenario.class.id,
      childId: scenario.child.id,
      childName: `${scenario.child.firstName} ${scenario.child.lastName}`,
      enrollmentId: scenario.enrollment.id,
      remainingBalance: scenario.enrollment.remainingBalance,
    };
    const snapshotRes = await fetch(`${TEST_BASE_URL}/api/cart/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookies.header() },
      body: JSON.stringify({ items: [cartLine], creditsToApply: 0 }),
    });
    expect(snapshotRes.status).toBe(200);
    const snapshotBody = (await snapshotRes.json()) as CartSnapshotResponse;
    expect(snapshotBody.snapshotId).toBeTruthy();
    expect(typeof snapshotBody.totals.grandTotal).toBe('number');
    expect(snapshotBody.totals.grandTotal).toBe(scenario.enrollment.totalCost);
    expect(typeof snapshotBody.totals.payableAmount).toBe('number');
    expect(snapshotBody.totals.payableAmount).toBe(scenario.enrollment.totalCost);
    expect(Array.isArray(snapshotBody.paymentPlans)).toBe(true);
    expect(snapshotBody.paymentPlans.length).toBeGreaterThan(0);
    expect(snapshotBody.paymentPlans.every((p) => typeof p.id === 'string')).toBe(true);

    const { computeCartItemFingerprint } = await import('../../../../shared/cartFingerprint');
    const cartItemFingerprint = computeCartItemFingerprint([
      {
        classId: cartLine.classId,
        childId: cartLine.childId,
        enrollmentId: cartLine.enrollmentId,
      },
    ]);

    const grandTotal = snapshotBody.totals.grandTotal;
    const piRes = await fetch(`${TEST_BASE_URL}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookies.header() },
      body: JSON.stringify({
        items: [cartLine],
        subtotal: grandTotal,
        total: grandTotal,
        paymentPlan: 'full',
        paymentFrequency: 'one_time',
        trustedSnapshotId: snapshotBody.snapshotId,
        cartItemFingerprint,
        creditsToApply: 0,
      }),
    });
    expect(piRes.status).toBe(200);
    const piBody = (await piRes.json()) as CreatePaymentIntentResponse;
    expect(piBody.paymentIntentId).toBeTruthy();
    expect(piBody.clientSecret).toBeTruthy();

    const confirmedPi = await confirmTestPaymentIntent({
      paymentIntentId: piBody.paymentIntentId,
    });
    expect(confirmedPi.status).toBe('succeeded');

    const event = {
      id: `evt_test_${confirmedPi.id}`,
      object: 'event' as const,
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      type: 'payment_intent.succeeded' as const,
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      data: { object: confirmedPi },
    };
    const { headers: webhookHeaders, body: webhookBody } = signWebhook(event);

    const webhookRes = await fetch(`${TEST_BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: webhookHeaders,
      body: webhookBody,
    });
    expect(webhookRes.status).toBe(200);
    const webhookJson = (await webhookRes.json()) as WebhookResponse;
    assertFinding(
      webhookJson.received === true,
      'Finding #2',
      `expected received===true, got ${JSON.stringify(webhookJson)}`,
    );
    assertFinding(
      webhookJson.handled === true,
      'Finding #2',
      `expected handled===true (handler routed), got ${JSON.stringify(webhookJson)}`,
    );
    expect(webhookJson.event_type).toBe('payment_intent.succeeded');

    await new Promise((resolve) => setTimeout(resolve, 250));

    const after = await getProgramEnrollment(scenario.enrollment.id);
    assertFinding(after !== null, 'Finding #1', `enrollment ${scenario.enrollment.id} missing post-webhook`);
    assertFinding(
      after!.status === 'enrolled',
      'Finding #1',
      `expected status='enrolled', got '${after!.status}'`,
    );
    assertFinding(
      after!.remainingBalance === 0,
      'Finding #1',
      `expected remainingBalance=0, got ${after!.remainingBalance}`,
    );
    expect(after!.totalPaid).toBeGreaterThanOrEqual(scenario.enrollment.totalCost);
    expect(['completed', 'stripe_managed']).toContain(after!.paymentStatus);

    const stripePayment = await getStripePayment(confirmedPi.id);
    assertFinding(
      stripePayment !== null,
      'Finding #3',
      `no stripe_payment_history row for PI ${confirmedPi.id}`,
    );
    expect(stripePayment!.paymentIntentId).toBe(confirmedPi.id);
    expect(stripePayment!.status).toBe('succeeded');
    expect(stripePayment!.amount).toBe(scenario.enrollment.totalCost);

    const stripePaymentCount = await getStripePaymentCount(confirmedPi.id);
    assertFinding(
      stripePaymentCount === 1,
      'Finding #3',
      `expected 1 stripe_payment_history row for ${confirmedPi.id}, got ${stripePaymentCount}`,
    );

    const historyRes = await fetch(`${TEST_BASE_URL}/api/payment-history/history`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', cookie: cookies.header() },
    });
    expect(historyRes.status).toBe(200);
    const historyJson = (await historyRes.json()) as PaymentHistoryResponse | PaymentHistoryEntry[];
    const historyList: PaymentHistoryEntry[] = Array.isArray(historyJson)
      ? historyJson
      : (historyJson.payments ?? historyJson.history ?? historyJson.data ?? []);
    const matched = historyList.find((entry) => entry.stripePaymentIntentId === confirmedPi.id);
    assertFinding(
      matched !== undefined,
      'Finding #4',
      `PI ${confirmedPi.id} missing from /api/payment-history/history (receipt would be missing from dashboard)`,
    );
    expect(matched!.amount).toBe(scenario.enrollment.totalCost);
    expect(matched!.status).toBe('succeeded');
  });
});
