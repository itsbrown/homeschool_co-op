import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nanoid } from 'nanoid';
import { describeIntegration } from '../helpers/integrationDb';
import { testDb } from '../helpers/testDatabase';
import { mockStripeConstructEventParsesBody } from '../helpers/stripeWebhookTestMock';
import { storage } from '../../storage';

const mockConstructEvent = jest.fn();
const mockGetStripeClient = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
}));

import { webhookHandler } from '../../webhook-handler';

/**
 * checkout.session.completed and payment_intent.succeeded often both fire for the same PI.
 * Payment history idempotency must prevent double application to enrollments.
 */
describeIntegration('Integration: checkout.session.completed then payment_intent.succeeded (same PI)', () => {
  const endpoint = '/api/stripe/webhook';

  beforeEach(async () => {
    await testDb.cleanup();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.STRIPE_WEBHOOK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'test';

    mockConstructEvent.mockReset();
    mockStripeConstructEventParsesBody(mockConstructEvent);
    mockPaymentIntentsRetrieve.mockReset();
    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue({
      webhooks: {
        constructEvent: mockConstructEvent,
      },
      paymentIntents: {
        retrieve: mockPaymentIntentsRetrieve,
      },
    });
  });

  function buildApp() {
    const app = express();
    app.post(endpoint, express.raw({ type: 'application/json' }), webhookHandler);
    return app;
  }

  it('applies cart payment once when PI success follows checkout session', async () => {
    const app = buildApp();
    const uid = nanoid(8).toLowerCase();
    const admin = await testDb.createTestUser({
      email: `dual_admin_${uid}@test.com`,
      role: 'schoolAdmin',
    });
    const school = await testDb.createTestSchool(admin.id, { name: `Dual Event School ${uid}` });
    const parent = await testDb.createTestUser({
      email: `dual_parent_${uid}@test.com`,
      role: 'parent',
      schoolId: school.id,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Dual',
      lastName: 'Pay',
      schoolId: school.id,
    });
    const klass = await testDb.createTestClass(school.id, { title: 'Dual Class', price: 10000 });

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

    const items = [
      {
        enrollmentId: enrollment.id,
        childId: child.id,
        childName: enrollment.childName,
        className: enrollment.className,
        classId: klass.id,
      },
    ];
    const itemsJson = JSON.stringify(items);

    const piId = `pi_dual_checkout_${uid}`;
    const piPayload = {
      id: piId,
      amount: 10000,
      currency: 'usd',
      metadata: {
        itemsJson,
        parentEmail: parent.email,
        paymentType: 'cart_checkout',
      },
    };

    mockPaymentIntentsRetrieve.mockResolvedValue(piPayload);

    const checkoutRes = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_checkout_session_dual_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_dual_1',
            payment_intent: piId,
          },
        },
      });

    expect(checkoutRes.status).toBe(200);

    const afterCheckout = await storage.getProgramEnrollmentById(enrollment.id);
    expect(afterCheckout?.totalPaid).toBe(10000);
    expect(afterCheckout?.remainingBalance).toBe(0);

    const piRes = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_pi_succeeded_dual_1',
        type: 'payment_intent.succeeded',
        data: { object: piPayload },
      });

    expect(piRes.status).toBe(200);

    const afterPi = await storage.getProgramEnrollmentById(enrollment.id);
    expect(afterPi?.totalPaid).toBe(10000);
    expect(afterPi?.remainingBalance).toBe(0);

    const payment = await storage.getPaymentByStripeId(piId);
    expect(payment).toBeTruthy();
    expect(payment?.status === 'completed' || payment?.status === 'succeeded').toBe(true);
  });
});
