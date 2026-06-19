/**
 * Integration: support issue report persistence + auth gate.
 * Requires dev server on TEST_BASE_URL (Playwright webServer or `npm run dev`).
 */

import { describe, it, expect } from '@jest/globals';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const HEADERS = {
  'X-Test-Token': 'test-secret-token',
  'Content-Type': 'application/json',
};

async function ensureSchema() {
  const res = await fetch(`${BASE_URL}/api/test/ensure-technical-support-schema`, {
    method: 'POST',
    headers: HEADERS,
  });
  if (!res.ok) {
    throw new Error(`ensure schema failed (${res.status}): ${await res.text()}`);
  }
}

async function seedCartScenario() {
  const res = await fetch(`${BASE_URL}/api/test/setup-cart-scenario`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      paymentPlan: 'full_payment',
      linkSupabaseAuth: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`setup-cart-scenario failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    success: boolean;
    data?: {
      supabaseLinked?: boolean;
      parent: { email: string; password: string };
      school: { id: number };
    };
  };
  if (!json.success || !json.data?.parent) {
    throw new Error(`setup-cart-scenario malformed: ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function loginSupabase(email: string, password: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string };
  return body.access_token ?? null;
}

describe('technical support report API', () => {
  it('returns 401 without Bearer token', async () => {
    const res = await fetch(`${BASE_URL}/api/technical-support/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'integration probe' }),
    });
    expect(res.status).toBe(401);
  });

  it('persists platform issue and returns AI response fields', async () => {
    await ensureSchema();
    const seed = await seedCartScenario();
    if (seed.supabaseLinked !== true) {
      console.warn('Skipping: Supabase not linked for seeded parent');
      return;
    }

    const token = await loginSupabase(seed.parent.email, seed.parent.password);
    if (!token) {
      console.warn('Skipping: could not obtain Supabase token (set SUPABASE_URL + anon key)');
      return;
    }

    const description = `Integration platform issue ${Date.now()}`;
    const reportRes = await fetch(`${BASE_URL}/api/technical-support/report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description,
        issueCategory: 'platform',
        currentUrl: `${BASE_URL}/dashboard`,
        browserInfo: { browser: 'Jest', version: '1', platform: 'test' },
      }),
    });
    expect(reportRes.status).toBe(200);
    const reportBody = (await reportRes.json()) as {
      success: boolean;
      issueId: string;
      userResponse: string;
      recommendedActions: string[];
    };
    expect(reportBody.success).toBe(true);
    expect(reportBody.issueId).toMatch(/^TECH-/);
    expect(reportBody.userResponse.length).toBeGreaterThan(5);
    expect(reportBody.recommendedActions.length).toBeGreaterThan(0);

    const lookupRes = await fetch(
      `${BASE_URL}/api/test/technical-support-issue/${reportBody.issueId}`,
      { headers: { 'X-Test-Token': 'test-secret-token' } },
    );
    expect(lookupRes.status).toBe(200);
    const lookup = (await lookupRes.json()) as { issue: { description: string; issueCategory: string } };
    expect(lookup.issue.description).toBe(description);
    expect(lookup.issue.issueCategory).toBe('platform');
  });
});
