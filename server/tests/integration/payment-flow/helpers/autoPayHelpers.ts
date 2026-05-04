/** Wrappers around extra /api/test/* endpoints used by the payment-flow
 * regression tests for scheduled payments, balance splits, refunds and
 * async payment-failed retry caps.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const HEADERS = {
  'X-Test-Token': 'test-secret-token',
  'Content-Type': 'application/json',
};

export interface AutoPayScenario {
  scheduledPaymentId: number;
  parentId: number;
  parentEmail: string;
  enrollmentId: number;
  schoolId: number;
  creditId?: number;
  holdSessionId?: string;
}

export async function setupAutoPayScenario(scenario: string): Promise<AutoPayScenario> {
  const res = await fetch(`${BASE_URL}/api/test/setup-auto-pay-scenario`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) throw new Error(`setup-auto-pay-scenario failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as AutoPayScenario & { success: boolean };
  return json;
}

export interface ScheduledPaymentRecord {
  id: number;
  status: string;
  retryCount: number | null;
  amount: number;
  enrollmentId: number;
  parentEmail: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  failureReason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function getScheduledPayment(id: number): Promise<ScheduledPaymentRecord> {
  const res = await fetch(`${BASE_URL}/api/test/scheduled-payment/${id}`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`scheduled-payment failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { success: boolean; payment: ScheduledPaymentRecord };
  return json.payment;
}

export interface MultiEnrollmentScenario {
  parent: { email: string; password: string; id: number };
  school: { id: number; name: string; registrationCode: string };
  enrollments: Array<{
    id: number;
    childId: number;
    childName: string;
    classId: number;
    className: string;
    totalCost: number;
    remainingBalance: number;
  }>;
}

export async function setupMultiEnrollmentScenario(): Promise<MultiEnrollmentScenario> {
  const res = await fetch(`${BASE_URL}/api/test/setup-multi-enrollment-cart-scenario`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`setup-multi-enrollment-cart-scenario failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { success: boolean; data: MultiEnrollmentScenario };
  return json.data;
}

export interface PaymentRecord {
  id: number;
  amount: number;
  status: string;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  originalPaymentId: number | null;
  parentEmail: string;
  enrollmentIds: number[] | null;
}

export async function getPaymentByStripeId(stripeId: string): Promise<PaymentRecord | null> {
  const res = await fetch(`${BASE_URL}/api/test/payment-by-stripe-id/${stripeId}`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`payment-by-stripe-id failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as PaymentRecord | null;
}

export interface PaidEnrollmentSeed {
  parent: { id: number; email: string };
  school: { id: number; name: string };
  enrollment: {
    id: number;
    totalCost: number;
    totalPaid: number;
    remainingBalance: number;
  };
  payment: {
    id: number;
    stripePaymentIntentId: string;
    amount: number;
  };
}

export async function seedPaidEnrollmentWithPayment(): Promise<PaidEnrollmentSeed> {
  const res = await fetch(`${BASE_URL}/api/test/seed-paid-enrollment-with-payment`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`seed-paid-enrollment-with-payment failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { success: boolean; data: PaidEnrollmentSeed };
  return json.data;
}

export async function getRefundPaymentFor(originalPaymentId: number): Promise<PaymentRecord | null> {
  const res = await fetch(`${BASE_URL}/api/test/refund-payment-for/${originalPaymentId}`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`refund-payment-for failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as PaymentRecord | null;
}

export const TEST_BASE_URL = BASE_URL;
export const TEST_HEADERS = HEADERS;
