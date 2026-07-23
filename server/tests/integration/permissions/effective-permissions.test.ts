import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { describeIntegration } from '../../helpers/integrationDb';
import { api } from '../../helpers/apiHelpers';
import { seedPermissionScenario } from '../../helpers/permissionFixtures';
import { testDb } from '../../helpers/testDatabase';
import { aggregateEffectivePermissions } from '@shared/permissions';

describeIntegration('Integration: permissions effective aggregation', () => {
  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('my-permissions OR-aggregates multi_loc_split', async () => {
    const { actor } = await seedPermissionScenario('multi_loc_split');
    await api.loginAsUser(actor.email);

    const response = await api.get('/api/school-admin/user-locations/my-permissions');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body.userLocations.length).toBeGreaterThanOrEqual(2);

    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: body.userLocations.map((ul: any) => ({
        locationId: ul.locationId,
        isActive: ul.isActive,
        accessLevel: ul.accessLevel,
        ...ul.permissions,
      })),
      schoolWideGrant: body.schoolWide
        ? { isActive: body.schoolWide.isActive, accessLevel: body.schoolWide.accessLevel, ...body.schoolWide.permissions }
        : null,
    });
    expect(effective.flags.canViewReports).toBe(true);
    expect(effective.flags.canManageClasses).toBe(true);
  });

  it('regional_manager has canAccessEntireSchool via schoolWide', async () => {
    const { actor } = await seedPermissionScenario('regional_manager');
    await api.loginAsUser(actor.email);
    const response = await api.get('/api/school-admin/user-locations/my-permissions');
    expect(response.status).toBe(200);
    expect(response.body.schoolWide).toBeTruthy();
    expect(response.body.schoolWide.permissions.canViewReports).toBe(true);
  });
});
