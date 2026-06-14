/**
 * Interactive fulfillment (POST /api/billing/fulfill-payment-intent) is the primary
 * path when Stripe webhooks are unavailable (e.g. Replit dev without stripe listen).
 * Webhook replay remains the backup. Both delegate to finalizeSucceededPaymentIntent.
 */

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { describeIntegration } from '../helpers/integrationDb';
import { testDb } from '../helpers/testDatabase';
import { mockStripeConstructEventParsesBody } from '../helpers/stripeWebhookTestMock';
import { storage } from '../../storage';

var mockConstructEvent = jest.fn();
var mockGetStripeClient = jest.fn();
var mockPaymentIntentsRetrieve = jest.fn();
var mockSupabaseGetUser = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockSupabaseGetUser,
    },
  })),
}));

jest.mock('../../services/dataLayer', () => ({
  dataLayer: {
    refreshUserData: jest.fn(async () => undefined),
  },
}));

jest.mock('../../lib/email-service', () => ({
  sendPaymentConfirmationEmail: jest.fn(async () => false),
  sendPaymentReceipt: jest.fn(async () => false),
}));

import { webhookHandler } from '../../webhook-handler';

describeIntegration('Integration: fulfill-payment-intent (interactive primary path)', () => {
  const fulfillEndpoint = '/api/billing/fulfill-payment-intent';
  const webhookEndpoint = '/api/stripe/webhook';
  const authHeader = { Authorization: 'Bearer test-parent-token' };

  let billingApp: express.Express;
  let webhookApp: express.Express;

  beforeEach(async () => {
    await testDb.cleanup();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.STRIPE_WEBHOOK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'test';

    mockConstructEvent.mockReset();
    mockStripeConstructEventParsesBody(mockConstructEvent);
    mockPaymentIntentsRetrieve.mockReset();
    mockGetStripeClient.mockReset();
    mockSupabaseGetUser.mockReset();

    mockGetStripeClient.mockResolvedValue({
      webhooks: { constructEvent: mockConstructEvent },
      paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
    });

    const billingRouter = (await import('../../api/billing')).default;
    billingApp = express();
    billingApp.use(express.json());
    billingApp.use('/api/billing', billingRouter);

    webhookApp = express();
    webhookApp.post(webhookEndpoint, express.raw({ type: 'application/json' }), webhookHandler);
  });

  async function setupPendingBalanceFixture() {
    const admin = await testDb.createTestUser({
      email: 'fulfill-admin@test.com',
      role: 'schoolAdmin',
    });
    const school = await testDb.createTestSchool(admin.id, { name: 'Fulfill School' });
    const category = await testDb.createTestCategory(school.id, { name: 'Fulfill Category' });
    const parent = await testDb.createTestUser({
      email: 'fulfill-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Fulfill',
      lastName: 'Child',
      schoolId: school.id,
    });
    const klass = await testDb.createTestClass(school.id, {
      name: 'Fulfill Class',
      price: 10000,
      category: category.name,
      categoryId: category.id,
    });

    const enrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: klass.title,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 10000,
      totalPaid: 0,
      remainingBalance: 10000,
      paymentStatus: 'pending',
      status: 'pending_payment',
    } as any);

    await storage.createPayment({
      schoolId: school.id,
      parentId: parent.id,
      parentEmail: parent.email,
      childName: enrollment.childName,
      className: enrollment.className,
      description: 'Pending pay-in-full',
      amount: 10000,
      currency: 'usd',
      status: 'pending',
      stripePaymentIntentId: 'pi_fulfill_no_webhook',
      paymentMethod: 'stripe',
      enrollmentIds: [enrollment.id],
      metadata: {},
      paymentDate: null,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
    } as any);

    const paymentIntentObject = {
      id: 'pi_fulfill_no_webhook',
      status: 'succeeded',
      amount: 10000,
      currency: 'usd',
      metadata: {
        paymentType: 'balance_payment',
        parentEmail: parent.email,
        enrollmentIds: JSON.stringify([enrollment.id]),
        paymentPlan: 'full',
      },
    };

    mockPaymentIntentsRetrieve.mockResolvedValue(paymentIntentObject);
    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { id: 'supabase-fulfill-parent', email: parent.email } },
      error: null,
    });

    return { parent, enrollment, paymentIntentObject };
  }

  it('POST /api/billing/fulfill-payment-intent clears balance without webhook (Replit dev path)', async () => {
    const { parent, enrollment, paymentIntentObject } = await setupPendingBalanceFixture();

    const before = await storage.getProgramEnrollmentById(enrollment.id);
    expect(before?.remainingBalance).toBe(10000);
    expect(before?.totalPaid).toBe(0);

    const response = await request(billingApp)
      .post(fulfillEndpoint)
      .set(authHeader)
      .send({ paymentIntentId: paymentIntentObject.id });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.appliedCents).toBeGreaterThan(0);

    const after = await storage.getProgramEnrollmentById(enrollment.id);
    expect(after?.totalPaid).toBe(10000);
    expect(after?.remainingBalance).toBe(0);

    const payments = await storage.getAllPayments();
    const paymentRows = payments.filter(
      (p: any) => p.stripePaymentIntentId === paymentIntentObject.id,
    );
    expect(paymentRows).toHaveLength(1);
    expect(['succeeded', 'completed']).toContain(paymentRows[0].status);

    expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith(paymentIntentObject.id);
    expect(parent.email).toBeTruthy();
  });

  async function setupMembershipCartFixture() {
    const admin = await testDb.createTestUser({
      email: 'fulfill-mem-admin@test.com',
      role: 'schoolAdmin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: 'Fulfill Mem School',
      membershipFeeAmount: 2000,
      membershipRequired: true,
    });
    const category = await testDb.createTestCategory(school.id, { name: 'Mem Category' });
    const parent = await testDb.createTestUser({
      email: 'fulfill-mem-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Mem',
      lastName: 'Fulfill',
      schoolId: school.id,
    });
    const classA = await testDb.createTestClass(school.id, {
      name: 'Mem Class A',
      price: 6000,
      category: category.name,
      categoryId: category.id,
    });
    const classB = await testDb.createTestClass(school.id, {
      name: 'Mem Class B',
      price: 6000,
      category: category.name,
      categoryId: category.id,
    });

    const enrollmentA = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: classA.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: classA.title,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 6000,
      totalPaid: 0,
      remainingBalance: 6000,
      paymentStatus: 'pending',
      status: 'pending_payment',
    } as any);

    const enrollmentB = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: classB.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: classB.title,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 6000,
      totalPaid: 0,
      remainingBalance: 6000,
      paymentStatus: 'pending',
      status: 'pending_payment',
    } as any);

    const year = new Date().getFullYear();
    const paymentIntentId = 'pi_fulfill_mem_idempotent';

    await storage.createPayment({
      schoolId: school.id,
      parentId: parent.id,
      parentEmail: parent.email,
      childName: enrollmentA.childName,
      className: 'Multiple',
      description: 'Combined class + membership',
      amount: 14000,
      currency: 'usd',
      status: 'pending',
      stripePaymentIntentId: paymentIntentId,
      paymentMethod: 'stripe',
      enrollmentIds: [enrollmentA.id, enrollmentB.id],
      metadata: {},
      paymentDate: null,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
    } as any);

    const paymentIntentObject = {
      id: paymentIntentId,
      status: 'succeeded',
      amount: 14000,
      currency: 'usd',
      metadata: {
        paymentType: 'balance_payment',
        parentEmail: parent.email,
        enrollmentIds: JSON.stringify([enrollmentA.id, enrollmentB.id]),
        hasMembership: 'true',
        membershipAmount: '2000',
        membershipParentUserId: String(parent.id),
        membershipSchoolId: String(school.id),
        membershipYear: String(year),
        paymentPlan: 'full',
      },
    };

    mockPaymentIntentsRetrieve.mockResolvedValue(paymentIntentObject);
    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { id: 'supabase-fulfill-mem', email: parent.email } },
      error: null,
    });

    return {
      parent,
      school,
      year,
      enrollmentA,
      enrollmentB,
      paymentIntentObject,
    };
  }

  it('client fulfill then webhook replay does not double-apply membership', async () => {
    const { parent, school, year, enrollmentA, enrollmentB, paymentIntentObject } =
      await setupMembershipCartFixture();

    const fulfillRes = await request(billingApp)
      .post(fulfillEndpoint)
      .set(authHeader)
      .send({ paymentIntentId: paymentIntentObject.id });

    expect(fulfillRes.status).toBe(200);
    expect(fulfillRes.body.success).toBe(true);

    const membershipAfterFulfill = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parent.id,
      school.id,
      year,
    );
    expect(membershipAfterFulfill).toBeTruthy();
    expect(membershipAfterFulfill!.amountPaid).toBe(2000);
    expect(membershipAfterFulfill!.remainingBalance).toBe(0);

    const updatedA = await storage.getProgramEnrollmentById(enrollmentA.id);
    const updatedB = await storage.getProgramEnrollmentById(enrollmentB.id);
    expect(updatedA?.totalPaid).toBe(6000);
    expect(updatedB?.totalPaid).toBe(6000);

    const webhookRes = await request(webhookApp)
      .post(webhookEndpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_fulfill_mem_replay',
        type: 'payment_intent.succeeded',
        data: { object: paymentIntentObject },
      });

    expect(webhookRes.status).toBe(200);

    const membershipAfterWebhook = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parent.id,
      school.id,
      year,
    );
    expect(membershipAfterWebhook!.amountPaid).toBe(2000);
    expect(membershipAfterWebhook!.remainingBalance).toBe(0);

    const afterA = await storage.getProgramEnrollmentById(enrollmentA.id);
    const afterB = await storage.getProgramEnrollmentById(enrollmentB.id);
    expect(afterA?.totalPaid).toBe(6000);
    expect(afterB?.totalPaid).toBe(6000);

    const payments = await storage.getAllPayments();
    const paymentRows = payments.filter(
      (p: any) => p.stripePaymentIntentId === paymentIntentObject.id,
    );
    expect(paymentRows).toHaveLength(1);
  });

  it('re-applies membership when notes reference PI but ledger is still unpaid', async () => {
    const { parent, school, year, paymentIntentObject } = await setupMembershipCartFixture();

    await storage.createMembershipEnrollment({
      schoolId: school.id,
      parentUserId: parent.id,
      membershipYear: year,
      membershipTier: 'basic',
      amount: 2000,
      amountPaid: 0,
      remainingBalance: 2000,
      totalAmount: 2000,
      balanceDue: 2000,
      status: 'pending_payment',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      startDate: null,
      renewalDate: null,
      dueDate: new Date(),
      endDate: new Date(),
      expirationDate: new Date(),
      gracePeriodEnd: null,
      paymentMethod: 'other',
      notes: `Stripe payment via cart checkout (${paymentIntentObject.id})`,
    } as any);

    const fulfillRes = await request(billingApp)
      .post(fulfillEndpoint)
      .set(authHeader)
      .send({ paymentIntentId: paymentIntentObject.id });

    expect(fulfillRes.status).toBe(200);
    const membership = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parent.id,
      school.id,
      year,
    );
    expect(membership!.amountPaid).toBe(2000);
    expect(membership!.remainingBalance).toBe(0);
    expect(membership!.status).toBe('enrolled');
  });
});
