jest.mock('@supabase/supabase-js', () => {
  const { supabaseJsMockFactory } = require('../../helpers/supabaseAuthMock');
  return supabaseJsMockFactory();
});

import { beforeAll, expect, it } from '@jest/globals';
import { describeProductionPath } from '../../helpers/describeProductionPath';
import { getProductionPathHttp } from '../../helpers/productionPathHttp';
import { assertPostgresStorageForProductionPath } from '../../helpers/productionPathApp';
import { seedRegistrationScenario } from '../../helpers/seedRegistrationScenario';
import { seedOrphanSupabaseAuthUser } from '../../helpers/supabaseAuthMock';

describeProductionPath('production-path: register blocks orphan Supabase auth', () => {
  const http = getProductionPathHttp();

  beforeAll(async () => {
    await assertPostgresStorageForProductionPath();
  });

  it('returns AUTH_EMAIL_EXISTS when Supabase has user but Postgres does not', async () => {
    const seed = await seedRegistrationScenario();
    const orphanEmail = `orphan_${Date.now()}@test.com`;
    seedOrphanSupabaseAuthUser(orphanEmail);

    const res = await http.post('/api/auth/register', {
      email: orphanEmail,
      password: 'SecurePass123!',
      parentFirstName: 'Orphan',
      parentLastName: 'Test',
      phone: '5555550100',
      location: String(seed.locationsOnSchool[0].id),
      schoolId: seed.registrationSchool.id,
      registrationCode: seed.registrationCode,
      role: 'parent',
      children: [
        {
          firstName: 'Kid',
          lastName: 'One',
          birthdate: '2016-05-01',
          gradeLevel: '1st Grade',
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('AUTH_EMAIL_EXISTS');
    expect(res.body.source).toBe('supabase_auth');
  });
});
