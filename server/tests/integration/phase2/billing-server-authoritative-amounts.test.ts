import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { storage } from '../../../storage';

var mockPaymentIntentsCreate = jest.fn();
var mockGetStripeClient = jest.fn();
var mockSupabaseGetUser = jest.fn();

jest.mock('../../../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockSupabaseGetUser,
    },
  })),
}));

describe('Integration: Billing server-authoritative amount enforcement', () => {
  let app: express.Express;
  let parent: any;
  let child: any;
  let enrollment: any;

  beforeEach(async () => {
    const billingRouter = (await import('../../../api/billing')).default;
    app = express();
    app.use(express.json());
    app.use('/api/billing', billingRouter);

    await testDb.cleanup();
    mockPaymentIntentsCreate.mockReset();
    mockPaymentIntentsCreate.mockResolvedValue({
      id: 'pi_test_billing_authority',
      client_secret: 'pi_test_billing_authority_secret',
      amount: 5000,
      currency: 'usd',
    });
    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue({
      paymentIntents: {
        create: mockPaymentIntentsCreate,
      },
    });
    mockSupabaseGetUser.mockReset();

    const admin = await testDb.createTestUser({
      email: 'admin-billing-authority@test.com',
      role: 'schoolAdmin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: 'Billing Authority School',
    });
    parent = await testDb.createTestUser({
      email: 'parent-billing-authority@test.com',
      role: 'parent',
      schoolId: school.id,
    });
    child = await testDb.createTestChild(parent.id, {
      firstName: 'Auth',
      lastName: 'Child',
      schoolId: school.id,
    });
    const klass = await testDb.createTestClass(school.id, {
      name: 'Authority Class',
      price: 5000,
    });
    enrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: klass.name,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 5000,
      totalPaid: 0,
      remainingBalance: 5000,
      paymentStatus: 'pending',
      status: 'pending_payment',
    } as any);

    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { email: parent.email } },
      error: null,
    });
  });

  describe('billing/create-payment-intent', () => {
    const endpoint = '/api/billing/create-payment-intent';
    const authHeader = { Authorization: 'Bearer test-token' };

    function payload(amount?: unknown) {
      return {
        ...(amount !== undefined ? { amount } : {}),
        parentEmail: parent.email,
        enrollmentDetails: [{ enrollmentId: enrollment.id }],
        paymentPlan: 'full',
      };
    }

    it('uses server-derived amount when client amount matches', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app).post(endpoint).set(authHeader).send(payload(5000));

      expect(response.status).toBe(200);
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 })
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Client amount mismatch ignored'),
        expect.anything()
      );
      warnSpy.mockRestore();
    });

    it('returns recoverable divergence for mismatched client amount', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app).post(endpoint).set(authHeader).send(payload(1));

      expect(response.status).toBe(409);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          error: 'AMOUNT_DIVERGENCE',
          recoverable: true,
          action: 'REFRESH_AND_REPRICE',
          divergence: expect.objectContaining({
            operation: 'billing_create_payment_intent',
            clientAmountCents: 1,
            authoritativeAmountCents: 5000,
          }),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns recoverable divergence for malformed client amount', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app).post(endpoint).set(authHeader).send(payload('abc'));

      expect(response.status).toBe(409);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          error: 'AMOUNT_DIVERGENCE',
          recoverable: true,
          action: 'REFRESH_AND_REPRICE',
          divergence: expect.objectContaining({
            operation: 'billing_create_payment_intent',
            clientAmountRaw: 'abc',
            clientAmountMalformed: true,
            authoritativeAmountCents: 5000,
          }),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('supports absent client amount and still uses server-derived amount', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app).post(endpoint).set(authHeader).send(payload());

      expect(response.status).toBe(200);
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 })
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('ignored in favor of server-computed amount'),
        expect.anything()
      );
      warnSpy.mockRestore();
    });

    it('returns 401 when authorization header is missing', async () => {
      const response = await request(app).post(endpoint).send(payload(5000));

      expect(response.status).toBe(401);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('returns 403 before amount validation when enrollment is not owned', async () => {
      const otherParent = await testDb.createTestUser({
        email: 'other-parent-billing-authority@test.com',
        role: 'parent',
        schoolId: parent.schoolId,
      });
      mockSupabaseGetUser.mockResolvedValue({
        data: { user: { email: otherParent.email } },
        error: null,
      });

      const response = await request(app).post(endpoint).set(authHeader).send(payload('12.34'));

      expect(response.status).toBe(403);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('returns 400 with error payload for structurally invalid request after auth', async () => {
      const response = await request(app).post(endpoint).set(authHeader).send({
        parentEmail: parent.email,
        paymentPlan: 'full',
        // enrollmentDetails intentionally omitted to hit detailed validation layer
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });
  });

  describe('billing/pay-balance', () => {
    const endpoint = '/api/billing/pay-balance';
    const authHeader = { Authorization: 'Bearer test-token' };

    it('returns recoverable divergence when pay-balance client total mismatches', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app)
        .post(endpoint)
        .set(authHeader)
        .send({
          enrollmentIds: [enrollment.id],
          paymentDetails: { totalAmountCents: 1 },
          paymentPlan: 'full',
        });

      expect(response.status).toBe(409);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          error: 'AMOUNT_DIVERGENCE',
          recoverable: true,
          action: 'REFRESH_AND_REPRICE',
          divergence: expect.objectContaining({
            operation: 'billing_pay_balance',
            clientAmountCents: 1,
            authoritativeAmountCents: 5000,
          }),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns 401 with error payload when auth header is missing', async () => {
      const response = await request(app).post(endpoint).send({
        enrollmentIds: [enrollment.id],
        paymentPlan: 'full',
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('returns 403 with error payload before malformed amount validation for non-owner', async () => {
      const otherParent = await testDb.createTestUser({
        email: 'other-parent-billing-authority-pay-balance@test.com',
        role: 'parent',
        schoolId: parent.schoolId,
      });
      mockSupabaseGetUser.mockResolvedValue({
        data: { user: { email: otherParent.email } },
        error: null,
      });

      const response = await request(app)
        .post(endpoint)
        .set(authHeader)
        .send({
          enrollmentIds: [enrollment.id],
          paymentPlan: 'full',
          amount: 'abc',
          total: 'not-a-number',
        });

      expect(response.status).toBe(403);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('returns same logical outcome for idempotent replay with same key and payload', async () => {
      mockPaymentIntentsCreate.mockReset();
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id: 'pi_idempotent_once',
        client_secret: 'pi_idempotent_once_secret',
        amount: 5000,
        currency: 'usd',
      });

      const idempotencyKey = 'pay-all-idem-key-1';
      const first = await request(app)
        .post(endpoint)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          enrollmentIds: [enrollment.id],
          paymentDetails: { totalAmountCents: 5000 },
          paymentPlan: 'full',
        });

      const second = await request(app)
        .post(endpoint)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          enrollmentIds: [enrollment.id],
          paymentDetails: { totalAmountCents: 5000 },
          paymentPlan: 'full',
        });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.paymentIntentId).toBe(first.body.paymentIntentId);
      expect(second.body.clientSecret).toBe(first.body.clientSecret);
      expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 409 when idempotency key is replayed with a different payload', async () => {
      const extraEnrollment = await storage.createProgramEnrollment({
        schoolId: parent.schoolId,
        classType: 'school_class',
        classId: enrollment.classId,
        childId: child.id,
        childName: `${child.firstName} ${child.lastName}`,
        className: enrollment.className,
        parentId: parent.id,
        parentEmail: parent.email,
        totalCost: 2000,
        totalPaid: 0,
        remainingBalance: 2000,
        paymentStatus: 'pending',
        status: 'pending_payment',
      } as any);

      const idempotencyKey = 'pay-all-idem-key-2';
      const first = await request(app)
        .post(endpoint)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          enrollmentIds: [enrollment.id],
          paymentDetails: { totalAmountCents: 5000 },
          paymentPlan: 'full',
        });

      const second = await request(app)
        .post(endpoint)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          enrollmentIds: [enrollment.id, extraEnrollment.id],
          paymentDetails: { totalAmountCents: 7000 },
          paymentPlan: 'full',
        });

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      expect(second.body).toEqual(
        expect.objectContaining({
          success: false,
          error: 'Idempotency key reused with different payload',
        })
      );
    });
  });
});
