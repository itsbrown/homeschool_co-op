import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import schoolAdminRouter from '../../api/school-admin';
import testRouter from '../../api/test';
import { buildStaffTestApp } from '../helpers/staffTestApp';
import { testDb } from '../helpers/testDatabase';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: school-admin attendance summary', () => {
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
      { path: '/api/school-admin', router: schoolAdminRouter },
    ]);
    await testDb.cleanup();
    const res = await request(app)
      .post('/api/test/setup-schedule-builder-scenario')
      .set('X-Test-Token', 'test-secret-token')
      .send({});
    expect(res.status).toBe(200);
    seed = res.body.data;
  });

  it('A1: /attendance/summary date filter aggregates seeded session', async () => {
    const inRange = await request(app)
      .get(`/api/school-admin/attendance/summary?startDate=${seed.weekStart}&endDate=${seed.weekStart}`)
      .set('x-test-user-email', seed.admin.email);
    expect(inRange.status).toBe(200);
    expect(inRange.body.totalSessions).toBeGreaterThanOrEqual(1);
    expect(inRange.body.overallAttendanceRate).toBe(100);

    const outOfRange = await request(app)
      .get('/api/school-admin/attendance/summary?startDate=2000-01-01&endDate=2000-01-02')
      .set('x-test-user-email', seed.admin.email);
    expect(outOfRange.status).toBe(200);
    expect(outOfRange.body.totalSessions).toBe(0);
  });
});
