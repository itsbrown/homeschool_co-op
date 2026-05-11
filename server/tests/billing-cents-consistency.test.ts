import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockStripeCreate = jest.fn();
const mockGetStripeClient = jest.fn();
const mockSupabaseGetUser = jest.fn();

const mockStorage = {
  getUserByEmail: jest.fn(),
  getProgramEnrollmentById: jest.fn(),
  getClassById: jest.fn(),
  updateProgramEnrollment: jest.fn(),
  createPayment: jest.fn(),
  getChildById: jest.fn(),
};

const mockDataLayer = {
  refreshUserData: jest.fn().mockResolvedValue({}),
};

jest.mock('../config/stripe', () => ({
  getStripeClient: mockGetStripeClient,
}));

jest.mock('../storage', () => ({
  storage: mockStorage,
}));

jest.mock('../services/dataLayer', () => ({
  dataLayer: mockDataLayer,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockSupabaseGetUser,
    },
  })),
}));

import billingRouter, { processBalancePayment, splitCentsEvenly } from '../api/billing';

describe('Billing cents consistency', () => {
  function idempotencyHeader(value: string): Record<string, string> {
    return { 'Idempotency-Key': `billing-cents-${value}` };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStripeClient.mockResolvedValue({
      paymentIntents: {
        create: mockStripeCreate,
      },
    });
    mockStripeCreate.mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    });

    mockStorage.getUserByEmail.mockResolvedValue({
      id: 5,
      email: 'parent@test.com',
      schoolId: 12,
    });
    mockStorage.getProgramEnrollmentById.mockResolvedValue({
      id: 101,
      schoolId: 12,
      parentId: 5,
      parentEmail: 'parent@test.com',
      totalCost: 1099,
      totalPaid: 0,
      remainingBalance: 1099,
    });
    mockStorage.createPayment.mockResolvedValue({ id: 88 });
    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { email: 'parent@test.com' } },
      error: null,
    });
  });

  it('splitCentsEvenly preserves exact total with odd-cent splits', () => {
    const allocation = splitCentsEvenly(10001, 3);
    expect(allocation).toEqual([3334, 3334, 3333]);
    expect(allocation.reduce((sum, amount) => sum + amount, 0)).toBe(10001);
  });

  it('returns divergence conflict for fractional client amount', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/billing', billingRouter);

    const response = await request(app)
      .post('/api/billing/create-payment-intent')
      .set('Authorization', 'Bearer test-token')
      .set(idempotencyHeader('fractional'))
      .send({
        amount: 1099.5,
        currency: 'usd',
        parentEmail: 'parent@test.com',
        enrollmentDetails: [{ enrollmentId: 101 }],
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      }),
    );
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it('returns divergence conflict for malformed client amount', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/billing', billingRouter);

    const response = await request(app)
      .post('/api/billing/create-payment-intent')
      .set('Authorization', 'Bearer test-token')
      .set(idempotencyHeader('malformed'))
      .send({
        amount: '12.34',
        currency: 'usd',
        parentEmail: 'parent@test.com',
        enrollmentDetails: [{ enrollmentId: 101 }],
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      }),
    );
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it('uses integer cents as-is without 100x conversion drift', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/billing', billingRouter);

    const response = await request(app)
      .post('/api/billing/create-payment-intent')
      .set('Authorization', 'Bearer test-token')
      .set(idempotencyHeader('integer'))
      .send({
        amount: 1099,
        currency: 'usd',
        parentEmail: 'parent@test.com',
        enrollmentDetails: [{ enrollmentId: 101 }],
      });

    expect(response.status).toBe(200);
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1099,
      }),
    );
  });

  it('processBalancePayment distributes odd cents without over/under charge', async () => {
    mockStorage.getProgramEnrollmentById
      .mockResolvedValueOnce({
        id: 1,
        childId: 10,
        childName: 'Child One',
        className: 'Class One',
        programId: 201,
        paymentStatus: 'pending',
        totalPaid: 0,
        totalCost: 10000,
        remainingBalance: 10000,
      })
      .mockResolvedValueOnce({
        id: 2,
        childId: 11,
        childName: 'Child Two',
        className: 'Class Two',
        programId: 202,
        paymentStatus: 'pending',
        totalPaid: 0,
        totalCost: 10000,
        remainingBalance: 10000,
      });

    mockStorage.getClassById.mockResolvedValue({ id: 201, price: 10000, title: 'Class' });

    await processBalancePayment(
      {
        id: 'pi_odd_cents',
        amount: 101,
        currency: 'usd',
        metadata: { paymentPlan: 'full' },
      } as any,
      'parent@test.com',
      [1, 2],
      101,
    );

    const paidAmounts = mockStorage.updateProgramEnrollment.mock.calls.map((call) => call[1].totalPaid);
    expect(paidAmounts).toEqual([51, 50]);
    expect(paidAmounts.reduce((sum: number, amount: number) => sum + amount, 0)).toBe(101);
  });
});
