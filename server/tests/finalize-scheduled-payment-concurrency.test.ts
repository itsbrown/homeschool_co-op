/**
 * Webhook, client fulfill, post-payment verify, and the missed-PI sweep can all finalize the same
 * scheduled-payment PI at once. Only one may credit enrollments (Hutchins Fall 2026: a $450
 * installment landed twice on three seats, so Pay in full later undercharged by $450).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type Row = Record<string, any>;

const state: {
  scheduled: Map<number, Row>;
  enrollments: Map<number, Row>;
  payments: Row[];
} = { scheduled: new Map(), enrollments: new Map(), payments: [] };

const tick = () => new Promise((resolve) => setImmediate(resolve));

const mockStorage = {
  getScheduledPaymentById: jest.fn(async (id: number) => {
    await tick();
    const row = state.scheduled.get(id);
    return row ? { ...row } : undefined;
  }),
  getScheduledPaymentsByParentEmail: jest.fn(async () => [...state.scheduled.values()]),
  getPaymentByStripeId: jest.fn(async (piId: string) => {
    await tick();
    return state.payments.find((p) => p.stripePaymentIntentId === piId);
  }),
  completeScheduledPaymentIfOpen: jest.fn(async (id: number, completionSource: string) => {
    const row = state.scheduled.get(id);
    if (!row || row.status === 'completed') return undefined;
    Object.assign(row, { status: 'completed', completionSource, processedAt: new Date() });
    return { ...row };
  }),
  updateScheduledPayment: jest.fn(async (id: number, patch: Row) => {
    const row = state.scheduled.get(id);
    if (row) Object.assign(row, patch);
    return row;
  }),
  getProgramEnrollmentById: jest.fn(async (id: number) => {
    await tick();
    const row = state.enrollments.get(id);
    return row ? { ...row } : undefined;
  }),
  updateProgramEnrollment: jest.fn(async (id: number, patch: Row) => {
    await tick();
    const row = state.enrollments.get(id);
    if (row) Object.assign(row, patch);
    return row;
  }),
  getUserByEmail: jest.fn(async () => ({ id: 47, name: 'Parent', schoolId: 2 })),
  createPayment: jest.fn(async (payment: Row) => {
    await tick();
    if (state.payments.some((p) => p.stripePaymentIntentId === payment.stripePaymentIntentId)) {
      throw new Error('duplicate key value violates unique constraint "payments_stripe_payment_intent_id_key"');
    }
    const created = { ...payment, id: state.payments.length + 1 };
    state.payments.push(created);
    return created;
  }),
};

jest.mock('../storage', () => ({ storage: mockStorage }));
jest.mock('../lib/email-service', () => ({ sendPaymentReceipt: jest.fn(async () => true) }));
jest.mock('../services/receiptService', () => ({ createReceiptFromPayment: jest.fn(async () => undefined) }));
jest.mock('../services/dataLayer', () => ({
  dataLayer: {
    broadcastBillingUpdate: jest.fn(),
    broadcastPaymentComplete: jest.fn(),
    refreshUserData: jest.fn(async () => undefined),
  },
}));
jest.mock('../lib/ensure-scheduled-payment-credits-consumed', () => ({
  ensureScheduledPaymentCreditsConsumed: jest.fn(async () => ({ consumedCents: 0, skippedAlreadyApplied: true })),
}));
jest.mock('../api/billing', () => ({
  splitCentsEvenly: (total: number, n: number) => {
    const base = Math.floor(total / n);
    const rem = total % n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  },
}));

import { finalizeSucceededScheduledPaymentIntent } from '../lib/finalize-succeeded-scheduled-payment-intent';

const SEAT_IDS = [719, 720, 727];

function seed() {
  state.scheduled = new Map([
    [
      731,
      {
        id: 731,
        schoolId: 2,
        enrollmentId: 719,
        parentId: 47,
        parentEmail: 'parent@test.com',
        amount: 45000,
        installmentNumber: 3,
        totalInstallments: 7,
        status: 'processing',
        processedAt: null,
        completionSource: null,
        metadata: { enrollmentIds: SEAT_IDS },
      },
    ],
  ]);
  state.enrollments = new Map(
    SEAT_IDS.map((id) => [
      id,
      { id, childName: `Child ${id}`, className: 'Fall Half Day', totalCost: 105000, totalPaid: 30000 },
    ]),
  );
  state.payments = [];
}

const paymentIntent = {
  id: 'pi_inst3',
  amount: 45000,
  currency: 'usd',
  status: 'succeeded',
  metadata: {
    paymentType: 'scheduled_payment',
    scheduledPaymentId: '731',
    parentEmail: 'parent@test.com',
    enrollmentIds: JSON.stringify(SEAT_IDS),
    installmentNumber: '3',
    totalInstallments: '7',
    autoPayInitiated: 'false',
  },
} as any;

describe('finalizeSucceededScheduledPaymentIntent concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seed();
  });

  it('credits enrollments once when three finalizers race on the same PI', async () => {
    const results = await Promise.all([
      finalizeSucceededScheduledPaymentIntent(paymentIntent, { skipReceiptEmail: true, skipRealtimeRefresh: true }),
      finalizeSucceededScheduledPaymentIntent(paymentIntent, { skipReceiptEmail: true, skipRealtimeRefresh: true }),
      finalizeSucceededScheduledPaymentIntent(paymentIntent, { skipReceiptEmail: true, skipRealtimeRefresh: true }),
    ]);

    expect(results.filter((r) => !r.skippedDuplicate)).toHaveLength(1);
    expect(results.filter((r) => r.skippedDuplicate)).toHaveLength(2);
    for (const id of SEAT_IDS) {
      expect(state.enrollments.get(id)!.totalPaid).toBe(45000);
    }
    expect(state.payments).toHaveLength(1);
    expect(state.scheduled.get(731)!.status).toBe('completed');
  });

  it('does not re-credit when a finalizer holds a stale pre-completion read of the installment', async () => {
    const staleSnapshot = { ...state.scheduled.get(731)! };
    await finalizeSucceededScheduledPaymentIntent(paymentIntent, { skipReceiptEmail: true, skipRealtimeRefresh: true });
    mockStorage.getScheduledPaymentById.mockResolvedValueOnce(staleSnapshot);

    const late = await finalizeSucceededScheduledPaymentIntent(paymentIntent, {
      skipReceiptEmail: true,
      skipRealtimeRefresh: true,
    });

    expect(late.skippedDuplicate).toBe(true);
    for (const id of SEAT_IDS) {
      expect(state.enrollments.get(id)!.totalPaid).toBe(45000);
    }
  });

  it('webhook replay after completion is a no-op', async () => {
    await finalizeSucceededScheduledPaymentIntent(paymentIntent, { skipReceiptEmail: true, skipRealtimeRefresh: true });
    const replay = await finalizeSucceededScheduledPaymentIntent(paymentIntent, {
      skipReceiptEmail: true,
      skipRealtimeRefresh: true,
    });

    expect(replay.skippedDuplicate).toBe(true);
    expect(replay.paymentId).toBe(1);
    for (const id of SEAT_IDS) {
      expect(state.enrollments.get(id)!.totalPaid).toBe(45000);
    }
  });

  it('reopens the installment when the payment row cannot be written', async () => {
    mockStorage.createPayment.mockRejectedValueOnce(new Error('db down'));

    await expect(
      finalizeSucceededScheduledPaymentIntent(paymentIntent, { skipReceiptEmail: true, skipRealtimeRefresh: true }),
    ).rejects.toThrow('db down');

    expect(state.scheduled.get(731)!.status).toBe('processing');
    for (const id of SEAT_IDS) {
      expect(state.enrollments.get(id)!.totalPaid).toBe(30000);
    }

    const retry = await finalizeSucceededScheduledPaymentIntent(paymentIntent, {
      skipReceiptEmail: true,
      skipRealtimeRefresh: true,
    });
    expect(retry.skippedDuplicate).toBe(false);
    for (const id of SEAT_IDS) {
      expect(state.enrollments.get(id)!.totalPaid).toBe(45000);
    }
  });
});
