/**
 * Production-path: parent campus must be persisted (user_locations + users.location_id)
 * before signup children are created; registration aborts if persist fails.
 */

jest.mock('@supabase/supabase-js', () => {
  const { supabaseJsMockFactory } = require('../../helpers/supabaseAuthMock');
  return supabaseJsMockFactory();
});

import { afterEach, beforeAll, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { seedRegistrationScenario } from '../../helpers/seedRegistrationScenario';
import { getDb } from '../../../db';
import { storage } from '../../../storage';
import { children, schoolStudents, userLocations, users } from '@shared/schema';

describeProductionPath('production-path: registration location persist', () => {
  const http = getProductionPathHttp();

  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes user_locations and users.location_id before createChild runs', async () => {
    const seed = await seedRegistrationScenario();
    const campusId = seed.locationsOnSchool[1].id;
    const email = `locorder_${Date.now()}@test.com`;

    const persistOrder: string[] = [];
    const boundCreateUserLocation = storage.createUserLocation.bind(storage);
    const boundUpdateUser = storage.updateUser.bind(storage);
    const boundCreateChild = storage.createChild.bind(storage);

    jest.spyOn(storage, 'createUserLocation').mockImplementation(async (row) => {
      persistOrder.push('createUserLocation');
      return boundCreateUserLocation(row);
    });

    jest.spyOn(storage, 'updateUser').mockImplementation(async (id, patch) => {
      if (patch && 'locationId' in patch && patch.locationId != null) {
        persistOrder.push('updateUser.locationId');
      }
      return boundUpdateUser(id, patch);
    });

    jest.spyOn(storage, 'createChild').mockImplementation(async (row) => {
      persistOrder.push('createChild');
      const parentId = row.parentId as number;
      const parentRow = await storage.getUser(parentId);
      expect(parentRow?.locationId).toBe(campusId);

      const db = await getDb();
      const locRows = await db
        .select()
        .from(userLocations)
        .where(eq(userLocations.userId, parentId));
      expect(
        locRows.some((ul) => ul.locationId === campusId && ul.isActive !== false),
      ).toBe(true);

      return boundCreateChild(row);
    });

    const res = await http.post('/api/auth/register', {
      email,
      password: 'SecurePass123!',
      parentFirstName: 'Order',
      parentLastName: 'Test',
      phone: '5555550111',
      location: String(campusId),
      schoolId: seed.registrationSchool.id,
      registrationCode: seed.registrationCode,
      role: 'parent',
      children: [
        {
          firstName: 'Child',
          lastName: 'One',
          birthdate: '2014-06-01',
          gradeLevel: '4th Grade',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(persistOrder).toContain('createUserLocation');
    expect(persistOrder).toContain('updateUser.locationId');
    expect(persistOrder).toContain('createChild');
    const childIdx = persistOrder.indexOf('createChild');
    expect(persistOrder.indexOf('createUserLocation')).toBeLessThan(childIdx);
    expect(persistOrder.indexOf('updateUser.locationId')).toBeLessThan(childIdx);
  });

  it('sets school_students.location_id to the selected campus', async () => {
    const seed = await seedRegistrationScenario();
    const campusId = seed.locationsOnSchool[0].id;
    const email = `schstu_${Date.now()}@test.com`;

    const res = await http.post('/api/auth/register', {
      email,
      password: 'SecurePass123!',
      parentFirstName: 'School',
      parentLastName: 'Student',
      phone: '5555550112',
      location: String(campusId),
      schoolId: seed.registrationSchool.id,
      registrationCode: seed.registrationCode,
      role: 'parent',
      children: [
        {
          firstName: 'Linked',
          lastName: 'Child',
          birthdate: '2013-01-01',
          gradeLevel: '5th Grade',
        },
      ],
    });

    expect(res.status).toBe(200);
    const user = await storage.getUserByEmail(email);
    expect(user).toBeDefined();
    const childRows = await storage.getChildrenByParentId(user!.id);
    expect(childRows[0].locationId).toBe(campusId);

    const db = await getDb();
    const ss = await db
      .select()
      .from(schoolStudents)
      .where(eq(schoolStudents.childId, childRows[0].id));
    expect(ss.some((r) => r.locationId === campusId)).toBe(true);
  });

  it('rejects campus from a different school', async () => {
    const seed = await seedRegistrationScenario();
    const email = `wrongloc_${Date.now()}@test.com`;

    const res = await http.post('/api/auth/register', {
      email,
      password: 'SecurePass123!',
      parentFirstName: 'Wrong',
      parentLastName: 'Campus',
      phone: '5555550113',
      location: String(seed.locationOnWrongSchool.id),
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
    expect(res.body.message).toMatch(/not valid for this school/i);
    expect(await storage.getUserByEmail(email)).toBeUndefined();

    const db = await getDb();
    const childByEmail = await db.select().from(children).where(eq(children.parentEmail, email));
    expect(childByEmail).toHaveLength(0);
  });

  it('rolls back account when user_locations insert fails', async () => {
    const seed = await seedRegistrationScenario();
    const email = `ulfail_${Date.now()}@test.com`;

    jest.spyOn(storage, 'createUserLocation').mockRejectedValueOnce(
      new Error('simulated user_locations failure'),
    );

    const res = await http.post('/api/auth/register', {
      email,
      password: 'SecurePass123!',
      parentFirstName: 'Fail',
      parentLastName: 'Persist',
      phone: '5555550114',
      location: String(seed.locationsOnSchool[0].id),
      schoolId: seed.registrationSchool.id,
      registrationCode: seed.registrationCode,
      role: 'parent',
      children: [
        {
          firstName: 'Never',
          lastName: 'Created',
          birthdate: '2015-03-10',
          gradeLevel: '3rd Grade',
        },
      ],
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/campus location/i);
    expect(await storage.getUserByEmail(email)).toBeUndefined();

    const db = await getDb();
    const childRows = await db.select().from(children).where(eq(children.parentEmail, email));
    expect(childRows).toHaveLength(0);
  });

  it('rolls back account when users.location_id update fails', async () => {
    const seed = await seedRegistrationScenario();
    const email = `locupd_${Date.now()}@test.com`;

    const boundUpdateUser = storage.updateUser.bind(storage);
    jest.spyOn(storage, 'updateUser').mockImplementation(async (id, patch) => {
      if (patch && 'locationId' in patch && patch.locationId != null) {
        throw new Error('simulated users.location_id failure');
      }
      return boundUpdateUser(id, patch);
    });

    const res = await http.post('/api/auth/register', {
      email,
      password: 'SecurePass123!',
      parentFirstName: 'Fail',
      parentLastName: 'Update',
      phone: '5555550115',
      location: String(seed.locationsOnSchool[0].id),
      schoolId: seed.registrationSchool.id,
      registrationCode: seed.registrationCode,
      role: 'parent',
      children: [
        {
          firstName: 'Also',
          lastName: 'Never',
          birthdate: '2015-03-10',
          gradeLevel: '3rd Grade',
        },
      ],
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/campus location/i);
    expect(await storage.getUserByEmail(email)).toBeUndefined();

    const db = await getDb();
    const childRows = await db.select().from(children).where(eq(children.parentEmail, email));
    expect(childRows).toHaveLength(0);
    const userRow = await db.select().from(users).where(eq(users.email, email));
    expect(userRow).toHaveLength(0);
  });
});
