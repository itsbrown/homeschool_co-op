/**
 * Unit tests for shared/permissions.ts — aggregation, nav visibility, fail-closed.
 */
import {
  aggregateEffectivePermissions,
  canAccessPath,
  canShowNavGroup,
  canShowNavItem,
  EMPTY_PERMISSION_FLAGS,
  filterNavRegistry,
  getPermissionsEnforcementMode,
  hasPermission,
  isLocationInScope,
  legacyCanCreateClassesAllowed,
  NAV_API_SAMPLES,
  NAV_REGISTRY,
  LOCATION_PERMISSION_KEYS,
} from '../permissions';

describe('aggregateEffectivePermissions', () => {
  it('fail closed: no grants → all false', () => {
    const effective = aggregateEffectivePermissions({ activeRole: 'educator' });
    expect(effective.flags).toEqual(EMPTY_PERMISSION_FLAGS);
    expect(effective.canAccessEntireSchool).toBe(false);
    expect(effective.showAdminNavGroups).toBe(false);
    expect(effective.accessibleLocationIds).toEqual([]);
  });

  it('schoolAdmin activeRole → full bypass', () => {
    const effective = aggregateEffectivePermissions({ activeRole: 'schoolAdmin' });
    expect(effective.showAdminNavGroups).toBe(true);
    expect(effective.canAccessEntireSchool).toBe(true);
    expect(effective.flags.canViewReports).toBe(true);
  });

  it('director activeRole → full bypass', () => {
    const effective = aggregateEffectivePermissions({ activeRole: 'director' });
    expect(effective.showAdminNavGroups).toBe(true);
    expect(effective.isSchoolAdminBypass).toBe(true);
  });

  it('parent activeRole ignores held schoolAdmin in allRoles for nav', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'parent',
      allRoles: ['parent', 'schoolAdmin'],
      locationGrants: [
        {
          locationId: 1,
          isActive: true,
          canManageClasses: true,
        },
      ],
    });
    expect(effective.showAdminNavGroups).toBe(false);
    expect(effective.flags.canManageClasses).toBe(true);
  });

  it('OR-aggregates across locations (not first only)', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [
        { locationId: 1, isActive: true, canViewReports: false, canManageClasses: false },
        { locationId: 2, isActive: true, canViewReports: true, canManageClasses: false },
      ],
    });
    expect(effective.flags.canViewReports).toBe(true);
    expect(effective.accessibleLocationIds).toEqual([1, 2]);
  });

  it('ignores inactive location rows', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [
        { locationId: 1, isActive: false, canManageClasses: true },
        { locationId: 2, isActive: true, canManageStudents: true },
      ],
    });
    expect(effective.flags.canManageClasses).toBe(false);
    expect(effective.flags.canManageStudents).toBe(true);
    expect(effective.accessibleLocationIds).toEqual([2]);
  });

  it('school-wide grant ⇒ canAccessEntireSchool and OR flags', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canManageClasses: true }],
      schoolWideGrant: {
        isActive: true,
        canViewReports: true,
        canManageStudents: true,
      },
    });
    expect(effective.canAccessEntireSchool).toBe(true);
    expect(effective.flags.canViewReports).toBe(true);
    expect(effective.flags.canManageClasses).toBe(true);
    expect(effective.flags.canManageStudents).toBe(true);
  });

  it('accessLevel admin on location grants all flags for that grant', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, accessLevel: 'admin' }],
    });
    expect(effective.flags.canViewReports).toBe(true);
    expect(effective.flags.canManageStaff).toBe(true);
    expect(effective.canAccessEntireSchool).toBe(false);
  });
});

describe('nav registry', () => {
  it('every registry item has required key and href', () => {
    for (const item of NAV_REGISTRY) {
      expect(item.href).toMatch(/^\//);
      expect(item.required).toBeTruthy();
      expect(item.group).toBeTruthy();
    }
  });

  it('NAV_API_SAMPLES cover all location permission keys used by samples', () => {
    const keys = new Set(NAV_API_SAMPLES.map((s) => s.required));
    expect(keys.has('canViewReports')).toBe(true);
    expect(keys.has('canManageStaff')).toBe(true);
    expect(keys.has('canManageStudents')).toBe(true);
    expect(keys.has('canManageClasses')).toBe(true);
    expect(keys.has('canSendNotifications')).toBe(true);
  });

  it('filters nav by flags for staff', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canViewReports: true }],
    });
    expect(canShowNavGroup(effective, 'Finance')).toBe(true);
    expect(canShowNavGroup(effective, 'People')).toBe(false);
    const visible = filterNavRegistry(effective);
    expect(visible.every((i) => i.required === 'canViewReports' || hasPermission(effective, i.required))).toBe(
      true,
    );
    expect(visible.some((i) => i.href === '/school-admin/financial-reports')).toBe(true);
    expect(visible.some((i) => i.href === '/schools/staff')).toBe(false);
  });

  it('schoolAdmin sees all nav items', () => {
    const effective = aggregateEffectivePermissions({ activeRole: 'schoolAdmin' });
    expect(filterNavRegistry(effective).length).toBe(NAV_REGISTRY.length);
  });
});

