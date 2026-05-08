import { beforeAll, beforeEach, afterAll, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { testDb } from '../../helpers/testDatabase';
import { storage } from '../../../storage';

let mockStripePaymentIntentsCreate: jest.Mock;
let mockSupabaseGetUser: jest.Mock;

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

describe('Integration: Billing canonical amount enforcement', () => {
  let app: express.Express;
  let parent: any;
  let school: any;
  let enrollmentA: any;
  let enrollmentB: any;

  beforeAll(async () => {
    mockStripePaymentIntentsCreate = jest.fn();
    mockSupabaseGetUser = jest.fn();
    const billingRouter = (await import('../../../api/billing')).default;
    app = express();
    app.use(express.json());
    app.use('/api/billing', billingRouter);
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    mockStripePaymentIntentsCreate.mockReset();
    mockSupabaseGetUser.mockReset();

    mockStripePaymentIntentsCreate.mockResolvedValue({
      id: 'pi_billing_amount_test',
      client_secret: 'pi_billing_amount_test_secret',
    });

    const admin = await testDb.createTestUser({
      email: 'billing-admin@test.com',
      role: 'schoolAdmin',
      firstName: 'Billing',
      lastName: 'Admin',
    });

    school = await testDb.createTestSchool(admin.id, {
      name: 'Billing Canonical School',
      registrationCode: 'BILLING123',
    });

    parent = await testDb.createTestUser({
      email: 'billing-parent@test.com',
      role: 'parent',
      firstName: 'Billing',
      lastName: 'Parent',
      schoolId: school.id,
    });

    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Billing',
      lastName: 'Child',
      schoolId: school.id,
      dateOfBirth: new Date('2015-01-01'),
    });

    const classA = await testDb.createTestClass(school.id, {
      name: 'Billing Class A',
      description: 'Billing canonical class A',
      price: 10000,
    });

    const classB = await testDb.createTestClass(school.id, {
      name: 'Billing Class B',
      description: 'Billing canonical class B',
      price: 8000,
    });

    enrollmentA = await testDb.createTestEnrollment(classA.id, child.id, {
      schoolId: school.id,
      parentId: parent.id,
      parentEmail: parent.email,
      childName: `${child.firstName} ${child.lastName}`,
      className: classA.title,
      status: 'pending_payment',
      totalCost: 10000,
      totalPaid: 3000,
      remainingBalance: 7000,
    });

    enrollmentB = await testDb.createTestEnrollment(classB.id, child.id, {
      schoolId: school.id,
      parentId: parent.id,
      parentEmail: parent.email,
      childName: `${child.firstName} ${child.lastName}`,
      className: classB.title,
      status: 'pending_payment',
      totalCost: 8000,
      totalPaid: 5000,
      remainingBalance: 3000,
    });

    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { email: parent.email } },
      error: null,
    });
  });

  function authHeader(): Record<string, string> {
    return { Authorization: 'Bearer test-token' };
  }

  function stripeAmountCentsFromCall(startingCallCount: number): number {
    const nextCall = mockStripePaymentIntentsCreate.mock.calls[startingCallCount];
    expect(nextCall).toBeDefined();
    return nextCall[0].amount;
  }

  async function currentAuthoritativeAmountCents(enrollmentIds: number[]): Promise<number> {
    const enrollments = await Promise.all(
      enrollmentIds.map((id) => storage.getProgramEnrollmentById(id))
    );
    return enrollments.reduce((sum, enrollment: any) => {
      if (!enrollment) return sum;
      const totalCost = Number.isFinite(enrollment.totalCost) ? Number(enrollment.totalCost) : 0;
      const totalPaid = Number.isFinite(enrollment.totalPaid) ? Number(enrollment.totalPaid) : 0;
      const remaining = Number.isFinite(enrollment.remainingBalance)
        ? Number(enrollment.remainingBalance)
        : Math.max(0, totalCost - totalPaid);
      return sum + Math.max(0, Math.round(remaining));
    }, 0);
  }

  it('uses server-derived amount when client total matches', async () => {
    const initialCallCount = mockStripePaymentIntentsCreate.mock.calls.length;
    const expectedAmount = await currentAuthoritativeAmountCents([enrollmentA.id, enrollmentB.id]);
    const response = await request(app)
      .post('/api/billing/pay-balance')
      .set(authHeader())
      .send({
        enrollmentIds: [enrollmentA.id, enrollmentB.id],
        paymentPlan: 'full',
        amount: 10000,
      });

    expect(response.status).toBe(200);
    expect(stripeAmountCentsFromCall(initialCallCount)).toBe(expectedAmount);
  });

  it('ignores mismatched client total and charges server-derived amount', async () => {
    const initialCallCount = mockStripePaymentIntentsCreate.mock.calls.length;
    const expectedAmount = await currentAuthoritativeAmountCents([enrollmentA.id, enrollmentB.id]);
    const response = await request(app)
      .post('/api/billing/pay-balance')
      .set(authHeader())
      .send({
        enrollmentIds: [enrollmentA.id, enrollmentB.id],
        paymentPlan: 'full',
        amount: 1,
        total: 1,
      });

    expect(response.status).toBe(200);
    expect(stripeAmountCentsFromCall(initialCallCount)).toBe(expectedAmount);
  });

  it('ignores malformed client total values and charges server-derived amount', async () => {
    const initialCallCount = mockStripePaymentIntentsCreate.mock.calls.length;
    const expectedAmount = await currentAuthoritativeAmountCents([enrollmentA.id, enrollmentB.id]);
    const response = await request(app)
      .post('/api/billing/pay-balance')
      .set(authHeader())
      .send({
        enrollmentIds: [enrollmentA.id, enrollmentB.id],
        paymentPlan: 'full',
        amount: 'abc',
        total: 'not-a-number',
      });

    expect(response.status).toBe(200);
    expect(stripeAmountCentsFromCall(initialCallCount)).toBe(expectedAmount);
  });

  it('works when client total is absent and still charges server-derived amount', async () => {
    const initialCallCount = mockStripePaymentIntentsCreate.mock.calls.length;
    const expectedAmount = await currentAuthoritativeAmountCents([enrollmentA.id, enrollmentB.id]);
    const response = await request(app)
      .post('/api/billing/pay-balance')
      .set(authHeader())
      .send({
        enrollmentIds: [enrollmentA.id, enrollmentB.id],
        paymentPlan: 'full',
      });

    expect(response.status).toBe(200);
    expect(stripeAmountCentsFromCall(initialCallCount)).toBe(expectedAmount);
  });

  it('returns 403 before amount validation when enrollments are not owned by authenticated user', async () => {
    const otherParent = await testDb.createTestUser({
      email: 'billing-other-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });

    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { email: otherParent.email } },
      error: null,
    });

    const response = await request(app)
      .post('/api/billing/pay-balance')
      .set(authHeader())
      .send({
        enrollmentIds: [enrollmentA.id, enrollmentB.id],
        paymentPlan: 'full',
        total: 'not-a-number',
        amount: '12.34',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('not owned by this user');
    expect(mockStripePaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('returns 401 with error payload when authorization header is missing', async () => {
    const response = await request(app).post('/api/billing/pay-balance').send({
      enrollmentIds: [enrollmentA.id, enrollmentB.id],
      paymentPlan: 'full',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    );
    expect(mockStripePaymentIntentsCreate).not.toHaveBeenCalled();
  });
});
