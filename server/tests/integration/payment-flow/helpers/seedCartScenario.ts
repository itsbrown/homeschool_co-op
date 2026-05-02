/** Client wrappers around the token-gated /api/test/* harness endpoints. */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const HEADERS = {
  'X-Test-Token': 'test-secret-token',
  'Content-Type': 'application/json',
};

export interface CartScenario {
  parent: { email: string; password: string; id: number };
  child: { id: number; firstName: string; lastName: string };
  class: { id: number; title: string; price: number };
  enrollment: {
    id: number;
    status: string;
    totalCost: number;
    remainingBalance: number;
    paymentPlan?: string;
  };
  school: { id: number; name: string; registrationCode: string };
  credit: { id: number; amountCents: number; status: string } | null;
  membership: {
    id: number;
    status: string;
    membershipYear: number;
    totalAmount: number;
  } | null;
}

export interface ProgramEnrollmentRecord {
  id: number;
  status: string;
  totalCost: number;
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: string;
  paymentPlan?: string | null;
  stripePaymentIntentId?: string | null;
}

export interface StripePaymentRecord {
  paymentIntentId: string;
  status: string;
  amount: number;
}

/**
 * Typed seed options. `withCredits` is the credit amount in cents (or
 * 0 / omitted for none); `withMembership` toggles an enrolled membership
 * record for the seeded parent.
 */
export interface SeedCartScenarioOptions {
  paymentPlan?: 'full_payment' | 'deposit_only' | 'biweekly' | 'custom';
  withCredits?: number;
  withMembership?: boolean;
}

interface SeedCartScenarioResponse {
  success: boolean;
  data: CartScenario;
}

interface StripePaymentCountResponse {
  count: number;
}

export async function seedCartScenario(
  options: SeedCartScenarioOptions = {},
): Promise<CartScenario> {
  const res = await fetch(`${BASE_URL}/api/test/setup-cart-scenario`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    throw new Error(`setup-cart-scenario failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as SeedCartScenarioResponse;
  if (!json.success || !json.data) {
    throw new Error(`setup-cart-scenario malformed body: ${JSON.stringify(json)}`);
  }
  return json.data;
}

export async function getProgramEnrollment(
  id: number,
): Promise<ProgramEnrollmentRecord | null> {
  const res = await fetch(`${BASE_URL}/api/test/program-enrollment/${id}`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!res.ok) {
    throw new Error(`program-enrollment failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as ProgramEnrollmentRecord | null;
}

export async function getStripePayment(
  paymentIntentId: string,
): Promise<StripePaymentRecord | null> {
  const res = await fetch(
    `${BASE_URL}/api/test/stripe-payment/${paymentIntentId}`,
    { method: 'GET', headers: HEADERS },
  );
  if (!res.ok) {
    throw new Error(`stripe-payment failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as StripePaymentRecord | null;
}

export async function getStripePaymentCount(
  paymentIntentId: string,
): Promise<number> {
  const res = await fetch(
    `${BASE_URL}/api/test/stripe-payment-count/${paymentIntentId}`,
    { method: 'GET', headers: HEADERS },
  );
  if (!res.ok) {
    throw new Error(`stripe-payment-count failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as StripePaymentCountResponse;
  return json.count;
}

export const TEST_BASE_URL = BASE_URL;
export const TEST_HEADERS = HEADERS;
