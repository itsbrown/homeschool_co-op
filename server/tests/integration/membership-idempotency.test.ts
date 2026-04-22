/**
 * Integration Tests: Membership Enrollment Idempotency
 *
 * Verifies that the confirm endpoint and Stripe webhook handler cannot
 * double-create or double-charge a membership even when both fire for
 * the same paymentIntent.id.
 *
 * Each test seeds an isolated scenario via the test-only endpoints, then fires
 * both code paths in sequence and asserts the final DB state has exactly one
 * enrolled record.
 *
 * Tests:
 *  M1: Confirm runs first → webhook fires → webhook is a no-op (action = 'skipped')
 *  M2: Webhook fires first → confirm runs → confirm is a no-op (action = 'skipped')
 *  M3: Confirm called twice with same paymentIntentId → second call is a no-op
 *  M4: Webhook called twice with same paymentIntentId → second call is a no-op
 *
 * All test endpoints are gated by X-Test-Token and return 403 in production.
 */

import { describe, it, expect } from '@jest/globals';

const BASE_URL = 'http://localhost:5000';
const HEADERS = {
  'X-Test-Token': 'test-secret-token',
  'Content-Type': 'application/json',
};

interface SetupResult {
  parentId: number;
  schoolId: number;
  membershipYear: number;
  membershipAmount: number;
  paymentIntentId: string;
}

interface ActionResult {
  membershipId: number;
  action: 'created' | 'updated' | 'skipped';
}

async function setupScenario(): Promise<SetupResult> {
  const res = await fetch(`${BASE_URL}/api/test/membership-idempotency/setup`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Setup failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<SetupResult>;
}

async function simulateConfirm(scenario: SetupResult): Promise<ActionResult> {
  const res = await fetch(`${BASE_URL}/api/test/membership-idempotency/simulate-confirm`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(scenario),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`simulate-confirm failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<ActionResult>;
}

async function simulateWebhook(scenario: SetupResult): Promise<ActionResult> {
  const res = await fetch(`${BASE_URL}/api/test/membership-idempotency/simulate-webhook`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(scenario),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`simulate-webhook failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<ActionResult>;
}

async function getEnrollment(parentId: number, schoolId: number, year: number): Promise<any> {
  const res = await fetch(
    `${BASE_URL}/api/test/membership-idempotency/enrollment/${parentId}/${schoolId}/${year}`,
    { method: 'GET', headers: HEADERS }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`enrollment lookup failed (${res.status}): ${body}`);
  }
  return res.json();
}

describe('Membership Enrollment Idempotency', () => {
  it('M1: confirm first → webhook skips → exactly one enrolled record', async () => {
    const scenario = await setupScenario();

    const confirmResult = await simulateConfirm(scenario);
    expect(confirmResult.action).toBe('created');
    expect(confirmResult.membershipId).toBeGreaterThan(0);

    const webhookResult = await simulateWebhook(scenario);
    expect(webhookResult.action).toBe('skipped');
    expect(webhookResult.membershipId).toBe(confirmResult.membershipId);

    const enrollment = await getEnrollment(scenario.parentId, scenario.schoolId, scenario.membershipYear);
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('enrolled');
    expect(enrollment.notes).toContain(scenario.paymentIntentId);
  });

  it('M2: webhook first → confirm skips → exactly one enrolled record', async () => {
    const scenario = await setupScenario();

    const webhookResult = await simulateWebhook(scenario);
    expect(webhookResult.action).toBe('created');
    expect(webhookResult.membershipId).toBeGreaterThan(0);

    const confirmResult = await simulateConfirm(scenario);
    expect(confirmResult.action).toBe('skipped');
    expect(confirmResult.membershipId).toBe(webhookResult.membershipId);

    const enrollment = await getEnrollment(scenario.parentId, scenario.schoolId, scenario.membershipYear);
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('enrolled');
  });

  it('M3: confirm called twice with same paymentIntentId → second call is a no-op', async () => {
    const scenario = await setupScenario();

    const first = await simulateConfirm(scenario);
    expect(first.action).toBe('created');

    const second = await simulateConfirm(scenario);
    expect(second.action).toBe('skipped');
    expect(second.membershipId).toBe(first.membershipId);

    const enrollment = await getEnrollment(scenario.parentId, scenario.schoolId, scenario.membershipYear);
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('enrolled');
  });

  it('M4: webhook called twice with same paymentIntentId → second call is a no-op', async () => {
    const scenario = await setupScenario();

    const first = await simulateWebhook(scenario);
    expect(first.action).toBe('created');

    const second = await simulateWebhook(scenario);
    expect(second.action).toBe('skipped');
    expect(second.membershipId).toBe(first.membershipId);

    const enrollment = await getEnrollment(scenario.parentId, scenario.schoolId, scenario.membershipYear);
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe('enrolled');
  });
});
