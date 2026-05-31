import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { storage } from '../storage';

const mockConstructEvent = jest.fn();
const mockGetStripeClient = jest.fn();

jest.mock('../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
}));

import { webhookHandler } from '../webhook-handler';

describe('webhook scheduled_payment credit hardening', () => {
  const endpoint = '/api/stripe/webhook';

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_WEBHOOK_DEV_BYPASS = 'true';
    process.env.NODE_ENV = 'test';
    mockConstructEvent.mockReset();
    mockConstructEvent.mockImplementation(() => {
      throw new Error('force dev bypass');
    });
    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue({
      webhooks: { constructEvent: mockConstructEvent },
    });
    jest.spyOn(storage, 'getScheduledPaymentsByParentEmail').mockResolvedValue([
      {
        id: 501,
        status: 'processing',
        enrollmentId: 1,
        parentEmail: 'p@test.com',
        amount: 5000,
        metadata: {},
      },
    ] as any);
    jest.spyOn(storage, 'updateScheduledPayment').mockResolvedValue({} as any);
    jest.spyOn(storage, 'getPaymentByStripeId').mockResolvedValue(undefined);
    jest.spyOn(storage, 'getProgramEnrollmentById').mockResolvedValue({
      id: 1,
      totalCost: 10000,
      totalPaid: 5000,
    } as any);
    jest.spyOn(storage, 'updateProgramEnrollment').mockResolvedValue({} as any);
    jest.spyOn(storage, 'getAllPayments').mockResolvedValue([]);
    jest.spyOn(storage, 'createPayment').mockResolvedValue({ id: 1 } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildApp() {
    const app = express();
    app.post(endpoint, express.raw({ type: 'application/json' }), webhookHandler);
    return app;
  }

  it('returns 200 when credits fully consumed', async () => {
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByScheduledPaymentId').mockResolvedValue([]);
    jest.spyOn(storage, 'useCredits').mockResolvedValue({ usedCredits: [], totalUsed: 2000 });

    const app = buildApp();
    const res = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_ok',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_ok',
            amount: 3000,
            currency: 'usd',
            metadata: {
              paymentType: 'scheduled_payment',
              scheduledPaymentId: '501',
              parentEmail: 'p@test.com',
              creditsAppliedCents: '2000',
              userId: '7',
              originalAmountCents: '5000',
              installmentNumber: '2',
              totalInstallments: '4',
            },
          },
        },
      });

    expect(res.status).toBe(200);
    expect(storage.useCredits).toHaveBeenCalled();
  });

  it('returns 200 on replay when installment already completed but credits get repaired', async () => {
    jest.spyOn(storage, 'getScheduledPaymentsByParentEmail').mockResolvedValue([
      {
        id: 501,
        status: 'completed',
        enrollmentId: 1,
        parentEmail: 'p@test.com',
        amount: 5000,
        metadata: {},
      },
    ] as any);
    jest.spyOn(storage, 'getUnifiedCreditUsageLogsByScheduledPaymentId').mockResolvedValue([]);
    jest.spyOn(storage, 'useCredits').mockResolvedValue({ usedCredits: [], totalUsed: 2000 });

    const app = buildApp();
    const res = await request(app)
      .post(endpoint)
      .set('stripe-signature', 't=1,v1=fake')
      .send({
        id: 'evt_replay',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_replay',
            amount: 3000,
            currency: 'usd',
            metadata: {
              paymentType: 'scheduled_payment',
              scheduledPaymentId: '501',
              parentEmail: 'p@test.com',
              creditsAppliedCents: '2000',
              userId: '7',
              originalAmountCents: '5000',
              installmentNumber: '2',
              totalInstallments: '4',
            },
          },
        },
      });

    expect(res.status).toBe(200);
    expect(storage.useCredits).toHaveBeenCalled();
    expect(storage.updateScheduledPayment).not.toHaveBeenCalled();
  });
});
