import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { sql } from 'drizzle-orm';
import progressRouter from '../../api/progress';
import scheduleBuilderRouter from '../../api/schedule-builder';
import testRouter from '../../api/test';
import { buildStaffTestApp } from '../helpers/staffTestApp';
import { testDb } from '../helpers/testDatabase';
import { getDb } from '../../db';

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: progress scheduled-lessons', () => {
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
      { path: '/api/progress', router: progressRouter },
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

  it('L1: returns completed + incomplete scheduled lessons for enrolled child', async () => {
    const childId = seed.children.seekers.id;
    const res = await request(app)
      .get(`/api/progress/parent/${childId}/scheduled-lessons`)
      .set('x-test-user-email', seed.parent.email);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.lessons)).toBe(true);
    expect(res.body.lessons.length).toBeGreaterThanOrEqual(1);
    const completed = res.body.lessons.find((l: any) => l.blockId === seed.blocks.seekersCompletedId);
    expect(completed?.isCompleted).toBe(true);
    expect(completed?.title).toContain('Seekers');
  });

  it('L2: block complete does not create student_progress_log', async () => {
    const db = await getDb();
    const before = await db.execute(sql`SELECT count(*)::int AS c FROM student_progress_log`);
    const beforeCount = Number((before as any).rows?.[0]?.c ?? (before as any)[0]?.c ?? 0);

    const complete = await request(app)
      .post(`/api/schedule-builder/week-plan-blocks/${seed.blocks.yankeeIncompleteId}/complete`)
      .set('x-test-user-email', seed.admin.email);
    expect(complete.status).toBe(200);

    const after = await db.execute(sql`SELECT count(*)::int AS c FROM student_progress_log`);
    const afterCount = Number((after as any).rows?.[0]?.c ?? (after as any)[0]?.c ?? 0);
    expect(afterCount).toBe(beforeCount);
  });
});
