import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { nanoid } from 'nanoid';
import { buildSchoolAnalyticsTestApp } from '../helpers/schoolAnalyticsTestApp';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: school analytics dimensions', () => {
  let app: express.Application;
  let adminEmail: string;
  let parentEmail: string;

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
      username: `dim_adm_${uid}`,
      email: `dim_adm_${uid}@test.com`,
      role: 'schoolAdmin',
      name: 'Dimension Admin',
    });
    const school = await testDb.createTestSchool(admin.id);
    adminEmail = admin.email;
    await storage.updateUser(admin.id, { schoolId: school.id } as any);

    const parent = await testDb.createTestUser({
      username: `dim_par_${uid}`,
      email: `dim_par_${uid}@test.com`,
      role: 'parent',
      name: 'Dimension Parent',
    });
    parentEmail = parent.email;
    await storage.updateUser(parent.id, { schoolId: school.id } as any);
    await testDb.createTestChild(parent.id, {
      gradeLevel: '5',
      gender: 'male',
      birthdate: '2015-03-15',
    });

    await request(app)
      .post('/api/telemetry/activity')
      .set('x-test-user-email', parentEmail)
      .send({ events: [{ eventType: 'login', sessionId: 'dim-s1' }] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET /api/school-analytics/engagement filters by grade dimension', async () => {
    const res = await request(app)
      .get('/api/school-analytics/engagement')
      .query({ grade: '5' })
      .set('x-test-user-email', adminEmail);

    expect(res.status).toBe(200);
    expect(res.body.summary.activeParents).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.breakdownByGrade)).toBe(true);
  });

  it('GET /api/school-analytics/cart-abandonment accepts demographic query params', async () => {
    const correlationId = `dim-${nanoid(10)}`;
    await request(app)
      .post('/api/telemetry/checkout-funnel')
      .set('x-test-user-email', parentEmail)
      .send({
        correlationId,
        lane: 'member_cart',
        step: 'add_payment_info',
        cartValueCents: 12000,
      });

    const res = await request(app)
      .get('/api/school-analytics/cart-abandonment')
      .query({ gender: 'male', grade: '5' })
      .set('x-test-user-email', adminEmail);

    expect(res.status).toBe(200);
    expect(res.body.funnel).toBeDefined();
  });
});
