/**
 * Access-scope middleware: attach effective permissions + requirePermission.
 * Uses PERMISSIONS_ENFORCEMENT env: off | observe | enforce (default observe).
 */
import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { resolveSchoolIdForUser } from '../lib/resolve-school-id';
import {
  aggregateEffectivePermissions,
  getPermissionsEnforcementMode,
  hasPermission,
  isLocationInScope,
  type EffectivePermissions,
  type PermissionKey,
  type PermissionsEnforcementMode,
} from '@shared/permissions';

export type AccessScope = EffectivePermissions & {
  schoolId: number | null;
  mode: PermissionsEnforcementMode;
};

declare global {
  namespace Express {
    interface Request {
      accessScope?: AccessScope;
    }
  }
}

function enforcementMode(): PermissionsEnforcementMode {
  return getPermissionsEnforcementMode(process.env.PERMISSIONS_ENFORCEMENT);
}

/**
 * Resolve and attach req.accessScope from user_locations + user_school_permissions.
 * Safe to call after supabaseAuth. Fail-closed on errors (empty grants).
 */
export async function attachAccessScope(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      req.accessScope = {
        ...aggregateEffectivePermissions({ activeRole: '' }),
        schoolId: null,
        mode: enforcementMode(),
      };
      return next();
    }

    const dbUser = await storage.getUser(userId);
    const activeRole =
      (req.headers['x-active-role'] as string) ||
      req.user?.role ||
      dbUser?.activeRole ||
      dbUser?.role ||
      '';
    const allRoles: string[] =
      (req.user as { allRoles?: string[] })?.allRoles ||
      (dbUser?.role ? [dbUser.role] : []);

    let schoolId: number | null = null;
    if (dbUser) {
      schoolId = await resolveSchoolIdForUser(dbUser);
    }

    const locationRows = await storage.getUserLocationsByUserId(userId);
    const locationGrants = locationRows.map((ul) => ({
      locationId: ul.locationId,
      isActive: ul.isActive,
      accessLevel: ul.accessLevel,
      canViewReports: ul.canViewReports,
      canManageStaff: ul.canManageStaff,
      canManageClasses: ul.canManageClasses,
      canManageStudents: ul.canManageStudents,
      canSendNotifications: ul.canSendNotifications,
      canViewParentContacts: ul.canViewParentContacts,
    }));

    let schoolWideGrant = null;
    if (schoolId != null) {
      const schoolPerm = await storage.getUserSchoolPermissionByUserAndSchool(
        userId,
        schoolId,
      );
      if (schoolPerm) {
        schoolWideGrant = {
          isActive: schoolPerm.isActive,
          accessLevel: schoolPerm.accessLevel,
          canViewReports: schoolPerm.canViewReports,
          canManageStaff: schoolPerm.canManageStaff,
          canManageClasses: schoolPerm.canManageClasses,
          canManageStudents: schoolPerm.canManageStudents,
          canSendNotifications: schoolPerm.canSendNotifications,
          canViewParentContacts: schoolPerm.canViewParentContacts,
        };
      }
    }

    const effective = aggregateEffectivePermissions({
      activeRole,
      allRoles,
      locationGrants,
      schoolWideGrant,
    });

    req.accessScope = {
      ...effective,
      schoolId,
      mode: enforcementMode(),
    };
    next();
  } catch (error) {
    console.error('[attachAccessScope] failed — fail closed:', error);
    req.accessScope = {
      ...aggregateEffectivePermissions({ activeRole: '' }),
      schoolId: null,
      mode: enforcementMode(),
    };
    next();
  }
}

function logWouldDeny(
  req: Request,
  permission: PermissionKey,
  reason: string,
): void {
  console.warn(
    JSON.stringify({
      level: 'WARN',
      tag: '[Permissions][observe]',
      userId: req.user?.id,
      permission,
      path: req.path,
      schoolId: req.accessScope?.schoolId,
      mode: req.accessScope?.mode,
      reason,
    }),
  );
}

/**
 * Require a capability. Honors PERMISSIONS_ENFORCEMENT.
 * Must run after attachAccessScope (or will attach lazily).
 */
export function requirePermission(permission: PermissionKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.accessScope) {
      await attachAccessScope(req, res, () => undefined);
    }

    const scope = req.accessScope!;
    const mode = scope.mode;

    if (mode === 'off') {
      return next();
    }

    const allowed = hasPermission(scope, permission);
    if (allowed) {
      return next();
    }

    if (mode === 'observe') {
      logWouldDeny(req, permission, 'missing_permission');
      return next();
    }

    return res.status(403).json({
      error: 'Access denied',
      message: `Insufficient permission: ${permission}`,
      code: 'PERMISSION_DENIED',
      permission,
    });
  };
}

/**
 * Require target locationId (params/body/query) to be in accessibleLocationIds
 * unless canAccessEntireSchool.
 */
export function requireLocationInScope(locationIdSource: 'params' | 'body' | 'query' = 'params') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.accessScope) {
      await attachAccessScope(req, res, () => undefined);
    }
    const scope = req.accessScope!;
    const mode = scope.mode;
    if (mode === 'off') {
      return next();
    }

    const raw =
      locationIdSource === 'params'
        ? req.params.locationId
        : locationIdSource === 'body'
          ? (req.body as { locationId?: number })?.locationId
          : (req.query.locationId as string | undefined);

    const locationId = raw != null ? parseInt(String(raw), 10) : NaN;
    if (Number.isNaN(locationId)) {
      if (mode === 'observe') {
        logWouldDeny(req, 'canAccessEntireSchool', 'missing_location_id');
        return next();
      }
      return res.status(400).json({ error: 'Invalid or missing location ID' });
    }

    if (isLocationInScope(scope, locationId)) {
      return next();
    }

    if (mode === 'observe') {
      logWouldDeny(req, 'canAccessEntireSchool', `location_${locationId}_out_of_scope`);
      return next();
    }

    return res.status(403).json({
      error: 'Access denied',
      message: 'Location is outside your assigned access scope',
      code: 'LOCATION_SCOPE_DENIED',
      locationId,
    });
  };
}

/** Helper for list queries: return location IDs to filter, or null if school-wide. */
export function locationFilterIds(scope: AccessScope | undefined): number[] | null {
  if (!scope || scope.canAccessEntireSchool || scope.isSchoolAdminBypass) {
    return null;
  }
  return scope.accessibleLocationIds;
}
