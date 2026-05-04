/**
 * Regression: Task #221.
 *
 * Asserts that an enrollment created by /api/test/setup-cart-scenario is
 * visible via the *exact* lookup path that POST /api/payment-history/manual
 * uses internally (`storage.getAllEnrollments().find(e => e.id === id)`).
 *
 * If the seed ever silently falls back to MemStorage again (Task #203
 * finding #1, the bug Task #221 closes), this lookup returns
 * `visible: false` and the test fails — long before any payment-flow
 * integration test would mysteriously 400 with "Enrollment not found".
 */

import { describe, it, expect } from '@jest/globals';
import {
  seedCartScenario,
  TEST_BASE_URL,
  TEST_HEADERS,
} from './helpers/seedCartScenario';

interface VisibilityResponse {
  visible: boolean;
  totalEnrollments: number;
  enrollment: { id: number; childName?: string; parentEmail?: string } | null;
}

describe('Task #221: seeded enrollment is visible to /api/payment-history/manual lookup path', () => {
  it('storage.getAllEnrollments() returns the enrollment created by setup-cart-scenario', async () => {
    const scenario = await seedCartScenario();
    expect(scenario.enrollment.id).toBeGreaterThan(0);

    const res = await fetch(
      `${TEST_BASE_URL}/api/test/manual-payment-enrollment-visibility/${scenario.enrollment.id}`,
      { method: 'GET', headers: TEST_HEADERS },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VisibilityResponse;

    if (!body.visible) {
      throw new Error(
        `Task #221 regression: enrollment ${scenario.enrollment.id} returned by ` +
          `/api/test/setup-cart-scenario is NOT visible to ` +
          `storage.getAllEnrollments() (the lookup path used by ` +
          `/api/payment-history/manual). This indicates the seed silently ` +
          `fell back to MemStorage. totalEnrollments=${body.totalEnrollments}.`,
      );
    }

    expect(body.enrollment).not.toBeNull();
    expect(body.enrollment!.id).toBe(scenario.enrollment.id);
    // child_name is the NOT NULL column whose violation originally drove the
    // MemStorage fallback. Confirm it persisted.
    expect(body.enrollment!.childName).toBe(
      `${scenario.child.firstName} ${scenario.child.lastName}`,
    );
    expect(body.enrollment!.parentEmail).toBe(scenario.parent.email);
  });
});
