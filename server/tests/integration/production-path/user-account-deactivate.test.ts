import { beforeAll, expect, it } from '@jest/globals';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { testDb } from '../../helpers/testDatabase';
import { storage } from '../../../storage';
import { excludeInactiveUserIds } from '../../../lib/active-notification-recipients';
import { getDb } from '../../../db';
import { payments } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
});
