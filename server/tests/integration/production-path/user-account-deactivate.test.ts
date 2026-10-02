import { beforeAll, expect, it } from '@jest/globals';
import request from 'supertest';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { testDb } from '../../helpers/testDatabase';
import { storage } from '../../../storage';
import { excludeInactiveUserIds } from '../../../lib/active-notification-recipients';
import { getDb } from '../../../db';
import { payments } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getSimpleTestApp } from '../../../simple-test-app';
import { UserSyncService } from '../../../services/userSyncService';

describeProductionPath('production-path: school user deactivate', () => {
  const http = getProductionPathHttp();

  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  it('deactivates and reactivates a parent without deleting children or payments', async () => {
    const admin = await testDb.createTestUser({
      role: 'schoolAdmin',
      email: `deactivate_admin_${Date.now()}@test.com`,
      name: 'Deactivate Admin',
    });
    const school = await testDb.createTestSchool(admin.id, { name: 'Deactivate School' });
    await storage.updateUser(admin.id, { schoolId: school.id });

    const parent = await testDb.createTestUser({
      role: 'parent',
      email: `deactivate_parent_${Date.now()}@test.com`,
      name: 'Left Family Parent',
      schoolId: school.id,
    });
    const child = await testDb.createTestChild(parent.id, {
      schoolId: school.id,
      firstName: 'Kept',
      lastName: 'Child',
    });
    const db = await getDb();
    const [payment] = await db
      .insert(payments)
      .values({
        schoolId: school.id,
        parentId: parent.id,
        parentEmail: parent.email,
        amount: 1500,
        description: 'Kept payment history',
        status: 'completed',
        paymentMethod: 'cash',
      })
      .returning();

    http.setTestUserEmail(admin.email);

    const deactivated = await http.put(`/api/school-admin/users/${parent.id}/deactivate`, {});
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.user.isActive).toBe(false);
    expect(deactivated.body.user.password).toBeUndefined();

    const afterDeactivate = await storage.getUser(parent.id);
    expect(afterDeactivate?.isActive).toBe(false);
    const children = await storage.getChildrenByParentId(parent.id);
    expect(children.map((c) => c.id)).toContain(child.id);
    const [keptPayment] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(keptPayment?.amount).toBe(1500);
    expect(keptPayment?.parentId).toBe(parent.id);

    const recipientIds = await excludeInactiveUserIds([admin.id, parent.id]);
    expect(recipientIds).toEqual([admin.id]);

    const blocked = await http.put(`/api/school-admin/users/${admin.id}/deactivate`, {});
    expect(blocked.status).toBe(400);

    const reactivated = await http.put(`/api/school-admin/users/${parent.id}/reactivate`, {});
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.user.isActive).toBe(true);
    const afterReactivate = await storage.getUser(parent.id);
    expect(afterReactivate?.isActive).toBe(true);
    const childrenAfter = await storage.getChildrenByParentId(parent.id);
    expect(childrenAfter.map((c) => c.id)).toContain(child.id);
  });

  it('returns 403 from jwtCheck on /api/children for a deactivated parent', async () => {
    const parent = await testDb.createTestUser({
      role: 'parent',
      email: `inactive_children_${Date.now()}@test.com`,
      name: 'Inactive Parent',
      isActive: false,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Kept',
      lastName: 'Child',
    });

    const app = await getSimpleTestApp();
    const blocked = await request(app)
      .get('/api/children')
      .set('x-test-user-email', parent.email);
    expect(blocked.status).toBe(403);
    expect(String(blocked.body.message || '')).toMatch(/inactive/i);

    const parentRoute = await request(app)
      .get('/api/parent/children')
      .set('x-test-user-email', parent.email);
    expect(parentRoute.status).toBe(403);
    expect(String(parentRoute.body.message || '')).toMatch(/inactive/i);

    const stillThere = await storage.getChildrenByParentId(parent.id);
    expect(stillThere.map((c) => c.id)).toContain(child.id);

    const synced = await UserSyncService.syncAuth0User({
      email: parent.email,
      id: `supabase-${parent.id}`,
    });
    expect(synced.isActive).toBe(false);
    const afterSync = await storage.getUser(parent.id);
    expect(afterSync?.isActive).toBe(false);

    const active = await testDb.createTestUser({
      role: 'parent',
      email: `active_children_${Date.now()}@test.com`,
      name: 'Active Parent',
    });
    const allowed = await request(app)
      .get('/api/children')
      .set('x-test-user-email', active.email);
    expect(allowed.status).toBe(200);
  });
});
