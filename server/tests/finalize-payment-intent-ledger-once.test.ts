/**
 * Client fulfill (primary) and the webhook (backup) both finalize every checkout PI. The class-pool
 * credit caps at owed, which only protects pay-in-full: an installment seat still owes after the
 * first charge, so a second finalize credited it again (Fall 2026: Karnath, Bochno, Hutchins, …).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type Row = Record<string, any>;

let payments: Row[] = [];
const tick = () => new Promise((resolve) => setImmediate(resolve));

const mockApplyClassPool = jest.fn(async () => {
  await tick();
  return { enrollmentIds: [844, 845], appliedCents: 75000, skippedCents: 0, classPoolCents: 75000 };
});

const mockStorage = {
  getPaymentByStripeId: jest.fn(async (piId: string) => {
    await tick();
    const row = payments.find((p) => p.stripePaymentIntentId === piId);
    return row ? { ...row } : undefined;
  }),
  createPayment: jest.fn(async (payment: Row) => {
    await tick();
    if (payments.some((p) => p.stripePaymentIntentId === payment.stripePaymentIntentId)) {
      throw new Error('duplicate key value violates unique constraint "payments_stripe_payment_intent_id_key"');
    }
    const created = { ...payment, id: payments.length + 1, enrollmentLedgerAppliedAt: null };
    payments.push(created);
    return { ...created };
  }),
  updatePayment: jest.fn(async (id: number, patch: Row) => {
    const row = payments.find((p) => p.id === id);
    if (row) Object.assign(row, patch);
    return row;
  }),
  claimPaymentEnrollmentLedger: jest.fn(async (piId: string) => {
    const row = payments.find((p) => p.stripePaymentIntentId === piId);
    if (!row || row.enrollmentLedgerAppliedAt) return false;
    row.enrollmentLedgerAppliedAt = new Date();
    return true;
  }),
  releasePaymentEnrollmentLedgerClaim: jest.fn(async (piId: string) => {
    const row = payments.find((p) => p.stripePaymentIntentId === piId);
    if (row) row.enrollmentLedgerAppliedAt = null;
  }),
  getProgramEnrollmentById: jest.fn(async (id: number) => ({
    id,
    schoolId: 2,
    childName: `Child ${id}`,
    className: 'Fall Full Day',
    totalCost: 150000,
    totalPaid: 0,
  })),
  getUserByEmail: jest.fn(async () => ({ id: 85, schoolId: 2, name: 'Parent' })),
  getStripePaymentByIntentId: jest.fn(async () => ({ id: 1 })),
};

jest.mock('../storage', () => ({ storage: mockStorage }));
jest.mock('../config/stripe', () => ({ getStripeClient: jest.fn() }));
jest.mock('../db', () => ({ getDb: jest.fn() }));
jest.mock('../services/dataLayer', () => ({ dataLayer: { refreshUserData: jest.fn(async () => undefined) } }));
jest.mock('../lib/email-service', () => ({ sendPaymentConfirmationEmail: jest.fn(async () => false) }));
jest.mock('../lib/resolve-membership-reserve-for-payment', () => ({
  resolveMembershipReserveForPaymentIntent: jest.fn(async () => null),
}));
jest.mock('../lib/cancel-pending-scheduled-after-payoff', () => ({
  cancelPendingScheduledAfterEnrollmentPayoff: jest.fn(async () => undefined),
}));
jest.mock('../services/stripe-payment-plans', () => ({ StripePaymentPlanService: jest.fn() }));
jest.mock('../lib/apply-class-pool-to-enrollments', () => ({
  applyClassPoolToEnrollments: (...args: unknown[]) => mockApplyClassPool(...(args as [])),
}));
jest.mock('../services/membership-fulfill-from-cart-intent', () => ({
  applyMembershipFulfillmentFromCartPaymentIntent: jest.fn(async () => null),
}));
jest.mock('../lib/persist-payment-allocation-breakdown', () => ({
  persistPaymentAllocationBreakdown: jest.fn(async () => undefined),
}));

import { finalizeSucceededPaymentIntent } from '../lib/finalize-succeeded-payment-intent';

const firstInstallmentPi = {
  id: 'pi_first_installment',
  status: 'succeeded',
  amount: 75000,
  currency: 'usd',
  metadata: {
    paymentType: 'balance_payment',
    parentEmail: 'parent@test.com',
    enrollmentIds: JSON.stringify([844, 845]),
    paymentPlan: 'biweekly',
  },
} as any;

const opts = { skipConfirmationEmail: true, skipRealtimeRefresh: true, persistScheduledPayments: false };

describe('finalizeSucceededPaymentIntent enrollment ledger applies once per PI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    payments = [];
  });

  it('client fulfill then webhook replay credits seats once', async () => {
    const first = await finalizeSucceededPaymentIntent(firstInstallmentPi, undefined, opts);
    const replay = await finalizeSucceededPaymentIntent(firstInstallmentPi, undefined, opts);

    expect(mockApplyClassPool).toHaveBeenCalledTimes(1);
    expect(first.appliedCents).toBe(75000);
    expect(replay.appliedCents).toBe(0);
    expect(payments).toHaveLength(1);
  });

  it('concurrent finalizers on an existing pending row credit seats once', async () => {
    payments.push({
      id: 1,
      stripePaymentIntentId: firstInstallmentPi.id,
      status: 'pending',
      metadata: {},
      enrollmentLedgerAppliedAt: null,
    });

    await Promise.all([
      finalizeSucceededPaymentIntent(firstInstallmentPi, undefined, opts),
      finalizeSucceededPaymentIntent(firstInstallmentPi, undefined, opts),
      finalizeSucceededPaymentIntent(firstInstallmentPi, undefined, opts),
    ]);

    expect(mockApplyClassPool).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when the credit itself fails so a replay can apply it', async () => {
    mockApplyClassPool.mockRejectedValueOnce(new Error('db down'));

    await expect(finalizeSucceededPaymentIntent(firstInstallmentPi, undefined, opts)).rejects.toThrow('db down');
    expect(payments[0].enrollmentLedgerAppliedAt).toBeNull();

    const retry = await finalizeSucceededPaymentIntent(firstInstallmentPi, undefined, opts);
    expect(retry.appliedCents).toBe(75000);
    expect(mockApplyClassPool).toHaveBeenCalledTimes(2);
  });
});
