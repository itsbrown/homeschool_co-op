jest.mock('@supabase/supabase-js', () => {
  const { supabaseJsMockFactory } = require('../../helpers/supabaseAuthMock');
  return supabaseJsMockFactory();
});

import { beforeAll, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { seedRegistrationScenario } from '../../helpers/seedRegistrationScenario';
import { getDb } from '../../../db';
import { storage } from '../../../storage';
import { userLocations, userRoles, users } from '@shared/schema';

describeProductionPath('production-path: school-code parent register', () => {
  const http = getProductionPathHttp();

  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  it('creates Postgres user, role, school association, and child via POST /api/auth/register', async () => {
    const seed = await seedRegistrationScenario();
    const email = `newparent_${Date.now()}@test.com`;

    const res = await http.post('/api/auth/register', {
      email,
      password: 'SecurePass123!',
      parentFirstName: 'New',
      parentLastName: 'Parent',
      phone: '5555550199',
      location: String(seed.locationsOnSchool[0].id),
      schoolId: seed.registrationSchool.id,
      registrationCode: seed.registrationCode,
      role: 'parent',
      children: [
        {
          firstName: 'Student',
          lastName: 'One',
          birthdate: '2015-03-10',
          gradeLevel: '3rd Grade',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await storage.getUserByEmail(email);
    expect(user).toBeDefined();
    expect(user!.schoolId).toBe(seed.registrationSchool.id);
    expect(user!.supabaseId).toBeTruthy();

    const db = await getDb();
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, user!.id));
    expect(roles.length).toBeGreaterThanOrEqual(1);
    expect(roles.some((r) => r.role === 'parent' && r.schoolId === seed.registrationSchool.id)).toBe(
      true,
    );

    const updated = await db.select().from(users).where(eq(users.id, user!.id)).limit(1);
    expect(updated[0]?.activeRoleId).toBeTruthy();

    const children = await storage.getChildrenByParentId(user!.id);
    expect(children.length).toBe(1);
    expect(children[0].firstName).toBe('Student');

    const campusId = seed.locationsOnSchool[0].id;
    expect(updated[0]?.locationId).toBe(campusId);
    expect(children[0].locationId).toBe(campusId);

    const userLocs = await db
      .select()
      .from(userLocations)
      .where(eq(userLocations.userId, user!.id));
    expect(userLocs.some((ul) => ul.locationId === campusId && ul.isActive)).toBe(true);
  });

  it('rejects school signup without a campus location', async () => {
    const seed = await seedRegistrationScenario();
    const email = `noloc_${Date.now()}@test.com`;

    const res = await http.post('/api/auth/register', {
      email,
      password: 'SecurePass123!',
      parentFirstName: 'No',
      parentLastName: 'Location',
      phone: '5555550100',
      schoolId: seed.registrationSchool.id,
      registrationCode: seed.registrationCode,
      role: 'parent',
      children: [
        {
          firstName: 'Kid',
          lastName: 'One',
          birthdate: '2015-03-10',
          gradeLevel: '3rd Grade',
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/campus location/i);
    const user = await storage.getUserByEmail(email);
    expect(user).toBeUndefined();
  });
});
