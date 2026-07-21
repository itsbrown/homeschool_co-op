import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { nanoid } from 'nanoid';
import express from 'express';
import fileUpload from 'express-fileupload';
import scheduleBuilderRouter from '../../api/schedule-builder';
import testRouter from '../../api/test';
import { buildStaffTestApp } from '../helpers/staffTestApp';
import { testDb } from '../helpers/testDatabase';
import { storage } from '../../storage';
import { getDb } from '../../db';
import { programEnrollments, userRoles } from '@shared/schema';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

/** App with express-fileupload for CSV import routes (mirrors server/index.ts). */
function buildScheduleCsvTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/test', testRouter);
  app.use(
    '/api/schedule-builder',
    fileUpload({
      limits: { fileSize: 5 * 1024 * 1024 },
      abortOnLimit: true,
    }),
  );
  app.use('/api/schedule-builder', scheduleBuilderRouter);
  return app;
}

describeWithDb('Integration: schedule-builder API', () => {
  let app: ReturnType<typeof buildStaffTestApp>;
  let seed: any;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    app = buildStaffTestApp([
      { path: '/api/test', router: testRouter },
      { path: '/api/schedule-builder', router: scheduleBuilderRouter },
    ]);
    await testDb.cleanup();

    const res = await request(app)
      .post('/api/test/setup-schedule-builder-scenario')
      .set('X-Test-Token', 'test-secret-token')
      .send({});
    expect(res.status).toBe(200);
    seed = res.body.data;
  });

  it('P0-2: admin CRUD skeleton + block + week plan + publish', async () => {
    const adminEmail = seed.admin.email;
    const skRes = await request(app)
      .post('/api/schedule-builder/skeletons')
      .set('x-test-user-email', adminEmail)
      .send({
        name: `Extra Template ${nanoid(4)}`,
        classId: seed.classes.seekers.id,
        gradeLevel: '2nd',
        operatingDays: ['Monday'],
        status: 'active',
      });
    expect(skRes.status).toBe(201);
    const skeletonId = skRes.body.id;

    const blockRes = await request(app)
      .post(`/api/schedule-builder/skeletons/${skeletonId}/blocks`)
      .set('x-test-user-email', adminEmail)
      .send({
        dayOfWeek: 1,
        startTime: '11:00',
        endTime: '12:00',
        blockType: 'curriculum',
        defaultTitle: 'Extra Block',
        sortOrder: 0,
      });
    expect(blockRes.status).toBe(201);

    const planRes = await request(app)
      .post('/api/schedule-builder/week-plans')
      .set('x-test-user-email', adminEmail)
      .send({
        skeletonId,
        weekNumber: 2,
        weekStartDate: seed.weekStart,
        status: 'draft',
      });
    expect(planRes.status).toBe(201);

    const publishRes = await request(app)
      .patch(`/api/schedule-builder/week-plans/${planRes.body.id}`)
      .set('x-test-user-email', adminEmail)
      .send({ status: 'published' });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('published');
  });

  it('P0-3: parent my-week-plans returns published only', async () => {
    const res = await request(app)
      .get(`/api/schedule-builder/parent/my-week-plans?weekStart=${seed.weekStart}`)
      .set('x-test-user-email', seed.parent.email);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/i);
    expect(Array.isArray(res.body.children)).toBe(true);
    expect(res.body.children.length).toBe(2);
    for (const entry of res.body.children) {
      expect(entry.weekPlan).toBeTruthy();
      expect(entry.weekPlan.status).toBe('published');
    }
  });

  it('P0-4: parent 403 on POST /week-plans', async () => {
    const res = await request(app)
      .post('/api/schedule-builder/week-plans')
      .set('x-test-user-email', seed.parent.email)
      .send({
        skeletonId: seed.skeletons.seekersId,
        weekNumber: 3,
        weekStartDate: seed.weekStart,
        status: 'draft',
      });
    expect(res.status).toBe(403);
  });

  it('P0-5: cross-school admin 403 on other school week plan', async () => {
    const uid = nanoid(6).toLowerCase();
    const otherAdmin = await testDb.createTestUser({
      email: `other_admin_${uid}@test.com`,
      username: `otheradmin_${uid}`,
      name: 'Other Admin',
      role: 'schoolAdmin',
    });
    const otherSchool = await testDb.createTestSchool(otherAdmin.id, {
      name: `Other School ${uid}`,
      registrationCode: `OT${uid.toUpperCase()}`,
    });
    await storage.updateUser(otherAdmin.id, { schoolId: otherSchool.id });
    const db = await getDb();
    await db.insert(userRoles).values({
      userId: otherAdmin.id,
      role: 'schoolAdmin',
      schoolId: otherSchool.id,
      isPrimary: true,
    });

    const res = await request(app)
      .patch(`/api/schedule-builder/week-plans/${seed.weekPlans.seekersPublishedId}`)
      .set('x-test-user-email', otherAdmin.email)
      .send({ notes: 'hijack' });
    expect(res.status).toBe(403);
  });

  it('P0-6: unauthenticated 401', async () => {
    const res = await request(app).get('/api/schedule-builder/skeletons');
    expect(res.status).toBe(401);
  });

  it('P0-7: markBlockCompleted sets isCompleted / completedAt', async () => {
    const res = await request(app)
      .post(`/api/schedule-builder/week-plan-blocks/${seed.blocks.yankeeIncompleteId}/complete`)
      .set('x-test-user-email', seed.admin.email);
    expect(res.status).toBe(200);
    expect(res.body.isCompleted).toBe(true);
    expect(res.body.completedAt).toBeTruthy();
  });

  it('F1: parent sees only Seekers + Yankee enrolled class sections', async () => {
    const res = await request(app)
      .get(`/api/schedule-builder/parent/my-week-plans?weekStart=${seed.weekStart}`)
      .set('x-test-user-email', seed.parent.email);
    expect(res.status).toBe(200);
    const classIds = res.body.children.map((c: any) => c.classId).sort();
    expect(classIds).toEqual([seed.classes.seekers.id, seed.classes.yankee.id].sort());
  });

  it('F2: session-only enrollment (no class ids) yields empty class section', async () => {
    const uid = nanoid(4);
    const child = await testDb.createTestChild(seed.parent.id, {
      firstName: 'SessionOnly',
      lastName: `Kid${uid}`,
      gradeLevel: '2nd',
      schoolId: seed.school.id,
      parentEmail: seed.parent.email,
    });
    const db = await getDb();
    await db.insert(programEnrollments).values({
      classType: 'marketplace',
      parentId: seed.parent.id,
      parentEmail: seed.parent.email,
      schoolId: seed.school.id,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      className: 'Session only',
      status: 'active',
      paymentPlan: 'full_payment',
      paymentSystemVersion: 'v2_stripe',
      paymentStatus: 'paid',
      totalCost: 0,
      totalPaid: 0,
      remainingBalance: 0,
      depositRequired: 0,
      enrollmentDate: new Date(),
      marketplaceClassId: null,
      classId: null,
    });

    const res = await request(app)
      .get(`/api/schedule-builder/parent/my-week-plans?weekStart=${seed.weekStart}`)
      .set('x-test-user-email', seed.parent.email);
    expect(res.status).toBe(200);
    const forChild = res.body.children.filter((c: any) => c.childId === child.id);
    expect(forChild.length).toBe(0);
  });

  it('week-plan CSV import maps default_title and updates matched slots', async () => {
    const csvApp = buildScheduleCsvTestApp();
    const adminEmail = seed.admin.email;
    const weekPlanId = seed.weekPlans.seekersDraftId;
    // Seed seekers skeleton block is Monday 09:00 — template-shaped CSV (default_title)
    const csv = [
      'day_of_week,start_time,end_time,block_type,default_title,subject_area,sort_order',
      'Monday,09:00,10:00,curriculum,Imported Nature Lab,Science,0',
    ].join('\n');

    const mapping = JSON.stringify({
      day_of_week: 'day_of_week',
      start_time: 'start_time',
      end_time: 'end_time',
      block_type: 'block_type',
      title: 'default_title',
    });

    const res = await request(csvApp)
      .post(`/api/schedule-builder/week-plans/${weekPlanId}/blocks/import-csv`)
      .set('x-test-user-email', adminEmail)
      .field('mapping', mapping)
      .attach('file', Buffer.from(csv, 'utf-8'), 'week-blocks.csv');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updated).toBe(1);

    const blocks = await storage.getWeekPlanBlocksByWeekPlanId(weekPlanId);
    expect(blocks.some((b: any) => b.title === 'Imported Nature Lab')).toBe(true);
  });

  it('week-plan CSV import returns clear error when day/time does not match template', async () => {
    const csvApp = buildScheduleCsvTestApp();
    const adminEmail = seed.admin.email;
    const weekPlanId = seed.weekPlans.seekersDraftId;
    const csv = [
      'day_of_week,start_time,title',
      'Friday,15:00,No Such Slot',
    ].join('\n');

    const res = await request(csvApp)
      .post(`/api/schedule-builder/week-plans/${weekPlanId}/blocks/import-csv`)
      .set('x-test-user-email', adminEmail)
      .attach('file', Buffer.from(csv, 'utf-8'), 'bad-slots.csv');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Validation errors/i);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toMatch(/No weekly template block matches/i);
  });
});
