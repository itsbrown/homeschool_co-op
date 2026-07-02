import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { nanoid } from 'nanoid';
import { buildSchoolAnalyticsTestApp } from '../helpers/schoolAnalyticsTestApp';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: progress analytics school', () => {
  let app: express.Application;
  let adminEmail: string;
  let parentEmail: string;
  let childId: number;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    app = buildSchoolAnalyticsTestApp();
    await testDb.cleanup();

    const uid = nanoid(8).toLowerCase();
    const admin = await testDb.createTestUser({
      username: `prog_adm_${uid}`,
      email: `prog_adm_${uid}@test.com`,
      role: 'schoolAdmin',
      name: 'Progress Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Progress School ${uid}`,
      registrationCode: `PS${uid.toUpperCase().slice(0, 4)}`,
    });
    adminEmail = admin.email;
    await storage.updateUser(admin.id, { schoolId: school.id } as any);

    const parent = await testDb.createTestUser({
      username: `prog_par_${uid}`,
      email: `prog_par_${uid}@test.com`,
      role: 'parent',
      name: 'Progress Parent',
    });
    parentEmail = parent.email;
    await storage.updateUser(parent.id, { schoolId: school.id } as any);
    const child = await testDb.createTestChild(parent.id, { gradeLevel: '4' });
    childId = child.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET /api/progress/analytics/school returns literacy aggregates', async () => {
    const res = await request(app)
      .get('/api/progress/analytics/school')
      .set('x-test-user-email', adminEmail);

    expect(res.status).toBe(200);
    expect(res.body.schoolYear).toBeTruthy();
    expect(Array.isArray(res.body.cohortTrend)).toBe(true);
    expect(Array.isArray(res.body.proficiencyBands)).toBe(true);
    expect(res.body.headline).toBeDefined();
  });

  it('GET /api/progress/analytics/child/:childId allows parent scoping', async () => {
    const res = await request(app)
      .get(`/api/progress/analytics/child/${childId}`)
      .set('x-test-user-email', parentEmail);

    expect(res.status).toBe(200);
    expect(res.body.child.id).toBe(childId);
    expect(res.body.reading).toBeDefined();
    expect(res.body.math).toBeDefined();
  });

  it('GET /api/progress/analytics/child/:childId forbids other parents', async () => {
    const otherUid = nanoid(6);
    const other = await testDb.createTestUser({
      username: `other_${otherUid}`,
      email: `other_${otherUid}@test.com`,
      role: 'parent',
      name: 'Other Parent',
    });

    const res = await request(app)
      .get(`/api/progress/analytics/child/${childId}`)
      .set('x-test-user-email', other.email);

    expect(res.status).toBe(403);
  });
});
