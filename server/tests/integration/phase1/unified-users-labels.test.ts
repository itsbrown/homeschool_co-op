import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { describeIntegration } from '../../helpers/integrationDb';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { getDb } from '../../../db';
import { userRoles } from '@shared/schema';

describeIntegration('Integration: Unified users labels', () => {
  let testSchool: any;
  let testAdmin: any;
  let testParent: any;
  let testLocations: any[];

  beforeAll(async () => {
    await testDb.cleanup();
    const env = await testDb.setupTestEnvironment();
    testSchool = env.school;
    testAdmin = env.admin;
    testParent = env.parent;
    testLocations = env.locations;

    const db = await getDb();
    await db.insert(userRoles).values({
      userId: testParent.id,
      role: 'educator',
      schoolId: testSchool.id,
      isPrimary: false,
    });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('returns labels array on school-admin users list', async () => {
    await api.loginAsUser(testAdmin.email);
    const response = await api.get('/api/school-admin/users');
    expect(response.status).toBe(200);
    const parentRow = response.body.find((u: any) => u.id === testParent.id);
    expect(parentRow).toBeDefined();
    expect(Array.isArray(parentRow.labels)).toBe(true);
    expect(parentRow.labels.map((l: string) => l.toLowerCase())).toEqual(
      expect.arrayContaining(['parent', 'educator']),
    );
  });

  it('loads staff profile by users.id via school-admin', async () => {
    await api.loginAsUser(testAdmin.email);
    const response = await api.get(`/api/school-admin/staff/${testParent.id}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(testParent.id);
    expect(response.body.email).toBe(testParent.email);
  });

  it('PUT staff keeps parent role when the person is also a Mentor', async () => {
    const mentorParent = await testDb.createTestUser({
      email: 'leigh-ann-staff-edit@test.com',
      username: 'leighannstaffedit',
      name: 'Leigh Ann Staff Edit',
      role: 'parent',
    });
    const db = await getDb();
    await db.insert(userRoles).values([
      {
        userId: mentorParent.id,
        role: 'parent',
        schoolId: testSchool.id,
        isPrimary: false,
      },
      {
        userId: mentorParent.id,
        role: 'Mentor',
        schoolId: testSchool.id,
        isPrimary: true,
      },
    ]);

    await api.loginAsUser(testAdmin.email);
    const getResponse = await api.get(`/api/school-admin/staff/${mentorParent.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.role).toBe('Mentor');

    const putResponse = await api.put(`/api/school-admin/staff/${mentorParent.id}`, {
      name: 'Leigh Ann Staff Edit',
      email: mentorParent.email,
      phone: '5853306391',
      role: 'Mentor',
      locationId: testLocations[0].id,
    });
    expect(putResponse.status).toBe(200);
    expect(putResponse.body.staff?.role).toBe('Mentor');

    const roles = await db.select().from(userRoles);
    const hers = roles.filter((r) => r.userId === mentorParent.id).map((r) => r.role);
    expect(hers.sort()).toEqual(['Mentor', 'parent']);
  });

  it('sends role broadcast to users with matching user_roles label', async () => {
    const parentOnly = await testDb.createTestUser({
      email: 'parent-only-labels@test.com',
      username: 'parentonlylabels',
      name: 'Parent Only',
      role: 'parent',
    });
    const db = await getDb();
    await db.insert(userRoles).values({
      userId: parentOnly.id,
      role: 'parent',
      schoolId: testSchool.id,
      isPrimary: true,
    });

    await api.loginAsUser(testAdmin.email);
    const response = await api.post('/api/notifications/broadcast', {
      schoolId: testSchool.id,
      targetRole: 'parent',
      title: 'Labels parent broadcast',
      message: 'Hello parents via user_roles',
    });

    expect(response.status).toBe(200);
    expect(response.body.sentCount).toBeGreaterThanOrEqual(2);
  });
});
