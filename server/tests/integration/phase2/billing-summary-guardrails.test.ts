import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import billingRouter from '../../../api/billing';
import { testDb } from '../../helpers/testDatabase';
import { storage } from '../../../storage';

let mockSupabaseGetUser: jest.Mock = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: (...args: any[]) => mockSupabaseGetUser(...args),
    },
  })),
}));

const app = express();
app.use(express.json());
app.use('/api/billing', billingRouter);

describe('Integration: Billing summary guardrails', () => {
  let parent: any;
  let school: any;
  let child: any;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();

    const admin = await testDb.createTestUser({
      email: 'billing-summary-admin@test.com',
      role: 'schoolAdmin',
    });

    school = await testDb.createTestSchool(admin.id, {
      name: 'Billing Summary School',
    });

    parent = await testDb.createTestUser({
      email: 'billing-summary-parent@test.com',
      role: 'parent',
      schoolId: school.id,
    });

    child = await testDb.createTestChild(parent.id, {
      firstName: 'Summary',
      lastName: 'Child',
      schoolId: school.id,
    });

    mockSupabaseGetUser.mockReset();
    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { email: parent.email } },
      error: null,
    });
  });

  it('includes marketplace and regular enrollments in canonical summary balance', async () => {
    const regularClass = await testDb.createTestClass(school.id, {
      name: 'Regular Class',
      price: 10000,
    });
    const marketplaceClass = await testDb.createTestClass(school.id, {
      name: 'Marketplace Class',
      price: 12000,
    });

    await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: regularClass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: regularClass.name,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 10000,
      totalPaid: 4000,
      remainingBalance: 6000,
      paymentStatus: 'partial_payment',
      status: 'enrolled',
    } as any);

    await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'marketplace_class',
      classId: null,
      marketplaceClassId: marketplaceClass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: marketplaceClass.name,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 12000,
      totalPaid: 2000,
      remainingBalance: 10000,
      paymentStatus: 'partial_payment',
      status: 'pending_payment',
    } as any);

    const response = await request(app)
      .get('/api/billing/summary')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.enrollmentCount).toBe(2);
    expect(response.body.totalBalance).toBe(16000);
    const balances = response.body.enrollmentDetails
      .map((d: any) => d.balance)
      .sort((a: number, b: number) => a - b);
    expect(balances).toEqual([6000, 10000]);
  });

  it('does not double-count pending scheduled payments into canonical balance', async () => {
    const classItem = await testDb.createTestClass(school.id, {
      name: 'Schedule Class',
      price: 30000,
    });

    const enrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: classItem.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: classItem.name,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 30000,
      totalPaid: 10000,
      remainingBalance: 20000,
      paymentStatus: 'partial_payment',
      status: 'enrolled',
    } as any);

    await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 5000,
      currency: 'usd',
      scheduledDate: new Date(Date.now() + 86400000),
      frequency: 'monthly',
      installmentNumber: 1,
      totalInstallments: 3,
      status: 'pending',
      metadata: {},
    } as any);

    await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 5000,
      currency: 'usd',
      scheduledDate: new Date(Date.now() + 2 * 86400000),
      frequency: 'monthly',
      installmentNumber: 2,
      totalInstallments: 3,
      status: 'pending',
      metadata: {},
    } as any);

    await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 5000,
      currency: 'usd',
      scheduledDate: new Date(Date.now() - 86400000),
      frequency: 'monthly',
      installmentNumber: 3,
      totalInstallments: 3,
      status: 'completed',
      metadata: {},
    } as any);

    const response = await request(app)
      .get('/api/billing/summary')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.totalBalance).toBe(20000);
    expect(response.body.enrollmentBalance).toBe(20000);
    expect(response.body.scheduledPaymentsBalance).toBe(10000);
    expect(response.body.pendingScheduledPayments).toBe(2);
  });
});
