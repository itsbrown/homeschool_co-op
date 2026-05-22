import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { describeIntegration } from '../helpers/integrationDb';
import { nanoid } from 'nanoid';
import adminEnrollmentPaymentRouter from '../../api/admin-enrollment-payment';
import { recalculatePaymentSchedule, validateFrequencyChange } from '../../lib/payment-calculator';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';

/**
 * DB-backed: admin PATCH /api/admin/enrollments/:id/payment-plan
 *
 *   TEST_DATABASE_URL="postgresql://..." npx jest --config jest.integration.config.cjs server/tests/integration/admin-payment-plan-update.test.ts --runInBand
 */
const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    }),
  );
  app.use(async (req: any, _res, next) => {
    const testUserEmail = req.headers['x-test-user-email'];
    if (!testUserEmail) return next();
    try {
      const user = await storage.getUserByEmail(String(testUserEmail));
      if (user) {
        req.session = req.session || {};
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.user = {
          id: user.id,
          email: user.email,
          sub: String(user.id),
          role: user.role,
          schoolId: user.schoolId,
        };
        req.auth = { payload: { email: user.email, role: user.role } };
      }
    } catch {
      // Route returns 401/403 if user missing
    }
    next();
  });
  app.use('/api/admin/enrollments', adminEnrollmentPaymentRouter);
  return app;
}

describeIntegration('payment-calculator: admin weekly preview (Daniel Pierce scenario)', () => {
  it('matches 4 × $225 weekly installments from program dates', () => {
    const programStart = new Date('2026-04-05');
    const programEnd = new Date('2026-06-11');
    const asOf = new Date('2026-05-15');
    const totalCostCents = 90000;

    const validation = validateFrequencyChange(
      totalCostCents,
      0,
      programStart,
      programEnd,
      'weekly',
      asOf,
    );
    expect(validation.valid).toBe(true);

    const schedule = recalculatePaymentSchedule(
      totalCostCents,
      0,
      programStart,
      programEnd,
      'weekly',
      asOf,
    );
    expect(schedule.numberOfPayments).toBe(4);
    expect(schedule.paymentAmount).toBe(22500);
    expect(schedule.finalPaymentAmount).toBe(22500);
    expect(schedule.paymentDates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-05-15',
      '2026-05-22',
      '2026-05-29',
      '2026-06-05',
    ]);
  });
});

describeWithDb('Integration: admin payment plan update', () => {
  let app: express.Application;
  let schoolAdminEmail: string;
  let enrollmentId: number;
  let parentEmail: string;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    app = buildTestApp();
    await testDb.cleanup();

    const uid = nanoid(8).toLowerCase();
    schoolAdminEmail = `pp_admin_${uid}@test.com`;
    parentEmail = `pp_parent_${uid}@test.com`;

    const admin = await testDb.createTestUser({
      username: `pp_admin_${uid}`,
      email: schoolAdminEmail,
      role: 'schoolAdmin',
      name: 'Payment Plan Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `PP School ${uid}`,
      registrationCode: `PP${uid.toUpperCase().slice(0, 4)}`,
    });
    await storage.updateUser(admin.id, { ...(admin as any), schoolId: school.id } as any);

    const parent = await testDb.createTestUser({
      username: `pp_parent_${uid}`,
      email: parentEmail,
      role: 'parent',
      schoolId: school.id,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Daniel',
      lastName: 'Pierce',
      schoolId: school.id,
      parentEmail: parent.email,
    });
    const klass = await testDb.createTestClass(school.id, {
      title: `Yankee Doodle ${uid}`,
      description: 'Test class',
      category: 'Spring',
      price: 90000,
      status: 'active',
      type: 'school_admin',
    });

    const enrollment = await storage.createProgramEnrollment({
      schoolId: school.id,
      classType: 'school_class',
      classId: klass.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: klass.title,
      parentId: parent.id,
      parentEmail: parent.email,
      totalCost: 90000,
      totalPaid: 0,
      remainingBalance: 90000,
      paymentStatus: 'pending',
      paymentFrequency: 'one_time',
      paymentPlan: 'full_payment',
      programStartDate: '2026-04-05',
      programEndDate: '2026-06-11',
      status: 'pending_payment',
    } as any);

    enrollmentId = enrollment.id;

    await storage.createScheduledPayment({
      schoolId: school.id,
      enrollmentId: enrollment.id,
      parentId: parent.id,
      parentEmail: parent.email,
      amount: 90000,
      scheduledDate: new Date('2026-04-05'),
      frequency: 'one_time',
      installmentNumber: 1,
      totalInstallments: 1,
      status: 'pending',
      metadata: { legacy: true },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET payment-plan returns weekly preview', async () => {
    const res = await request(app)
      .get(`/api/admin/enrollments/${enrollmentId}/payment-plan`)
      .set('x-test-user-email', schoolAdminEmail);

    expect(res.status).toBe(200);
    expect(res.body.frequencyPreviews.weekly.valid).toBe(true);
    expect(res.body.frequencyPreviews.weekly.schedule.numberOfPayments).toBe(4);
    expect(res.body.frequencyPreviews.weekly.schedule.paymentAmount).toBe(22500);
  });

  it('PATCH payment-plan replaces pending installments and updates enrollment', async () => {
    const res = await request(app)
      .patch(`/api/admin/enrollments/${enrollmentId}/payment-plan`)
      .set('x-test-user-email', schoolAdminEmail)
      .send({
        paymentFrequency: 'weekly',
        adminComment: 'updated payment plan',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newSchedule.frequency).toBe('weekly');
    expect(res.body.newSchedule.numberOfPayments).toBe(4);
    expect(res.body.scheduledPaymentsCreated).toBe(4);
    expect(res.body.scheduledPaymentsDeleted).toBeGreaterThanOrEqual(1);

    const updated = await storage.getProgramEnrollmentById(enrollmentId);
    expect(updated?.paymentFrequency).toBe('weekly');
    expect(updated?.paymentPlan).toBe('custom');

    const rows = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
    const pending = rows.filter((r) => String(r.status) === 'pending');
    expect(pending).toHaveLength(4);
    expect(pending.every((r) => r.amount === 22500)).toBe(true);
    expect(pending.some((r) => (r.metadata as any)?.createdFromPaymentPlanChange)).toBe(true);
    expect(rows.some((r) => r.amount === 90000)).toBe(false);
  });

  it('rejects payment plan change without admin comment', async () => {
    const res = await request(app)
      .patch(`/api/admin/enrollments/${enrollmentId}/payment-plan`)
      .set('x-test-user-email', schoolAdminEmail)
      .send({ paymentFrequency: 'weekly' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/comment/i);
  });

  it('rejects payment plan change without program dates', async () => {
    await storage.updateProgramEnrollment(enrollmentId, {
      programStartDate: null,
      programEndDate: null,
    } as any);

    const res = await request(app)
      .patch(`/api/admin/enrollments/${enrollmentId}/payment-plan`)
      .set('x-test-user-email', schoolAdminEmail)
      .send({
        paymentFrequency: 'weekly',
        adminComment: 'missing dates',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/program dates/i);
  });
});
