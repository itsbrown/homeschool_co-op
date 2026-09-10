import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

/**
 * Super-admin School Edit toggles PUT /api/superadmin/schools/:id/features.
 * Handlers lived in superadmin-schools.ts but were never mounted — Express 404 HTML.
 */
describe('production-path: superadmin school features mount', () => {
  it('registers GET and PUT /schools/:schoolId/features in routes.ts', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../routes.ts'), 'utf8');
    const getFeatures = src.indexOf("app.get('/api/superadmin/schools/:schoolId/features'");
    const putFeatures = src.indexOf("app.put('/api/superadmin/schools/:schoolId/features'");
    const getSchool = src.indexOf("app.get('/api/superadmin/schools/:schoolId'");
    expect(getFeatures).toBeGreaterThan(-1);
    expect(putFeatures).toBeGreaterThan(-1);
    expect(getSchool).toBeGreaterThan(-1);
    expect(getFeatures).toBeLessThan(getSchool);
    expect(putFeatures).toBeLessThan(getSchool);
  });
});
