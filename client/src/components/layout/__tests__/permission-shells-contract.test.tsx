/**
 * Contract: all four permission-aware shells + guard consume useEffectivePermissions.
 * Nav visibility is covered by shared/permissions + SchoolRouteGuard tests; this
 * locks the wiring so shells cannot silently drop the hook.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

const SHELLS = [
  'components/layout/UnifiedSchoolAdminSidebar.tsx',
  'components/layout/ParentSidebar.tsx',
  'components/layout/ParentAppShell.tsx',
  'components/layout/EducatorAppShell.tsx',
  'components/auth/SchoolRouteGuard.tsx',
] as const;

describe('permission-aware shells contract', () => {
  it.each(SHELLS)('%s imports useEffectivePermissions', (rel) => {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(source).toMatch(/useEffectivePermissions/);
  });

  it('legacy Sidebar.tsx documents out-of-scope for permission nav', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'components/layout/Sidebar.tsx'),
      'utf8',
    );
    expect(source).toMatch(/LEGACY sidebar|out of scope/i);
    // Must not import the hook (comments may mention "effective-permissions")
    expect(source).not.toMatch(/from ['"]@\/hooks\/useEffectivePermissions['"]/);
  });
});

describe('nav filter personas (shell-facing)', () => {
  // Re-export shared filter behavior used by sidebars — keeps client suite green without DB
  const {
    aggregateEffectivePermissions,
    filterNavRegistry,
    canShowNavGroup,
  } = require('@shared/permissions');

  it('finance_only hides Staff group', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true, canViewReports: true }],
    });
    expect(canShowNavGroup(effective, 'Finance')).toBe(true);
    expect(canShowNavGroup(effective, 'Staff')).toBe(false);
    expect(filterNavRegistry(effective).every((i: { group: string }) => i.group === 'Finance')).toBe(
      true,
    );
  });

  it('schoolAdmin bypass shows all registry groups', () => {
    const effective = aggregateEffectivePermissions({ activeRole: 'schoolAdmin' });
    expect(effective.showAdminNavGroups).toBe(true);
    expect(filterNavRegistry(effective).length).toBeGreaterThan(5);
  });

  it('parent activeRole does not bypass even if allRoles includes schoolAdmin', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'parent',
      allRoles: ['parent', 'schoolAdmin'],
      locationGrants: [{ locationId: 1, isActive: true, canManageStaff: true }],
    });
    // Bypass is activeRole-based; parent should not get showAdminNavGroups
    expect(effective.showAdminNavGroups).toBe(false);
  });
});
