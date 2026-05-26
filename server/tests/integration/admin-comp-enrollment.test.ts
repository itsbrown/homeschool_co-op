import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { nanoid } from 'nanoid';
import adminEnrollmentsRouter from '../../api/admin-enrollments';
import parentProfileRouter from '../../api/parent-profile';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';

/**
 * DB-backed integration: POST /api/admin/enrollments/:id/comp
 *
 * Verifies that a 100% comp:
 *   1. Writes correct DB fields (comp_amount_cents, comp_percentage, status)
 *   2. Causes GET /api/parent-profile/:parentId to return effectiveBalance = 0
 *
 *   TEST_DATABASE_URL="postgresql://..." npx jest --config jest.integration.config.cjs \
 *     server/tests/integration/admin-comp-enrollment.test.ts --runInBand
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

  // Inject authenticated user from x-test-user-email header (mirrors admin-payment-plan-update pattern)
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
      // supabaseAuth returns 401/403 if user is missing
    }
    next();
  });

  app.use('/api/admin/enrollments', adminEnrollmentsRouter);
  app.use('/api/parent-profile', parentProfileRouter);
  return app;
}

describeWithDb('Integration: admin comp enrollment → balance = 0', () => {
  let app: express.Application;
  let adminEmail: string;
  let parentEmail: string;
  let parentId: number;
  let enrollmentId: number;

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
    adminEmail = `comp_admin_${uid}@test.com`;
    parentEmail = `comp_parent_${uid}@test.com`;

    const admin = await testDb.createTestUser({
      username: `comp_admin_${uid}`,
      email: adminEmail,
      role: 'schoolAdmin',
      name: 'Comp Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Comp School ${uid}`,
      registrationCode: `CS${uid.toUpperCase().slice(0, 4)}`,
    });
    await storage.updateUser(admin.id, { ...(admin as any), schoolId: school.id } as any);

    const parent = await testDb.createTestUser({
      username: `comp_parent_${uid}`,
      email: parentEmail,
      role: 'parent',
      schoolId: school.id,
    });
    parentId = parent.id;

    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Tatum',
      lastName: 'Test',
      schoolId: school.id,
      parentEmail: parent.email,
    });
    const klass = await testDb.createTestClass(school.id, {
      title: `Art Class ${uid}`,
      description: 'Test class',
      category: 'Fall',
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
      status: 'pending_payment',
    } as any);

    enrollmentId = enrollment.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POST /:id/comp at 100% sets DB fields and parent-profile effectiveBalance = 0', async () => {
    // Perform the comp
    const compRes = await request(app)
      .post(`/api/admin/enrollments/${enrollmentId}/comp`)
      .set('x-test-user-email', adminEmail)
      .send({ compPercentage: 100, compReason: 'Integration test full comp' });

    expect(compRes.status).toBe(200);

    // Verify DB fields
    const updated = await storage.getProgramEnrollmentById(enrollmentId);
    expect(updated?.compAmountCents).toBe(90000);
    expect(updated?.compPercentage).toBe(100);
    expect(updated?.status).toBe('enrolled');

    // Verify parent-profile API returns effectiveBalance = 0 (dollars)
    const profileRes = await request(app)
      .get(`/api/parent-profile/${parentId}`)
      .set('x-test-user-email', parentEmail);

    expect(profileRes.status).toBe(200);
    const enrollmentRow = (profileRes.body.enrollments as any[]).find(
      (e: any) => e.id === enrollmentId,
    );
    expect(enrollmentRow).toBeDefined();
    expect(enrollmentRow.effectiveBalance).toBe(0);
  });
});
