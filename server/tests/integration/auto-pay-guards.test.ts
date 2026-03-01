/**
 * Integration Tests: Auto-Pay Scheduler Guard Conditions
 *
 * Tests the pre-charge guards and production-hardening behaviours in the auto-pay system by:
 *  1. Seeding a self-contained DB scenario via POST /api/test/setup-auto-pay-scenario
 *  2. Triggering the single-payment function via POST /api/test/run-auto-pay-for/:id
 *  3. Asserting the scheduled payment's final status via GET /api/test/scheduled-payment/:id
 *
 * All test endpoints bypass Supabase auth via X-Test-Token (testOnlyMiddleware).
 * No Stripe credentials are used — all guards fire before the Stripe call.
 *
 * Guards tested (G1–G5):
 *  G1: autoPayEnabled === false       → status stays 'pending'
 *  G2: No saved payment method        → status stays 'pending'
 *  G3: amount < 50 cents              → status stays 'pending'
 *  G4: enrollment already paid (balance = 0) → status set to 'cancelled' (critical double-charge guard)
 *  G5: payment already in 'processing' state → status stays 'processing' (idempotency guard)
 *
 * Production-hardening behaviours (G6–G8):
 *  G6: retryCount >= 3 (MAX_RETRIES)  → status set to 'failed', failureReason contains 'Exceeded'
 *  G7: scheduledDate 20 days ago      → excluded by getDueScheduledPayments (14-day staleness window)
 *  G8: stuck-processing with no PI ID → recoverOneScheduledPayment resets to 'pending'
 *
 * Guards NOT tested here due to Neon DB constraints:
 *  'enrollment-not-found': scheduled_payments.enrollment_id is NOT NULL + FK.
 *    Neon blocks SET session_replication_role = 'replica' (superuser only).
 *    Code fix in auto-pay-scheduler.ts returns 'skipped' when enrollment is undefined.
 *  'balance-null-still-blocks': program_enrollments.remaining_balance is NOT NULL in DB.
 *    The ?? fallback is defensive code for a DB state the schema prevents.
 */

import { describe, it, expect } from '@jest/globals';

const BASE_URL = 'http://localhost:5000';
const HEADERS = {
  'X-Test-Token': 'test-secret-token',
  'Content-Type': 'application/json',
};

async function seedScenario(scenario: string): Promise<{ scheduledPaymentId: number; parentId: number; enrollmentId: number }> {
  const res = await fetch(`${BASE_URL}/api/test/setup-auto-pay-scenario`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${scenario}] Setup failed (${res.status}): ${body}`);
  }
  const data = await res.json() as any;
  if (!data.scheduledPaymentId) throw new Error(`[${scenario}] No scheduledPaymentId in response: ${JSON.stringify(data)}`);
  return data;
}

async function triggerGuard(scheduledPaymentId: number): Promise<'charged' | 'skipped' | 'failed'> {
  const res = await fetch(`${BASE_URL}/api/test/run-auto-pay-for/${scheduledPaymentId}`, {
    method: 'POST',
    headers: HEADERS,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`run-auto-pay-for/${scheduledPaymentId} failed (${res.status}): ${body}`);
  }
  const data = await res.json() as any;
  return data.result;
}

async function getPayment(scheduledPaymentId: number): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/test/scheduled-payment/${scheduledPaymentId}`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`scheduled-payment/${scheduledPaymentId} lookup failed (${res.status}): ${body}`);
  }
  const data = await res.json() as any;
  return data.payment;
}

async function getPaymentStatus(scheduledPaymentId: number): Promise<string> {
  const payment = await getPayment(scheduledPaymentId);
  return payment.status;
}

async function runRecovery(scheduledPaymentId: number): Promise<'reset' | 'completed' | 'failed' | 'left-alone'> {
  const res = await fetch(`${BASE_URL}/api/test/run-recovery-for/${scheduledPaymentId}`, {
    method: 'POST',
    headers: HEADERS,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`run-recovery-for/${scheduledPaymentId} failed (${res.status}): ${body}`);
  }
  const data = await res.json() as any;
  return data.result;
}

