/**
 * Financial Reports — summary endpoint regression
 *
 * Covers the production failures:
 * 1. Route order: /api/admin catch-all must not run before financial-reports
 * 2. SQL: outstanding totals must not require program_enrollments.effective_balance
 *
 * Run:
 *   PAYMENT_PROCESSOR_ENABLED=true TEST_DATABASE_URL="postgresql://..." \
 *     npx jest --config jest.integration.config.cjs \
 *     server/tests/integration/financial-reports-summary.test.ts --runInBand
 */

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { describeIntegration } from '../helpers/integrationDb';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import financialReportsRouter from '../../api/financial-reports';
import adminRouter from '../../api/admin';
import { verifyAuth0Token, requireRole } from '../../middleware/auth0-auth';
import { getDb } from '../../db';
import { payments, programEnrollments, membershipEnrollments } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';
import {
  sqlEnrollmentEffectiveBalancePositive,
  sqlSumEnrollmentEffectiveBalance,
  sqlSumCompAmountCents,
} from '../../lib/enrollment-balance';
import { schoolScopedLedgerPayments } from '../../lib/school-payment-scope';

const describeWithDb =
  process.env.TEST_DATABASE_URL && process.env.ASA_INTEGRATION_DB_AVAILABLE !== 'false'
    ? describe
    : describe.skip;

function installTestUserAuth(app: express.Application) {
  app.use(async (req: any, _res, next) => {
    const testUserEmail = req.headers['x-test-user-email'];
    if (!testUserEmail) return next();
    try {
      const user = await storage.getUserByEmail(String(testUserEmail));
      if (user) {
        req.user = { id: user.id, email: user.email, role: user.role, schoolId: user.schoolId };
        req.auth = { payload: { email: user.email, role: user.role } };
      }
    } catch {
      // Handler returns 401/404
    }
    next();
  });
}

function buildFinancialReportsTestApp(mountFinancialReportsFirst: boolean) {
  const app = express();
  app.use(express.json());
  installTestUserAuth(app);

  const finMount = () => {
    app.use('/api/admin/financial-reports', financialReportsRouter);
  };
  const adminMount = () => {
    app.use('/api/admin', adminRouter);
  };

  if (mountFinancialReportsFirst) {
    finMount();
    adminMount();
  } else {
    adminMount();
    finMount();
  }

  return app;
}

async function seedMembershipOwedInDb(parentUserId: number, schoolId: number, amountCents: number) {
  const db = await getDb();
  const year = new Date().getFullYear();
  await db.insert(membershipEnrollments).values({
    schoolId,
    parentUserId,
    membershipYear: year,
    amount: amountCents,
    amountPaid: 0,
    remainingBalance: amountCents,
    totalAmount: amountCents,
    balanceDue: amountCents,
    status: 'pending_payment',
    dueDate: new Date(year, 8, 1),
    expirationDate: new Date(year + 1, 8, 1),
    endDate: new Date(year + 1, 8, 1),
    startDate: new Date(year, 8, 1),
    membershipTier: 'basic',
  });
}

