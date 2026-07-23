/**
 * Contract: every nav registry item has a required key; API samples map to keys.
 * Aggregation scenarios via shared pure functions (no DB required for this file).
 */
import { describe, it, expect } from '@jest/globals';
import {
  NAV_REGISTRY,
  NAV_API_SAMPLES,
  NAV_GROUP_PERMISSIONS,
  aggregateEffectivePermissions,
  canAccessPath,
  filterNavRegistry,
  LOCATION_PERMISSION_KEYS,
} from '@shared/permissions';

describe('permissions nav-api contract', () => {
  it('every NAV_REGISTRY item has unique href and valid required key', () => {
    const hrefs = new Set<string>();
    for (const item of NAV_REGISTRY) {
      expect(item.href.startsWith('/')).toBe(true);
      expect(hrefs.has(item.href)).toBe(false);
      hrefs.add(item.href);
      expect(
        LOCATION_PERMISSION_KEYS.includes(item.required as any) ||
          item.required === 'canAccessEntireSchool',
      ).toBe(true);
      expect(NAV_GROUP_PERMISSIONS[item.group]).toBeTruthy();
    }
  });

  it('NAV_API_SAMPLES cover core capability keys', () => {
    const keys = new Set(NAV_API_SAMPLES.map((s) => s.required));
    expect(keys.has('canViewReports')).toBe(true);
    expect(keys.has('canManageStaff')).toBe(true);
    expect(keys.has('canManageStudents')).toBe(true);
    expect(keys.has('canManageClasses')).toBe(true);
    expect(keys.has('canSendNotifications')).toBe(true);
  });

  it('finance_only persona sees Finance paths only among gated samples', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true, canViewReports: true }],
    });
    const visible = filterNavRegistry(effective);
    expect(visible.every((v) => v.group === 'Finance')).toBe(true);
    expect(canAccessPath(effective, '/school-admin/financial-reports')).toBe(true);
    expect(canAccessPath(effective, '/schools/staff')).toBe(false);
  });

  it('regional manager school-wide grant unlocks Finance + Academics across scope', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true }],
      schoolWideGrant: {
        isActive: true,
        canViewReports: true,
        canManageClasses: true,
      },
    });
    expect(effective.canAccessEntireSchool).toBe(true);
    expect(canAccessPath(effective, '/school-admin/financial-reports')).toBe(true);
    expect(canAccessPath(effective, '/schools/schedule-builder')).toBe(true);
    expect(canAccessPath(effective, '/schools/staff')).toBe(false);
  });

  it('inactive grants do not unlock paths', () => {
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [
        { locationId: 1, isActive: false, canViewReports: true, canManageStaff: true },
      ],
    });
    expect(filterNavRegistry(effective)).toHaveLength(0);
  });
});
