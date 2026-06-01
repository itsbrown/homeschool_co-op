import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type Stripe from 'stripe';
import { storage } from '../storage';
import {
  computeOverallStatus,
  parseEnrollmentIdsFromPaymentIntent,
  verifyPaymentIntent,
} from '../services/post-payment-verification';

describe('post-payment-verification', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('parseEnrollmentIds merges metadata and payment row', () => {
    const pi = {
      metadata: {
        enrollmentIds: '[420,421]',
        itemsJson: JSON.stringify([{ enrollmentId: 999 }]),
      },
    } as unknown as Stripe.PaymentIntent;
    const ids = parseEnrollmentIdsFromPaymentIntent(pi, {
      enrollmentIds: [421, 422],
    } as any);
    expect(ids).toEqual([420, 421, 422, 999]);
  });

  it('computeOverallStatus escalates critical over warning', () => {
    expect(
      computeOverallStatus([
        { key: 'a', severity: 'info', message: 'ok' },
        { key: 'b', severity: 'warning', message: 'warn' },
      ]),
    ).toBe('warning');
    expect(
      computeOverallStatus([
        { key: 'a', severity: 'warning', message: 'warn' },
        { key: 'b', severity: 'critical', message: 'bad' },
      ]),
    ).toBe('critical');
  });

  it('flags missing payments row for succeeded PI', async () => {
    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue(undefined);
    const pi = {
      id: 'pi_test_missing',
      status: 'succeeded',
      amount: 60000,
      metadata: { enrollmentIds: '[1]' },
    } as Stripe.PaymentIntent;

    const result = await verifyPaymentIntent(pi, { dbLookupAttempts: 1, dbLookupDelayMs: 0 });
    expect(result.overallStatus).toBe('critical');
    expect(result.checks.some((c) => c.key === 'stripe_db_parity')).toBe(true);
  });

  it('passes pay-in-full when enrollments have zero outstanding', async () => {
    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue({
      id: 1,
      amount: 60000,
      status: 'completed',
      schoolId: 2,
      parentId: 31,
      enrollmentIds: [420, 421],
    } as any);
    jest.spyOn(storage, 'getProgramEnrollmentById').mockImplementation(async (id: number) =>
      ({
        id,
        schoolId: 2,
        parentId: 31,
        totalCost: 90000,
        totalPaid: 90000,
        compAmountCents: 0,
        effectiveBalance: 0,
      }) as any,
    );
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByCheckoutPaymentIntentId').mockResolvedValue([]);

    const pi = {
      id: 'pi_test_ok',
      status: 'succeeded',
      amount: 60000,
      metadata: {
        enrollmentIds: '[420,421]',
        paymentPlan: 'full',
        paymentFrequency: 'one_time',
        installmentNumber: '1',
        totalInstallments: '1',
      },
    } as Stripe.PaymentIntent;

    const result = await verifyPaymentIntent(pi, { dbLookupAttempts: 1, dbLookupDelayMs: 0 });
    expect(result.overallStatus).toBe('pass');
  });

  it('flags pay-in-full with remaining balance on enrollments', async () => {
    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue({
      id: 1,
      amount: 60000,
      status: 'completed',
      enrollmentIds: [420],
    } as any);
    jest.spyOn(storage, 'getProgramEnrollmentById').mockResolvedValue({
      id: 420,
      totalCost: 90000,
      totalPaid: 60000,
      compAmountCents: 0,
      effectiveBalance: 30000,
    } as any);
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByCheckoutPaymentIntentId').mockResolvedValue([]);

    const pi = {
      id: 'pi_test_owed',
      status: 'succeeded',
      amount: 60000,
      metadata: {
        enrollmentIds: '[420]',
        paymentPlan: 'full',
        paymentFrequency: 'one_time',
      },
    } as Stripe.PaymentIntent;

    const result = await verifyPaymentIntent(pi, { dbLookupAttempts: 1, dbLookupDelayMs: 0 });
    expect(result.overallStatus).toBe('critical');
    expect(result.checks.some((c) => c.key === 'enrollment_ledger')).toBe(true);
  });
});