async function getDuePaymentIds(): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/api/test/due-scheduled-payments`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`due-scheduled-payments failed (${res.status}): ${body}`);
  }
  const data = await res.json() as any;
  return data.paymentIds;
}

describe('Auto-Pay Guard Conditions', () => {
  it('G1: autopay-disabled — skips and leaves status as pending', async () => {
    const { scheduledPaymentId } = await seedScenario('autopay-disabled');
    const result = await triggerGuard(scheduledPaymentId);
    const status = await getPaymentStatus(scheduledPaymentId);

    expect(result).toBe('skipped');
    expect(status).toBe('pending');
  }, 30000);

  it('G2: no-payment-method — skips and leaves status as pending', async () => {
    const { scheduledPaymentId } = await seedScenario('no-payment-method');
    const result = await triggerGuard(scheduledPaymentId);
    const status = await getPaymentStatus(scheduledPaymentId);

    expect(result).toBe('skipped');
    expect(status).toBe('pending');
  }, 30000);

  it('G3: amount-too-small — skips amount below $0.50 Stripe minimum and leaves status as pending', async () => {
    const { scheduledPaymentId } = await seedScenario('amount-too-small');
    const result = await triggerGuard(scheduledPaymentId);
    const status = await getPaymentStatus(scheduledPaymentId);

    expect(result).toBe('skipped');
    expect(status).toBe('pending');
  }, 30000);

  it('G4: enrollment-paid-in-full — auto-cancels stale scheduled payment (critical double-charge guard)', async () => {
    const { scheduledPaymentId } = await seedScenario('enrollment-paid-in-full');
    const result = await triggerGuard(scheduledPaymentId);
    const status = await getPaymentStatus(scheduledPaymentId);

    expect(result).toBe('skipped');
    expect(status).toBe('cancelled');
  }, 30000);

  it('G5: already-processing — idempotency guard skips non-pending payment, status unchanged', async () => {
    // Payment seeded with status='processing' (simulates scheduler crash mid-flight)
    // Guard: sp.status !== 'pending' → return 'skipped' without touching status or calling Stripe
    const { scheduledPaymentId } = await seedScenario('already-processing');
    const result = await triggerGuard(scheduledPaymentId);
    const status = await getPaymentStatus(scheduledPaymentId);

    expect(result).toBe('skipped');
    expect(status).toBe('processing');
  }, 30000);

  it('G6: retry-cap-exceeded — permanently fails without calling Stripe, failureReason contains Exceeded', async () => {
    // Payment seeded with retryCount=3 (= MAX_RETRIES)
    // Guard fires before Stripe: retryCount >= MAX_RETRIES → status 'failed', return 'failed'
    const { scheduledPaymentId } = await seedScenario('retry-cap-exceeded');
    const result = await triggerGuard(scheduledPaymentId);
    const payment = await getPayment(scheduledPaymentId);

    expect(result).toBe('failed');
    expect(payment.status).toBe('failed');
    expect(payment.failureReason).toMatch(/Exceeded/i);
  }, 30000);

  it('G7: staleness-cutoff — 20-day-old payment is excluded from getDueScheduledPayments (14-day window)', async () => {
    // Payment seeded with scheduledDate = 20 days ago
    // getDueScheduledPayments(today, 14) must NOT include this payment
    const { scheduledPaymentId } = await seedScenario('staleness-cutoff');
    const dueIds = await getDuePaymentIds();
    const status = await getPaymentStatus(scheduledPaymentId);

    expect(dueIds).not.toContain(scheduledPaymentId);
    expect(status).toBe('pending'); // untouched — scheduler never saw it
  }, 30000);

  it('G8: stuck-processing-no-pi — recovery resets to pending when no Stripe PI was created', async () => {
    // Payment seeded with status='processing' and no stripePaymentIntentId
    // Case A: Stripe was never called → safe to reset to pending
    const { scheduledPaymentId } = await seedScenario('stuck-processing-no-pi');
    const result = await runRecovery(scheduledPaymentId);
    const status = await getPaymentStatus(scheduledPaymentId);

    expect(result).toBe('reset');
    expect(status).toBe('pending');
  }, 30000);
});

describe('Test endpoint security', () => {
  it('returns 400 for invalid scenario name', async () => {
    const res = await fetch(`${BASE_URL}/api/test/setup-auto-pay-scenario`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ scenario: 'invalid-name' }),
    });
    expect(res.status).toBe(400);
  }, 10000);

  it('returns 401 when X-Test-Token is missing', async () => {
    const res = await fetch(`${BASE_URL}/api/test/setup-auto-pay-scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'autopay-disabled' }),
    });
    expect(res.status).toBe(401);
  }, 10000);
});
