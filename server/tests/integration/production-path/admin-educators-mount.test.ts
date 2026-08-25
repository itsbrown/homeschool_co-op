import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import adminEducatorsRouter from '../../../api/admin-educators';
import { buildStaffTestApp } from '../../helpers/staffTestApp';

/**
 * Edit Class "Add lead mentor" posts to /api/admin/educators/class-assignments.
 * The handlers lived in admin-educators.ts but were never mounted — Express 404 HTML.
 */
describe('production-path: admin-educators mount', () => {
  it('mounts /api/admin/educators before the /api/admin catch-all in routes.ts', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../routes.ts'), 'utf8');
    const educatorsMount = src.indexOf('app.use("/api/admin/educators"');
    // Trailing semicolon so comment mentions of the catch-all are ignored.
    const adminCatchAll = src.indexOf('app.use("/api/admin", adminRouter);');
    expect(educatorsMount).toBeGreaterThan(-1);
    expect(adminCatchAll).toBeGreaterThan(-1);
    expect(educatorsMount).toBeLessThan(adminCatchAll);
  });

  it('registers GET /class-assignments/:classId before GET /:educatorId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../api/admin-educators.ts'), 'utf8');
    const assignmentsGet = src.indexOf("router.get('/class-assignments/:classId'");
    const educatorGet = src.search(/router\.get\('\/:educatorId/);
    expect(assignmentsGet).toBeGreaterThan(-1);
    expect(educatorGet).toBeGreaterThan(-1);
    expect(assignmentsGet).toBeLessThan(educatorGet);
  });

  it('POST /api/admin/educators/class-assignments returns JSON 401, not HTML 404', async () => {
    const app = buildStaffTestApp([
      { path: '/api/admin/educators', router: adminEducatorsRouter },
    ]);
    const res = await request(app)
      .post('/api/admin/educators/class-assignments')
      .send({ educatorId: 1, classId: 66, isPrimary: true });
    expect(res.headers['content-type'] || '').toMatch(/json/i);
    expect(res.status).toBe(401);
    expect(res.text).not.toMatch(/Cannot POST/i);
  });
});
