/**
 * Integration Tests: Auto-Pay Scheduler Guard Conditions
 *
 * Tests the 5 pre-charge guards in processOneScheduledPayment() by:
 *  1. Seeding a self-contained DB scenario via POST /api/test/setup-auto-pay-scenario
 *  2. Triggering the single-payment function via POST /api/test/run-auto-pay-for/:id
 *  3. Asserting the scheduled payment's final status via GET /api/test/scheduled-payment/:id
 *
 * All test endpoints bypass Supabase auth via X-Test-Token (testOnlyMiddleware).
 * No Stripe credentials are used — all 5 guards fire before the Stripe call.
 *
 * Guards tested:
 *  G1: autoPayEnabled === false       → status stays 'pending'
 *  G2: No saved payment method        → status stays 'pending'
 *  G3: amount < 50 cents              → status stays 'pending'
 *  G4: enrollment already paid (balance = 0) → status set to 'cancelled' (critical double-charge guard)
 *  G5: payment already in 'processing' state → status stays 'processing' (idempotency guard)
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

async function getPaymentStatus(scheduledPaymentId: number): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/test/scheduled-payment/${scheduledPaymentId}`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`scheduled-payment/${scheduledPaymentId} lookup failed (${res.status}): ${body}`);
  }
  const data = await res.json() as any;
  return data.payment.status;
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
