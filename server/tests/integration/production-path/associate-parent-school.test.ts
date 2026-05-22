import { beforeAll, expect, it } from '@jest/globals';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { seedRegistrationScenario } from '../../helpers/seedRegistrationScenario';
import { associateParentWithSchool } from '../../../lib/associate-parent-school';
import { TestDatabase } from '../../helpers/testDatabase';
import { storage } from '../../../storage';

describeProductionPath('production-path: associateParentWithSchool', () => {
  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  it('updates users.school_id via storage (no HTTP loopback)', async () => {
    const seed = await seedRegistrationScenario();
    const testDb = new TestDatabase();
    const parent = await testDb.createTestUser({
      email: `assoc_parent_${Date.now()}@test.com`,
      role: 'parent',
      schoolId: seed.wrongSchool.id,
    });

    const result = await associateParentWithSchool(parent.email, seed.registrationSchool.id);
    expect(result.schoolId).toBe(seed.registrationSchool.id);

    const updated = await storage.getUser(parent.id);
    expect(updated?.schoolId).toBe(seed.registrationSchool.id);
  });
});
