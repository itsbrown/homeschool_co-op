import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { api } from '../../helpers/apiHelpers';
import { testDb } from '../../helpers/testDatabase';

const mockCreateEducationalPaymentPlan = jest.fn();
let mockStripePaymentIntentsCreate: jest.Mock;
let mockSupabaseGetUser: jest.Mock;

jest.mock('../../../services/stripe-payment-plans', () => ({
  StripePaymentPlanService: jest.fn().mockImplementation(() => ({
    createEducationalPaymentPlan: mockCreateEducationalPaymentPlan,
  })),
}));

jest.mock('../../../config/stripe', () => ({
  getStripeClient: jest.fn(async () => ({
    paymentIntents: {
      create: (...args: any[]) => mockStripePaymentIntentsCreate(...args),
    },
  })),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: (...args: any[]) => mockSupabaseGetUser(...args),
    },
  })),
}));

describe('Integration: Canonical amount enforcement', () => {
  let parentUser: any;
  let school: any;
  let child: any;
  let klass: any;
  let billingApp: express.Express;
  let enrollmentForBilling: any;

  beforeAll(async () => {
    mockStripePaymentIntentsCreate = jest.fn();
    mockSupabaseGetUser = jest.fn();
    const billingRouter = (await import('../../../api/billing')).default;
    billingApp = express();
    billingApp.use(express.json());
    billingApp.use('/api/billing', billingRouter);
    await api.init();
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    mockCreateEducationalPaymentPlan.mockReset();
    mockStripePaymentIntentsCreate.mockReset();
    mockSupabaseGetUser.mockReset();
    mockCreateEducationalPaymentPlan.mockResolvedValue({
      paymentIntent: {
        id: 'pi_canonical_amount_test',
        client_secret: 'pi_canonical_amount_test_secret',
      },
      scheduledPayments: [],
    });
    mockStripePaymentIntentsCreate.mockResolvedValue({
      id: 'pi_billing_cross_check',
      client_secret: 'pi_billing_cross_check_secret',
    });

    const admin = await testDb.createTestUser({
      email: 'canonical-admin@test.com',
      role: 'schoolAdmin',
      firstName: 'Canonical',
      lastName: 'Admin',
    });

    school = await testDb.createTestSchool(admin.id, {
      name: 'Canonical Amount School',
      registrationCode: 'CANONICAL123',
      membershipFeeAmount: 17500,
    });

    parentUser = await testDb.createTestUser({
      email: 'canonical-parent@test.com',
      role: 'parent',
      firstName: 'Canonical',
      lastName: 'Parent',
      schoolId: school.id,
    });

    child = await testDb.createTestChild(parentUser.id, {
      firstName: 'Amount',
      lastName: 'Child',
      schoolId: school.id,
      dateOfBirth: new Date('2016-01-01'),
    });

    klass = await testDb.createTestClass(school.id, {
      name: 'Canonical Math',
      description: 'Amount source of truth test class',
      price: 12345,
    });

    enrollmentForBilling = await testDb.createTestEnrollment(klass.id, child.id, {
      schoolId: school.id,
      parentId: parentUser.id,
      parentEmail: parentUser.email,
      childName: `${child.firstName} ${child.lastName}`,
      className: klass.title,
      status: 'pending_payment',
      totalCost: 12345,
      totalPaid: 0,
      remainingBalance: 12345,
    });

    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { email: parentUser.email } },
      error: null,
    });

    await api.loginAsUser(parentUser.email);
  });

  function baseCartPayload() {
    return {
      items: [
        {
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: klass.id,
          className: klass.name,
          classType: 'school',
          price: 12345,
        },
      ],
      subtotal: 12345,
      discounts: [],
      parentEmail: parentUser.email,
      paymentPlan: 'full',
      paymentFrequency: 'one_time',
    };
  }

  function totalAmountPassedToPlanService(): number {
    const firstCall = mockCreateEducationalPaymentPlan.mock.calls[0];
    expect(firstCall).toBeDefined();
    return firstCall[0].totalAmount;
  }

  function billingAmountPassedToStripe(): number {
    const firstCall = mockStripePaymentIntentsCreate.mock.calls[0];
    expect(firstCall).toBeDefined();
    return firstCall[0].amount;
  }

  function hasClientTotalMismatchWarning(consoleWarnSpy: jest.SpiedFunction<typeof console.warn>): boolean {
    return consoleWarnSpy.mock.calls.some((call) =>
      typeof call[0] === 'string' &&
      call[0].includes('Client total mismatch ignored in favor of server-computed amount')
    );
  }

  it('uses the same authoritative amount when client total matches', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 12345,
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(false);

    consoleWarnSpy.mockRestore();
  });

  it('ignores mismatched client total and charges server-derived amount', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 999,
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('handles malformed client total without letting it control charge amount', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 'abc',
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('handles absent client total and still charges server-derived amount', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = baseCartPayload();

    const response = await api.post('/api/stripe/create-payment-intent', payload);

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(false);

    consoleWarnSpy.mockRestore();
  });

  it('uses server-derived sum for multi-item carts when client total is mismatched', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const secondClass = await testDb.createTestClass(school.id, {
      name: 'Canonical Science',
      description: 'Second class for multi-item amount authority',
      price: 2000,
    });

    const response = await api.post('/api/stripe/create-payment-intent', {
      items: [
        {
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: klass.id,
          className: klass.name,
          classType: 'school',
          price: 12345,
        },
        {
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: secondClass.id,
          className: secondClass.name,
          classType: 'school',
          price: 2000,
        },
      ],
      subtotal: 14345,
      total: 50, // Deliberately wrong client total
      discounts: [],
      parentEmail: parentUser.email,
      paymentPlan: 'full',
      paymentFrequency: 'one_time',
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(14345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('uses server-derived enrollment + membership total when client total is mismatched', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 1, // Deliberately wrong client total
      membership: {
        amount: 17500,
        schoolId: school.id,
        year: new Date().getFullYear(),
      },
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345 + 17500);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('keeps checkout and billing server-authoritative totals consistent for the same class amount', async () => {
    const checkoutResponse = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 1,
    });

    expect(checkoutResponse.status).toBe(200);
    const checkoutAuthoritativeAmount = totalAmountPassedToPlanService();

    const billingResponse = await request(billingApp)
      .post('/api/billing/pay-balance')
      .set({ Authorization: 'Bearer test-token' })
      .send({
        enrollmentIds: [enrollmentForBilling.id],
        paymentPlan: 'full',
        amount: 12345,
        total: 12345,
      });

    expect(billingResponse.status).toBe(200);
    const billingAuthoritativeAmount = billingAmountPassedToStripe();

    expect(checkoutAuthoritativeAmount).toBe(12345);
    expect(billingAuthoritativeAmount).toBe(12345);
    expect(billingAuthoritativeAmount).toBe(checkoutAuthoritativeAmount);
  });

  it('returns 401 with error payload when checkout request is unauthenticated', async () => {
    api.clearAuth();

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      total: 12345,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    );
    expect(mockCreateEducationalPaymentPlan).not.toHaveBeenCalled();
  });

  it('ignores tampered line-item price and uses server class amount authority', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      items: [
        {
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          classId: klass.id,
          className: klass.name,
          classType: 'school',
          price: 1, // Deliberately tampered client line-item price
        },
      ],
      subtotal: 1,
      total: 1,
    });

    expect(response.status).toBe(200);
    expect(totalAmountPassedToPlanService()).toBe(12345);
    expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('returns 400 with error payload for structurally invalid checkout request after auth', async () => {
    const response = await api.post('/api/stripe/create-payment-intent', {
      ...baseCartPayload(),
      items: [],
      total: 12345,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    );
    expect(mockCreateEducationalPaymentPlan).not.toHaveBeenCalled();
  });

  it('preserves supported payment-plan policy with server-authoritative totals under tampered client total', async () => {
    const plans: Array<{ paymentPlan: string; paymentFrequency: string }> = [
      { paymentPlan: 'full', paymentFrequency: 'one_time' },
      { paymentPlan: 'deposit', paymentFrequency: 'one_time' },
      { paymentPlan: 'split', paymentFrequency: 'one_time' },
      { paymentPlan: 'biweekly', paymentFrequency: 'biweekly' },
    ];

    for (const plan of plans) {
      mockCreateEducationalPaymentPlan.mockClear();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const response = await api.post('/api/stripe/create-payment-intent', {
        ...baseCartPayload(),
        paymentPlan: plan.paymentPlan,
        paymentFrequency: plan.paymentFrequency,
        total: 1, // Deliberately tampered client total
      });

      expect(response.status).toBe(200);
      expect(totalAmountPassedToPlanService()).toBe(12345);
      expect(hasClientTotalMismatchWarning(consoleWarnSpy)).toBe(true);

      const firstCall = mockCreateEducationalPaymentPlan.mock.calls[0];
      expect(firstCall[0].paymentPlan).toBe(plan.paymentPlan);
      expect(firstCall[0].paymentFrequency).toBe(plan.paymentFrequency);

      consoleWarnSpy.mockRestore();
    }
  });
});
