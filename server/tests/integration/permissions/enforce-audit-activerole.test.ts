/**
 * Enforce-mode 403, permission_update audit, and X-Active-Role fail-closed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { eq, and, desc } from 'drizzle-orm';
import request from 'supertest';
import { describeIntegration } from '../../helpers/integrationDb';
import { api } from '../../helpers/apiHelpers';
import { seedPermissionScenario } from '../../helpers/permissionFixtures';
import { testDb } from '../../helpers/testDatabase';
import { storage } from '../../../storage';
import { getDb } from '../../../db';
import { auditLogs } from '../../../../shared/schema';
import { getSimpleTestApp } from '../../../simple-test-app';

describeIntegration('Integration: permissions enforce, audit, active-role', () => {
  const prevEnforcement = process.env.PERMISSIONS_ENFORCEMENT;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    if (prevEnforcement === undefined) delete process.env.PERMISSIONS_ENFORCEMENT;
    else process.env.PERMISSIONS_ENFORCEMENT = prevEnforcement;
    await testDb.cleanup();
  });

  beforeEach(() => {
    process.env.PERMISSIONS_ENFORCEMENT = 'enforce';
  });

  afterEach(() => {
    process.env.PERMISSIONS_ENFORCEMENT = prevEnforcement ?? 'observe';
  });

  it('finance_only staff gets 403 on /staff when enforce is on', async () => {
    const { actor } = await seedPermissionScenario('finance_only_staff');
    await api.loginAsUser(actor.email);

    const response = await api.get('/api/school-admin/staff');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(response.body.permission).toBe('canManageStaff');
  });

  it('finance_only staff can still hit financial metrics when enforce is on', async () => {
    const { actor } = await seedPermissionScenario('finance_only_staff');
    await api.loginAsUser(actor.email);

    const response = await api.get('/api/school-admin/metrics/financial');
    expect(response.status).not.toBe(403);
  });

  it('PATCH user-locations writes permission_update audit log', async () => {
    const { admin, actor, loc1, school } = await seedPermissionScenario('academics_only_staff');
    await api.loginAsUser(admin.email);

    const locations = await storage.getUserLocationsByUserId(actor.id);
    const ul = locations.find((row) => row.locationId === loc1.id);
    expect(ul).toBeTruthy();

    const patch = await api.patch(`/api/school-admin/user-locations/${ul!.id}`, {
      canManageClasses: true,
      canViewReports: true,
    });
    expect(patch.status).toBeLessThan(400);

    const db = await getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.schoolId, school.id),
          eq(auditLogs.actionType, 'permission_update'),
          eq(auditLogs.targetId, String(ul!.id)),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(5);

    expect(logs.length).toBeGreaterThan(0);
  });

  it('X-Active-Role=parent fails closed for school-admin staff list', async () => {
    const { admin } = await seedPermissionScenario('full_school_admin');
    await api.loginAsUser(admin.email);

    const asAdmin = await api.get('/api/school-admin/staff');
    expect(asAdmin.status).not.toBe(403);

    const expressApp = await getSimpleTestApp();
    const withParentRole = await request(expressApp)
      .get('/api/school-admin/staff')
      .set('x-test-user-email', admin.email)
      .set('X-Active-Role', 'parent');

    expect(withParentRole.status).toBe(403);
  });
});
