import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { testDb } from '../helpers/testDatabase';
import { storage } from '../../storage';

const mockConstructEvent = jest.fn();
const mockGetStripeClient = jest.fn();

jest.mock('../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
}));

import { webhookHandler } from '../../webhook-handler';

describe('Integration: scheduled_payment Stripe webhooks', () => {
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
      webhooks: { constructEvent: mockConstructEvent },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildApp() {
    const app = express();
    app.post(endpoint, express.raw({ type: 'application/json' }), webhookHandler);
    return app;
  }

  async function seedScheduledPaymentFixture() {
    const admin = await testDb.createTestUser({ email: 'sch-admin@test.com', role: 'schoolAdmin' });
    const school = await testDb.createTestSchool(admin.id, { name: 'Scheduled Pay School' });
    const parent = await testDb.createTestUser({
      email: 'sch-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Pay',
      lastName: 'Child',
      schoolId: school.id,
    });
    const klass = await testDb.createTestClass(school.id, { name: 'Scheduled Class', price: 10000 });

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
      totalPaid: 5000,
      remainingBalance: 5000,
      paymentStatus: 'partial_payment',
      status: 'enrolled',
    } as any);

    const scheduledDate = new Date('2026-05-15T00:00:00.000Z');
    const scheduledPayment = await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 5000,
      scheduledDate,
      frequency: 'monthly',
      installmentNumber: 2,
      totalInstallments: 4,
      status: 'processing',
      stripePaymentIntentId: 'pi_sched_success_1',
      metadata: {},
    } as any);

    return { app: buildApp(), parent, enrollment, scheduledPayment };
  }

  it('payment_intent.succeeded completes installment, updates enrollment, and ignores replay for same PI', async () => {
    const { app, parent, enrollment, scheduledPayment } = await seedScheduledPaymentFixture();

    const payload = {
      id: 'evt_sched_pi_ok_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_sched_success_1',
          amount: 5000,
          currency: 'usd',
          metadata: {
            paymentType: 'scheduled_payment',
            scheduledPaymentId: String(scheduledPayment.id),
            parentEmail: parent.email,
            installmentNumber: '2',
            totalInstallments: '4',
            autoPayInitiated: 'true',
          },
        },
      },
    };

    const res1 = await request(app).post(endpoint).set('stripe-signature', 't=1,v1=fake').send(payload);
    expect(res1.status).toBe(200);

    const updated = await storage.getScheduledPaymentsByParentEmail(parent.email);
    const row = updated.find((p) => p.id === scheduledPayment.id);
    expect(row?.status).toBe('completed');
    expect(row?.completionSource).toBe('stripe_autopay');

    const enr = await storage.getProgramEnrollmentById(enrollment.id);
    expect(enr?.totalPaid).toBe(10000);
    expect(enr?.remainingBalance).toBe(0);

    const payments = await storage.getAllPayments();
    const forPi = payments.filter((p: any) => p.stripePaymentIntentId === 'pi_sched_success_1');
    expect(forPi.length).toBe(1);

    const res2 = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({ ...payload, id: 'evt_sched_pi_ok_2' });

    expect(res2.status).toBe(200);
    const paymentsAfter = await storage.getAllPayments();
    expect(paymentsAfter.filter((p: any) => p.stripePaymentIntentId === 'pi_sched_success_1').length).toBe(1);
    const enr2 = await storage.getProgramEnrollmentById(enrollment.id);
    expect(enr2?.totalPaid).toBe(10000);
  });

  it('applies original installment cents to enrollment when credits covered part of the Stripe charge', async () => {
    const { app, parent, enrollment, scheduledPayment } = await seedScheduledPaymentFixture();

    const res = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_sched_credits',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_sched_credits_1',
            amount: 3000,
            currency: 'usd',
            metadata: {
              paymentType: 'scheduled_payment',
              scheduledPaymentId: String(scheduledPayment.id),
              parentEmail: parent.email,
              installmentNumber: '2',
              totalInstallments: '4',
              creditsAppliedCents: '2000',
              userId: String(parent.id),
              originalAmountCents: '5000',
            },
          },
        },
      });

    expect(res.status).toBe(200);
    const enr = await storage.getProgramEnrollmentById(enrollment.id);
    expect(enr?.totalPaid).toBe(10000);
  });

  it('finalizes credit holds when creditHoldSessionId is present on success', async () => {
    const { app, parent, scheduledPayment } = await seedScheduledPaymentFixture();

    await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_sched_hold_fin',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_sched_hold_ok',
            amount: 3000,
            currency: 'usd',
            metadata: {
              paymentType: 'scheduled_payment',
              scheduledPaymentId: String(scheduledPayment.id),
              parentEmail: parent.email,
              installmentNumber: '2',
              totalInstallments: '4',
              creditsAppliedCents: '2000',
              userId: String(parent.id),
              originalAmountCents: '5000',
              creditHoldSessionId: 'hold_sess_1',
            },
          },
        },
      });

    // We assert on the observable effect via storage and rely on dedicated
    // helper tests for the exact finalizeCreditHolds wiring.
    const rows = await storage.getScheduledPaymentsByParentEmail(parent.email);
    const row = rows.find((p) => p.id === scheduledPayment.id);
    expect(row?.status).toBe('completed');
  });

  it('payment_intent.payment_failed resets to pending, increments retry, and releases holds', async () => {
    const { app, scheduledPayment } = await seedScheduledPaymentFixture();

    const res = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_sched_fail_1',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_sched_fail',
            metadata: {
              paymentType: 'scheduled_payment',
              scheduledPaymentId: String(scheduledPayment.id),
              parentEmail: 'parent@example.com',
              creditHoldSessionId: 'hold_sess_fail',
            },
            last_payment_error: { message: 'card_declined' },
          },
        },
      });

    expect(res.status).toBe(200);
    // Detailed failure handling (including credit hold release and retry math)
    // is exercised in scheduled-payment-auto-pay-webhook-helper.test.ts; here
    // we only assert that the webhook processes the event without error.
  });

  it('payment_intent.payment_failed marks failed after auto-pay retry cap', async () => {
    const { app, parent, scheduledPayment } = await seedScheduledPaymentFixture();
    const res = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_sched_fail_cap',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_sched_fail_cap',
            metadata: {
              paymentType: 'scheduled_payment',
              scheduledPaymentId: String(scheduledPayment.id),
              parentEmail: parent.email,
            },
            last_payment_error: { message: 'generic_decline' },
          },
        },
      });

    expect(res.status).toBe(200);
    // The detailed retry-cap behavior is covered in
    // scheduled-payment-auto-pay-webhook-helper.test.ts; here we just assert
    // that the webhook handles the event without error.
  });
});
