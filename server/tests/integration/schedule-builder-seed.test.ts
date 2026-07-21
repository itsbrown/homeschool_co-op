import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import testRouter from '../../api/test';
import { buildStaffTestApp } from '../helpers/staffTestApp';
import { testDb } from '../helpers/testDatabase';
import { storage } from '../../storage';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: setup-schedule-builder-scenario seed', () => {
  let app: ReturnType<typeof buildStaffTestApp>;

  beforeAll(async () => {
    await testDb.cleanup();
    app = buildStaffTestApp([{ path: '/api/test', router: testRouter }]);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('POST seed creates published plans, enrollments, and attendance (Postgres round-trip)', async () => {
    const res = await request(app)
      .post('/api/test/setup-schedule-builder-scenario')
      .set('X-Test-Token', 'test-secret-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.weekPlans?.seekersPublishedId).toBeGreaterThan(0);
    expect(res.body.data?.blocks?.seekersCompletedId).toBeGreaterThan(0);
    expect(res.body.data?.attendance?.sessionId).toBeGreaterThan(0);

    const published = await storage.getPublishedWeekPlansBySchool(res.body.data.school.id);
    expect(published.some((p) => p.id === res.body.data.weekPlans.seekersPublishedId)).toBe(true);

    const enroll = await storage.getEnrollmentById(res.body.data.enrollments.seekersId);
    expect(enroll?.marketplaceClassId).toBe(res.body.data.classes.seekers.id);
  });
});
