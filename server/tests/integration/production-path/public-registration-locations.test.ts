import { beforeAll, expect, it } from '@jest/globals';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { seedRegistrationScenario } from '../../helpers/seedRegistrationScenario';
import { TestDatabase } from '../../helpers/testDatabase';
import { PUBLIC_REGISTRATION_LOCATIONS_PATH } from '../../../lib/registration-public-locations';

describeProductionPath('production-path: public registration locations', () => {
  const http = getProductionPathHttp();

  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  it('returns active campuses for the registration school only', async () => {
    const seed = await seedRegistrationScenario();
    const res = await http.get(PUBLIC_REGISTRATION_LOCATIONS_PATH, {
      schoolId: seed.registrationSchool.id,
    });

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((l) => l.name).sort();
    expect(names).toEqual(['Brighton', 'Greece']);
    expect(names).not.toContain('Main Campus');
    expect(names).not.toContain('Orphan Campus');
  });

  it('resolves campuses by registration code (same school as schoolId lookup)', async () => {
    const seed = await seedRegistrationScenario();
    const res = await http.get(PUBLIC_REGISTRATION_LOCATIONS_PATH, {
      code: seed.registrationCode,
    });

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((l) => l.name).sort();
    expect(names).toEqual(['Brighton', 'Greece']);
  });

  it('returns empty array when school has no locations (no Main Campus auto-seed)', async () => {
    const testDb = new TestDatabase();
    const admin = await testDb.createTestUser({ role: 'schoolAdmin' });
    const emptySchool = await testDb.createTestSchool(admin.id, {
      registrationCode: `EMPTY${Date.now()}`,
      status: 'active',
    });

    const res = await http.get(PUBLIC_REGISTRATION_LOCATIONS_PATH, {
      schoolId: emptySchool.id,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('does not return locations from a different school', async () => {
    const seed = await seedRegistrationScenario();
    const res = await http.get(PUBLIC_REGISTRATION_LOCATIONS_PATH, {
      schoolId: seed.registrationSchool.id,
    });

    const ids = (res.body as { id: number }[]).map((l) => l.id);
    expect(ids).not.toContain(seed.locationOnWrongSchool.id);
  });
});
