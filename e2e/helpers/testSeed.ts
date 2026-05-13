import type { APIRequestContext, APIResponse } from "@playwright/test";

const DEFAULT_TOKEN = "test-secret-token";

export function testApiToken(): string {
  return process.env.E2E_TEST_API_TOKEN?.trim() || DEFAULT_TOKEN;
}

export type SetupCartScenarioResponse = {
  success: boolean;
  data?: {
    supabaseLinked?: boolean;
    parent: { email: string; password: string; id: number };
    enrollment: { id: number; paymentPlan?: string; remainingBalance?: number };
    child: { id: number; firstName: string; lastName: string };
    credit?: { id: number; amountCents: number; status: string } | null;
  };
  error?: string;
  details?: string;
};

export async function postSetupCartScenario(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ response: APIResponse; json: SetupCartScenarioResponse | null }> {
  const response = await request.post("/api/test/setup-cart-scenario", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  let json: SetupCartScenarioResponse | null = null;
  try {
    json = (await response.json()) as SetupCartScenarioResponse;
  } catch {
    json = null;
  }
  return { response, json };
}

export async function postSeedUpcomingScheduledPayment(
  request: APIRequestContext,
  body: { enrollmentId: number; amountCents?: number; paymentPlan?: string },
): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await request.post("/api/test/seed-upcoming-scheduled-payment", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  const text = await response.text();
  return { ok: response.ok(), status: response.status(), text };
}
