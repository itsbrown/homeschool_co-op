/**
 * Unit tests for requirePermission / locationFilterIds (no DB).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import {
  requirePermission,
  requireAnyPermission,
  locationFilterIds,
  type AccessScope,
} from '../../middleware/access-scope';
import { aggregateEffectivePermissions } from '@shared/permissions';

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as any;
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as any;
  return res as Response & { statusCode?: number; body?: unknown };
}

describe('requirePermission enforcement', () => {
  const prev = process.env.PERMISSIONS_ENFORCEMENT;

  afterEach(() => {
    if (prev === undefined) delete process.env.PERMISSIONS_ENFORCEMENT;
    else process.env.PERMISSIONS_ENFORCEMENT = prev;
  });

  it('returns 403 in enforce mode when permission missing', async () => {
    process.env.PERMISSIONS_ENFORCEMENT = 'enforce';
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true, canViewReports: true }],
    });
    const req = {
      accessScope: { ...effective, schoolId: 1, mode: 'enforce' } as AccessScope,
      user: { id: 9 },
      path: '/api/school-admin/staff',
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await requirePermission('canManageStaff')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.body as any).code).toBe('PERMISSION_DENIED');
  });

  it('calls next in observe mode when permission missing', async () => {
    process.env.PERMISSIONS_ENFORCEMENT = 'observe';
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true, canViewReports: true }],
    });
    const req = {
      accessScope: { ...effective, schoolId: 1, mode: 'observe' } as AccessScope,
      user: { id: 9 },
      path: '/api/school-admin/staff',
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await requirePermission('canManageStaff')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next when permission granted in enforce mode', async () => {
    process.env.PERMISSIONS_ENFORCEMENT = 'enforce';
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true, canManageStaff: true }],
    });
    const req = {
      accessScope: { ...effective, schoolId: 1, mode: 'enforce' } as AccessScope,
      user: { id: 9 },
      path: '/api/school-admin/staff',
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await requirePermission('canManageStaff')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('requireAnyPermission allows when any listed grant matches', async () => {
    process.env.PERMISSIONS_ENFORCEMENT = 'enforce';
    const effective = aggregateEffectivePermissions({
      activeRole: 'teacher',
      locationGrants: [{ locationId: 1, isActive: true, canSendNotifications: true }],
    });
    const req = {
      accessScope: { ...effective, schoolId: 1, mode: 'enforce' } as AccessScope,
      user: { id: 9 },
      path: '/api/school-admin/classes',
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await requireAnyPermission('canManageClasses', 'canSendNotifications')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('locationFilterIds', () => {
  it('returns null for school-wide or admin bypass', () => {
    const bypass = {
      ...aggregateEffectivePermissions({ activeRole: 'schoolAdmin' }),
      schoolId: 1,
      mode: 'enforce' as const,
    };
    expect(locationFilterIds(bypass)).toBeNull();

    const regional = {
      ...aggregateEffectivePermissions({
        activeRole: 'teacher',
        locationGrants: [{ locationId: 1, isActive: true }],
        schoolWideGrant: { isActive: true, canManageStudents: true },
      }),
      schoolId: 1,
      mode: 'enforce' as const,
    };
    expect(locationFilterIds(regional)).toBeNull();
  });

  it('returns accessibleLocationIds for location-scoped staff', () => {
    const scoped = {
      ...aggregateEffectivePermissions({
        activeRole: 'teacher',
        locationGrants: [
          { locationId: 10, isActive: true, canManageStudents: true },
          { locationId: 20, isActive: true, canManageClasses: true },
        ],
      }),
      schoolId: 1,
      mode: 'enforce' as const,
    };
    expect(locationFilterIds(scoped)).toEqual([10, 20]);
  });
});
