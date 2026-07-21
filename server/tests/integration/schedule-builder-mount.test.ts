import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import scheduleBuilderRouter from '../../api/schedule-builder';
import { buildStaffTestApp } from '../helpers/staffTestApp';

/**
 * P0-1: schedule-builder must return JSON (not SPA HTML) when unauthenticated,
 * and Vite/static catch-alls must skip /api/*.
 */
describe('Integration: schedule-builder mount smoke', () => {
  it('GET /api/schedule-builder/skeletons returns JSON 401 (not HTML)', async () => {
    const app = buildStaffTestApp([{ path: '/api/schedule-builder', router: scheduleBuilderRouter }]);
    const res = await request(app).get('/api/schedule-builder/skeletons');
    expect(res.headers['content-type'] || '').toMatch(/json/i);
    expect(res.status).toBe(401);
    expect(typeof res.body).toBe('object');
  });

  it('vite.ts SPA catch-alls skip /api/*', () => {
    const vitePath = path.resolve(__dirname, '../../vite.ts');
    const src = fs.readFileSync(vitePath, 'utf8');
    const skipCount = (src.match(/startsWith\("\/api\/"\)/g) || []).length;
    expect(skipCount).toBeGreaterThanOrEqual(2);
  });
});