describe('canAccessPath / isLocationInScope', () => {
  it('denies finance path without canViewReports', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canManageClasses: true }],
    });
    expect(canAccessPath(effective, '/school-admin/financial-reports')).toBe(false);
    expect(canAccessPath(effective, '/schools/schedule-builder')).toBe(true);
  });

  it('fail-closes unlisted staff deep links unless school-wide', () => {
    const locOnly = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canManageClasses: true }],
    });
    expect(canAccessPath(locOnly, '/schools/contact-import')).toBe(false);
    expect(canAccessPath(locOnly, '/school-admin/refunds')).toBe(false);

    const regional = aggregateEffectivePermissions({
      activeRole: 'educator',
      schoolWideGrant: { isActive: true, canManageClasses: true },
    });
    expect(canAccessPath(regional, '/schools/contact-import')).toBe(true);
  });

  it('maps bare school landings to My School permission', () => {
    const classesOnly = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canManageClasses: true }],
    });
    expect(canAccessPath(classesOnly, '/schools')).toBe(true);
    expect(canAccessPath(classesOnly, '/school-admin')).toBe(true);
    expect(canAccessPath(classesOnly, '/schools/dashboard')).toBe(true);

    const reportsOnly = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canViewReports: true }],
    });
    expect(canAccessPath(reportsOnly, '/schools')).toBe(false);
  });

  it('gates refunds and educators by matching registry permission', () => {
    const reportsOnly = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canViewReports: true }],
    });
    expect(canAccessPath(reportsOnly, '/school-admin/refunds')).toBe(true);
    expect(canAccessPath(reportsOnly, '/schools/educators')).toBe(false);

    const staffOnly = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canManageStaff: true }],
    });
    expect(canAccessPath(staffOnly, '/schools/educators')).toBe(true);
    expect(canAccessPath(staffOnly, '/school-admin/refunds')).toBe(false);
  });

  it('location scope respects school-wide', () => {
    const locOnly = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canManageStudents: true }],
    });
    expect(isLocationInScope(locOnly, 1)).toBe(true);
    expect(isLocationInScope(locOnly, 99)).toBe(false);

    const regional = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true }],
      schoolWideGrant: { isActive: true, canManageStudents: true },
    });
    expect(isLocationInScope(regional, 99)).toBe(true);
  });
});

describe('helpers', () => {
  it('getPermissionsEnforcementMode defaults to observe', () => {
    expect(getPermissionsEnforcementMode(undefined)).toBe('observe');
    expect(getPermissionsEnforcementMode('enforce')).toBe('enforce');
    expect(getPermissionsEnforcementMode('off')).toBe('off');
  });

  it('legacyCanCreateClasses maps to canManageClasses fail-closed', () => {
    const noGrant = aggregateEffectivePermissions({ activeRole: 'teacher' });
    expect(legacyCanCreateClassesAllowed(noGrant, { canCreateClasses: true })).toBe(false);
    expect(legacyCanCreateClassesAllowed(noGrant, { canCreateClasses: false })).toBe(false);

    const withGrant = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true, canManageClasses: true }],
    });
    expect(legacyCanCreateClassesAllowed(withGrant, { canCreateClasses: false })).toBe(true);
  });

  it('LOCATION_PERMISSION_KEYS has six flags', () => {
    expect(LOCATION_PERMISSION_KEYS).toHaveLength(6);
  });

  it('canShowNavItem respects required', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'educator',
      locationGrants: [{ locationId: 1, isActive: true, canSendNotifications: true }],
    });
    expect(
      canShowNavItem(effective, { required: 'canSendNotifications' }),
    ).toBe(true);
    expect(canShowNavItem(effective, { required: 'canManageStaff' })).toBe(false);
  });
});
