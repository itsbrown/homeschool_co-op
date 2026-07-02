import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { nanoid } from 'nanoid';
import { buildSchoolAnalyticsTestApp } from '../helpers/schoolAnalyticsTestApp';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: activity telemetry', () => {
  let app: express.Application;
  let parentEmail: string;
  let parentId: number;
  let adminEmail: string;

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
      username: `act_adm_${uid}`,
      email: `act_adm_${uid}@test.com`,
      role: 'schoolAdmin',
      name: 'Activity Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Activity School ${uid}`,
      registrationCode: `AS${uid.toUpperCase().slice(0, 4)}`,
    });
    adminEmail = admin.email;
    await storage.updateUser(admin.id, { schoolId: school.id } as any);

    const parent = await testDb.createTestUser({
      username: `act_par_${uid}`,
      email: `act_par_${uid}@test.com`,
      role: 'parent',
      name: 'Activity Parent',
    });
    parentEmail = parent.email;
    parentId = parent.id;
    await storage.updateUser(parent.id, { schoolId: school.id } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POST /api/telemetry/activity persists events and updates lastLogin on login', async () => {
    const before = await storage.getUser(parentId);
    const beforeLogin = before?.lastLogin;

    const res = await request(app)
      .post('/api/telemetry/activity')
      .set('x-test-user-email', parentEmail)
      .send({
        events: [
          { eventType: 'login', sessionId: 'sess-1' },
          { eventType: 'page_view', path: '/parent/home', sessionId: 'sess-1' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(2);

    const after = await storage.getUser(parentId);
    expect(after?.lastLogin).toBeTruthy();
    if (beforeLogin) {
      expect(new Date(after!.lastLogin!).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeLogin).getTime(),
      );
    }
  });

  it('GET /api/school-analytics/engagement returns headline metrics', async () => {
    await request(app)
      .post('/api/telemetry/activity')
      .set('x-test-user-email', parentEmail)
      .send({ events: [{ eventType: 'login', sessionId: 's1' }] });

    const res = await request(app)
      .get('/api/school-analytics/engagement')
      .set('x-test-user-email', adminEmail);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.activeParents).toBe('number');
    expect(Array.isArray(res.body.dailyTrend)).toBe(true);
    expect(Array.isArray(res.body.breakdownByGrade)).toBe(true);
  });
});