describeWithDb('Integration: GET /api/admin/financial-reports/summary', () => {
  let app: express.Application;
  let schoolAdminEmail: string;
  let schoolId: number;
  let parentId: number;
  let enrollmentWithBalanceId: number;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    app = buildFinancialReportsTestApp(true);
    await testDb.cleanup();

    const uid = nanoid(8).toLowerCase();
    schoolAdminEmail = `fin_admin_${uid}@test.com`;
    const parentEmail = `fin_parent_${uid}@test.com`;

    const admin = await testDb.createTestUser({
      username: `fin_admin_${uid}`,
      email: schoolAdminEmail,
      role: 'schoolAdmin',
      name: 'Financial Reports Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Fin Reports School ${uid}`,
      registrationCode: `FR${uid.toUpperCase().slice(0, 6)}`,
    });
    schoolId = school.id;
    await storage.updateUser(admin.id, { ...(admin as any), schoolId: school.id } as any);

    const parent = await testDb.createTestUser({
      username: `fin_parent_${uid}`,
      email: parentEmail,
      role: 'parent',
      schoolId: school.id,
    });
    parentId = parent.id;
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Fin',
      lastName: 'Child',
      schoolId: school.id,
      parentEmail: parent.email,
    });
    const klass = await testDb.createTestClass(school.id, {
      title: `Fin Class ${uid}`,
      price: 10000,
      status: 'active',
    });

    const partialEnrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: klass.title,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 10000,
      totalPaid: 4000,
      remainingBalance: 6000,
      paymentStatus: 'partial_payment',
      status: 'enrolled',
    } as any);
    enrollmentWithBalanceId = partialEnrollment.id;

    // Stripe-managed row: remaining_balance=0 but family still owes 45000
    await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: `${klass.title} Stripe`,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 80000,
      totalPaid: 35000,
      remainingBalance: 0,
      paymentStatus: 'stripe_managed',
      status: 'enrolled',
    } as any);

    await seedMembershipOwedInDb(parent.id, school.id, 2500);

    await storage.createPayment({
      schoolId: school.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 5000,
      status: 'completed',
      paymentMethod: 'stripe',
      enrollmentIds: [],
    } as any);
  });

  it('returns 200 with revenue and formula-based outstanding balance', async () => {
    const res = await request(app)
      .get('/api/admin/financial-reports/summary')
      .set('x-test-user-email', schoolAdminEmail);

    expect(res.status).toBe(200);
    expect(res.body.schoolId).toBe(schoolId);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.totalPayments).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.totalRevenueCents).toBeGreaterThanOrEqual(5000);
    // 6000 (partial) + 45000 (stripe-managed remaining_balance=0) + 2500 membership
    expect(res.body.summary.tuitionOutstandingCents).toBe(51000);
    expect(res.body.summary.membershipOutstandingCents).toBe(2500);
    expect(res.body.summary.outstandingBalanceCents).toBe(53500);
    expect(res.body.summary.outstandingBalanceCents).toBe(
      res.body.summary.tuitionOutstandingCents + res.body.summary.membershipOutstandingCents,
    );
    expect(res.body.summary.totalEnrollments).toBe(2);
    expect(res.body.summary.activePaymentPlans).toBe(0);
  });

  it('counts activePaymentPlans from pending scheduled payments, not enrollment balance', async () => {
    await storage.createScheduledPayment({
      schoolId,
      enrollmentId: enrollmentWithBalanceId,
      parentId,
      parentEmail: (await storage.getUser(parentId))!.email,
      amount: 3000,
      scheduledDate: new Date('2026-06-15T00:00:00.000Z'),
      frequency: 'monthly',
      installmentNumber: 2,
      totalInstallments: 4,
      status: 'pending',
      metadata: {},
    } as any);

    const res = await request(app)
      .get('/api/admin/financial-reports/summary')
      .set('x-test-user-email', schoolAdminEmail);

    expect(res.status).toBe(200);
    expect(res.body.summary.activePaymentPlans).toBe(1);
  });

  it('collections-overview totalOwedCents matches summary outstanding balance', async () => {
    const [summaryRes, collectionsRes] = await Promise.all([
      request(app)
        .get('/api/admin/financial-reports/summary')
        .set('x-test-user-email', schoolAdminEmail),
      request(app)
        .get('/api/admin/financial-reports/collections-overview')
        .set('x-test-user-email', schoolAdminEmail),
    ]);

    expect(summaryRes.status).toBe(200);
    expect(collectionsRes.status).toBe(200);
    expect(collectionsRes.body.summary.totalOwedCents).toBe(summaryRes.body.summary.outstandingBalanceCents);
    expect(collectionsRes.body.summary.totalTuitionOwedCents).toBe(summaryRes.body.summary.tuitionOutstandingCents);
    expect(collectionsRes.body.summary.totalMembershipOwedCents).toBe(
      summaryRes.body.summary.membershipOutstandingCents,
    );
  });

  it('debug=1 includes diagnostics without error', async () => {
    const res = await request(app)
      .get('/api/admin/financial-reports/summary?debug=1')
      .set('x-test-user-email', schoolAdminEmail);

    expect(res.status).toBe(200);
    expect(res.body.diagnostics).toBeDefined();
    expect(res.body.diagnostics.enrollmentsAtSchool).toBe(2);
  });

  it('recent-transactions returns ledger rows including non-enum payment status', async () => {
    const db = await getDb();
    await db.execute(sql`
      INSERT INTO payments (
        school_id, parent_id, parent_email, amount, currency, status,
        payment_method, enrollment_ids, metadata
      ) VALUES (
        ${schoolId}, ${parentId}, (SELECT email FROM users WHERE id = ${parentId}), 2500, 'usd', 'succeeded',
        'card', '[]'::jsonb, '{}'::jsonb
      )
    `);

    const res = await request(app)
      .get('/api/admin/financial-reports/recent-transactions')
      .set('x-test-user-email', schoolAdminEmail);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(2);
    const succeededRow = res.body.transactions.find(
      (tx: { amount: number; status: string }) => tx.amount === 2500 && tx.status === 'succeeded',
    );
    expect(succeededRow).toBeDefined();
  });

  it('runs the same Drizzle aggregate queries as /summary (no effective_balance column)', async () => {
    const db = await getDb();

    const [outstanding] = await db
      .select({ total: sqlSumEnrollmentEffectiveBalance() })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          sqlEnrollmentEffectiveBalancePositive(),
        ),
      );

    const [comped] = await db
      .select({ total: sqlSumCompAmountCents() })
      .from(programEnrollments)
      .where(eq(programEnrollments.schoolId, schoolId));

    const [ledger] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
      })
      .from(payments)
      .where(
        and(
          schoolScopedLedgerPayments(schoolId),
          sql`${payments.status} IN ('completed', 'succeeded')`,
        ),
      );

    expect(Number(outstanding?.total ?? 0)).toBe(51000);
    expect(Number(comped?.total ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(ledger?.revenue ?? 0)).toBeGreaterThanOrEqual(5000);
  });

  it('does not serve summary when financial-reports is mounted after /api/admin', async () => {
    const wrongOrderApp = buildFinancialReportsTestApp(false);

    const res = await request(wrongOrderApp)
      .get('/api/admin/financial-reports/summary')
      .set('x-test-user-email', schoolAdminEmail);

    // Admin router runs first: verifyAuth0Token + requireRole, then no matching route → 404.
    // The dedicated financial-reports router must never be reached in this configuration.
    expect(res.status).toBe(404);
    expect(res.body.summary).toBeUndefined();
  });
});

describeIntegration('financial-reports route mount order (auth0)', () => {
  it('schoolAdmin reaches summary when financial-reports is registered first', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin/financial-reports', verifyAuth0Token, financialReportsRouter);
    app.use('/api/admin', verifyAuth0Token, requireRole(['admin', 'superAdmin']), (_req, res) => {
      res.status(404).json({ message: 'admin catch-all' });
    });

    // No DB — only checks middleware chain does not 403 before handler.
    // Handler will 404/500 without user; we only assert not 403 Insufficient permissions.
    const res = await request(app)
      .get('/api/admin/financial-reports/summary')
      .set('x-test-user-email', 'nobody@test.com');

    expect(res.status).not.toBe(403);
    expect(res.body?.message).not.toBe('Insufficient permissions');
  });
});
