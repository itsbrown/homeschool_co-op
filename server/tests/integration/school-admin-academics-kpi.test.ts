import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import schoolAdminRouter from '../../api/school-admin';
import testRouter from '../../api/test';
import { buildStaffTestApp } from '../helpers/staffTestApp';
import { testDb } from '../helpers/testDatabase';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: school-admin academics KPI', () => {
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

  it('K1: lesson completion % matches seeded blocks (1/2 = 50%)', async () => {
    const res = await request(app)
      .get(`/api/school-admin/academics/kpi?startDate=${seed.weekStart}&endDate=${seed.weekStart}`)
      .set('x-test-user-email', seed.admin.email);
    expect(res.status).toBe(200);
    expect(res.body.lesson.totalBlocks).toBe(2);
    expect(res.body.lesson.completedBlocks).toBe(1);
    expect(res.body.lesson.completionPercent).toBe(50);
    expect(res.body.lesson.incomplete.some((i: any) => i.blockId === seed.blocks.yankeeIncompleteId)).toBe(
      true,
    );
  });

  it('K2: KPI attendance rate consistent with /attendance/summary', async () => {
    const kpi = await request(app)
      .get(`/api/school-admin/academics/kpi?startDate=${seed.weekStart}&endDate=${seed.weekStart}`)
      .set('x-test-user-email', seed.admin.email);
    const summary = await request(app)
      .get(`/api/school-admin/attendance/summary?startDate=${seed.weekStart}&endDate=${seed.weekStart}`)
      .set('x-test-user-email', seed.admin.email);
    expect(kpi.status).toBe(200);
    expect(summary.status).toBe(200);
    expect(kpi.body.attendance.overallAttendanceRate).toBe(summary.body.overallAttendanceRate);
    expect(kpi.body.attendance.totalSessions).toBe(summary.body.totalSessions);
  });

  it('K3: parent 403 on KPI + attendance summary', async () => {
    const kpi = await request(app)
      .get('/api/school-admin/academics/kpi')
      .set('x-test-user-email', seed.parent.email);
    const summary = await request(app)
      .get('/api/school-admin/attendance/summary')
      .set('x-test-user-email', seed.parent.email);
    expect(kpi.status).toBe(403);
    expect(summary.status).toBe(403);
  });
});
