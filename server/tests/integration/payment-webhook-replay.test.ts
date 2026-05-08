import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { testDb } from '../helpers/testDatabase';
import { storage } from '../../storage';

const mockConstructEvent = jest.fn();
const mockGetStripeClient = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
}));

import { webhookHandler } from '../../webhook-handler';

describe('Integration: payment webhook replay idempotency', () => {
  const endpoint = '/api/stripe/webhook';

  beforeEach(async () => {
    await testDb.cleanup();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.STRIPE_WEBHOOK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'test';

    mockConstructEvent.mockReset();
    mockConstructEvent.mockImplementation(() => {
      throw new Error('force dev bypass path');
    });
    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue({
      webhooks: {
        constructEvent: mockConstructEvent,
      },
    });
  });

  function buildApp() {
    const app = express();
    app.post(endpoint, express.raw({ type: 'application/json' }), webhookHandler);
    return app;
  }

  async function setupPendingPaymentFixture() {
    const admin = await testDb.createTestUser({ email: 'webhook-admin@test.com', role: 'schoolAdmin' });
    const school = await testDb.createTestSchool(admin.id, { name: 'Webhook School' });
    const parent = await testDb.createTestUser({
      email: 'webhook-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Replay',
      lastName: 'Child',
      schoolId: school.id,
    });
    const klass = await testDb.createTestClass(school.id, { name: 'Replay Class', price: 10000 });

    const enrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: klass.name,
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
      description: 'Pre-existing pending pay all payment',
      amount: 10000,
      currency: 'usd',
      status: 'pending',
      stripePaymentIntentId: 'pi_pending_replay_1',
      paymentMethod: 'stripe',
      enrollmentIds: [enrollment.id],
      metadata: {},
      paymentDate: null,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
    } as any);

    return { parent, enrollment };
  }

  it('does not duplicate side effects when replay hits pre-existing pending payment', async () => {
    const app = buildApp();
    const { parent, enrollment } = await setupPendingPaymentFixture();

    const basePaymentIntentObject = {
      id: 'pi_pending_replay_1',
      amount: 10000,
      currency: 'usd',
      metadata: {
        paymentType: 'balance_payment',
        parentEmail: parent.email,
        enrollmentIds: JSON.stringify([enrollment.id]),
      },
    };

    const firstResponse = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_replay_1',
        type: 'payment_intent.succeeded',
        data: { object: basePaymentIntentObject },
      });

    expect(firstResponse.status).toBe(200);

    const secondResponse = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_replay_2',
        type: 'payment_intent.succeeded',
        data: { object: basePaymentIntentObject },
      });

    expect(secondResponse.status).toBe(200);

    const payments = await storage.getAllPayments();
    const paymentRowsForIntent = payments.filter((p: any) => p.stripePaymentIntentId === 'pi_pending_replay_1');
    expect(paymentRowsForIntent).toHaveLength(1);
    expect(['succeeded', 'completed']).toContain(paymentRowsForIntent[0].status);

    const updatedEnrollment = await storage.getProgramEnrollmentById(enrollment.id);
    expect(updatedEnrollment?.totalPaid).toBe(10000);
    expect(updatedEnrollment?.remainingBalance).toBe(0);
  });
});
