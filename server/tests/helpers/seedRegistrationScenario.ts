import { nanoid } from 'nanoid';
import { storage } from '../../storage';
import { TestDatabase } from './testDatabase';
import type { Location, School, User } from '../../../shared/schema';

export type RegistrationScenarioSeed = {
  registrationCode: string;
  registrationSchool: School;
  wrongSchool: School;
  admin: User;
  adminPassword: string;
  locationsOnSchool: Location[];
  locationOnWrongSchool: Location;
};

/**
 * Seeds the misaligned admin fixture from production incidents:
 * schools.admin_id → registration school, users.school_id → wrong school.
 */
export async function seedRegistrationScenario(
  testDb: TestDatabase = new TestDatabase(),
): Promise<RegistrationScenarioSeed> {
  const uniqueId = nanoid(8).toUpperCase();
  const registrationCode = `REG${uniqueId}`;

  const adminPassword = 'TestPassword123!';
  const admin = await testDb.createTestUser({
    email: `reg_admin_${uniqueId.toLowerCase()}@test.com`,
    username: `regadmin_${uniqueId.toLowerCase()}`,
    name: 'Registration Path Admin',
    role: 'schoolAdmin',
  });

  const registrationSchool = await testDb.createTestSchool(admin.id, {
    name: `Registration School ${uniqueId}`,
    registrationCode,
    status: 'active',
  });

  const otherAdmin = await testDb.createTestUser({
    email: `reg_other_admin_${uniqueId.toLowerCase()}@test.com`,
    username: `regother_${uniqueId.toLowerCase()}`,
    name: 'Other School Admin',
    role: 'schoolAdmin',
  });
  const wrongSchool = await testDb.createTestSchool(otherAdmin.id, {
    name: `Wrong School ${uniqueId}`,
    registrationCode: `WRONG${uniqueId}`,
    status: 'active',
  });

  await storage.updateUser(admin.id, { schoolId: wrongSchool.id });

  const brighton = await testDb.createTestLocation(registrationSchool.id, {
    name: 'Brighton',
    code: 'BRIG',
    isActive: true,
  });
  const greece = await testDb.createTestLocation(registrationSchool.id, {
    name: 'Greece',
    code: 'GREC',
    isActive: true,
  });
  const locationOnWrongSchool = await testDb.createTestLocation(wrongSchool.id, {
    name: 'Orphan Campus',
    code: 'ORPH',
    isActive: true,
  });

  const adminRow = await storage.getUser(admin.id);
  if (!adminRow || adminRow.schoolId !== wrongSchool.id) {
    throw new Error('seedRegistrationScenario: admin school_id misalignment not applied');
  }

  return {
    registrationCode,
    registrationSchool,
    wrongSchool,
    admin,
    adminPassword,
    locationsOnSchool: [brighton, greece],
    locationOnWrongSchool,
  };
}
