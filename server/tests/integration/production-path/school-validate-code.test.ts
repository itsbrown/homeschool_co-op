import { beforeAll, expect, it } from '@jest/globals';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { seedRegistrationScenario } from '../../helpers/seedRegistrationScenario';

describeProductionPath('production-path: school validate-code', () => {
  const http = getProductionPathHttp();

  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  it('returns school id and name for a valid registration code', async () => {
    const seed = await seedRegistrationScenario();
    const res = await http.get(`/api/schools/validate-code/${seed.registrationCode}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(seed.registrationSchool.id);
    expect(res.body.name).toBe(seed.registrationSchool.name);
    expect(res.body.code).toBe(seed.registrationCode);
  });

  it('returns 404 for unknown registration code', async () => {
    const res = await http.get('/api/schools/validate-code/NOTAREALCODE99');
    expect(res.status).toBe(404);
  });
});
