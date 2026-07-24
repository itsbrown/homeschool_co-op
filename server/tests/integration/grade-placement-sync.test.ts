import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import schoolAdminRouter from '../../api/school-admin';
import testRouter from '../../api/test';
import { buildStaffTestApp } from '../helpers/staffTestApp';
import { testDb } from '../helpers/testDatabase';
import { storage } from '../../storage';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: grade placement sync', () => {
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
      .post('/api/test/setup-grade-placement-scenario')
      .set('X-Test-Token', 'test-secret-token')
      .send({});
    expect(res.status).toBe(200);
    seed = res.body.data;
  });

  it('places session-paid matching student and blocks unpaid control', async () => {
    expect(seed.syncResult.placed).toBeGreaterThanOrEqual(1);

    const preview = await request(app)
      .get(`/api/school-admin/classes/${seed.class.id}/grade-placement-preview`)
      .set('x-test-user-email', seed.admin.email);
    expect(preview.status).toBe(200);
    expect(preview.body.results.some((r: any) => r.childId === seed.children.paid.id)).toBe(true);
    expect(
      preview.body.results.some(
        (r: any) =>
          r.childId === seed.children.unpaid.id && r.reasonCode === 'unpaid_session',
      ),
    ).toBe(true);

    const roster = await request(app)
      .get(`/api/school-admin/classes/${seed.class.id}/roster`)
      .set('x-test-user-email', seed.admin.email);
    expect(roster.status).toBe(200);
    const ids = roster.body.students.map((s: any) => s.id);
    expect(ids).toContain(seed.children.paid.id);
    expect(ids).not.toContain(seed.children.unpaid.id);
    const paidRow = roster.body.students.find((s: any) => s.id === seed.children.paid.id);
    expect(paidRow.placementSource).toBe('grade');
  });

  it('re-sync is idempotent and does not remove paid seats', async () => {
    const first = await request(app)
      .post(`/api/school-admin/classes/${seed.class.id}/sync-grade-placements`)
      .set('x-test-user-email', seed.admin.email);
    expect(first.status).toBe(200);
    expect(first.body.alreadyPlaced + first.body.placed).toBeGreaterThanOrEqual(1);

    const second = await request(app)
      .post(`/api/school-admin/classes/${seed.class.id}/sync-grade-placements`)
      .set('x-test-user-email', seed.admin.email);
    expect(second.status).toBe(200);
    expect(second.body.alreadyPlaced).toBeGreaterThanOrEqual(1);

    const enrollments = await storage.getEnrollmentsByChildIds([seed.children.paid.id]);
    const sessionTuition = enrollments.find(
      (e: any) => e.id === seed.sessionEnrollments.paidId,
    );
    expect(sessionTuition).toBeTruthy();
    expect(sessionTuition.status).toBe('enrolled');
    expect(sessionTuition.placementSource == null || sessionTuition.placementSource !== 'grade').toBe(
      true,
    );
  });
});
