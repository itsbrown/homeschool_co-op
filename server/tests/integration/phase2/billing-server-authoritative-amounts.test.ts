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

    it('ignores mismatched client amount and logs warning', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app).post(endpoint).set(authHeader).send(payload(1));

      expect(response.status).toBe(200);
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 })
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '⚠️ Client amount mismatch ignored in favor of server-computed amount:',
        expect.objectContaining({ clientAmount: 1, authoritativeAmount: 5000 })
      );
      warnSpy.mockRestore();
    });

    it('ignores malformed client amount and logs warning', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app).post(endpoint).set(authHeader).send(payload('abc'));

      expect(response.status).toBe(200);
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 })
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '⚠️ Malformed client amount ignored in favor of server-computed amount:',
        expect.objectContaining({ clientAmount: 'abc', authoritativeAmount: 5000 })
      );
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
  });

  describe('billing/pay-balance', () => {
    const endpoint = '/api/billing/pay-balance';
    const authHeader = { Authorization: 'Bearer test-token' };

    it('uses server-derived amount when client total mismatches', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await request(app)
        .post(endpoint)
        .set(authHeader)
        .send({
          enrollmentIds: [enrollment.id],
          paymentDetails: { totalAmountCents: 1 },
          paymentPlan: 'full',
        });

      expect(response.status).toBe(200);
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 })
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '⚠️ Client total mismatch ignored in favor of server-computed balance amount:',
        expect.objectContaining({ clientTotal: 1, authoritativeAmount: 5000 })
      );
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
  });
});
