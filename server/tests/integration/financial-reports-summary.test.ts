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
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import financialReportsRouter from '../../api/financial-reports';
import adminRouter from '../../api/admin';
import { verifyAuth0Token, requireRole } from '../../middleware/auth0-auth';
import { getDb } from '../../db';
import { payments, programEnrollments } from '@shared/schema';
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

describeWithDb('Integration: GET /api/admin/financial-reports/summary', () => {
  let app: express.Application;
  let schoolAdminEmail: string;
  let schoolId: number;

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

    await storage.createProgramEnrollment({
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
    // 6000 (partial) + 45000 (stripe-managed remaining_balance=0)
    expect(res.body.summary.outstandingBalanceCents).toBe(51000);
    expect(res.body.summary.totalEnrollments).toBe(2);
  });

  it('debug=1 includes diagnostics without error', async () => {
    const res = await request(app)
      .get('/api/admin/financial-reports/summary?debug=1')
      .set('x-test-user-email', schoolAdminEmail);

    expect(res.status).toBe(200);
    expect(res.body.diagnostics).toBeDefined();
    expect(res.body.diagnostics.enrollmentsAtSchool).toBe(2);
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

describe('financial-reports route mount order (auth0)', () => {
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
