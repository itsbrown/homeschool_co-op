import { beforeAll, expect, it } from '@jest/globals';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { seedRegistrationScenario } from '../../helpers/seedRegistrationScenario';
import { storage } from '../../../storage';

describeProductionPath('production-path: location school context', () => {
  const http = getProductionPathHttp();

  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  it('creates location on registration school when admin users.school_id is misaligned', async () => {
    const seed = await seedRegistrationScenario();
    http.setTestUserEmail(seed.admin.email);

    const res = await http.post('/api/locations', {
      schoolId: seed.registrationSchool.id,
      name: 'Rochester Campus',
      address: '100 Main St',
      city: 'Rochester',
      state: 'NY',
      zipCode: '14604',
    });

    expect(res.status).toBe(201);
    expect(res.body.schoolId).toBe(seed.registrationSchool.id);
    expect(res.body.name).toBe('Rochester Campus');

    const fromDb = await storage.getLocationById(res.body.id);
    expect(fromDb?.schoolId).toBe(seed.registrationSchool.id);
  });

  it('lists locations for resolved admin school via GET /api/locations', async () => {
    const seed = await seedRegistrationScenario();
    http.setTestUserEmail(seed.admin.email);

    const res = await http.get('/api/locations', {
      schoolId: seed.registrationSchool.id,
    });

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((l) => l.name);
    expect(names).toContain('Brighton');
    expect(names).toContain('Greece');
    expect(names).not.toContain('Orphan Campus');
  });
});
