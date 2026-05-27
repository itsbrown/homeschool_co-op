import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { userLocations, userSchoolPermissions, locations, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export type LocationPermission = 
  | 'canViewReports'
  | 'canManageStaff'
  | 'canManageClasses'
  | 'canManageStudents'
  | 'canSendNotifications'
  | 'canViewParentContacts';

interface CachedPermission {
  permissions: Record<LocationPermission, boolean>;
  accessLevel: string;
  expiresAt: number;
}

const permissionCache = new Map<string, CachedPermission>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(userId: number, locationId: number): string {
  return `loc:${userId}:${locationId}`;
}

function getSchoolCacheKey(userId: number, schoolId: number): string {
  return `school:${userId}:${schoolId}`;
}

function permissionsFromSchoolRow(row: {
  canViewReports: boolean;
  canManageStaff: boolean;
  canManageClasses: boolean;
  canManageStudents: boolean;
  canSendNotifications: boolean;
  canViewParentContacts: boolean;
  accessLevel: string;
}): { permissions: Record<LocationPermission, boolean>; accessLevel: string } {
  return {
    permissions: {
      canViewReports: row.canViewReports,
      canManageStaff: row.canManageStaff,
      canManageClasses: row.canManageClasses,
      canManageStudents: row.canManageStudents,
      canSendNotifications: row.canSendNotifications,
      canViewParentContacts: row.canViewParentContacts,
    },
    accessLevel: row.accessLevel,
  };
}

export async function getUserSchoolPermissions(
  userId: number,
  schoolId: number,
): Promise<{ permissions: Record<LocationPermission, boolean>; accessLevel: string } | null> {
  const cacheKey = getSchoolCacheKey(userId, schoolId);
  const cached = permissionCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return { permissions: cached.permissions, accessLevel: cached.accessLevel };
  }

  try {
    const db = await getDb();
    const result = await db
      .select()
      .from(userSchoolPermissions)
      .where(
        and(
          eq(userSchoolPermissions.userId, userId),
          eq(userSchoolPermissions.schoolId, schoolId),
          eq(userSchoolPermissions.isActive, true),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const parsed = permissionsFromSchoolRow(result[0]);
    permissionCache.set(cacheKey, {
      ...parsed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return parsed;
  } catch (error) {
    console.error('Error fetching school permissions:', error);
    return null;
  }
}

export async function getUserLocationPermissions(
  userId: number,
  locationId: number
): Promise<{ permissions: Record<LocationPermission, boolean>; accessLevel: string } | null> {
  const cacheKey = getCacheKey(userId, locationId);
  const cached = permissionCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return { permissions: cached.permissions, accessLevel: cached.accessLevel };
  }

  try {
    const db = await getDb();
    const result = await db.select()
      .from(userLocations)
      .where(and(
        eq(userLocations.userId, userId),
        eq(userLocations.locationId, locationId),
        eq(userLocations.isActive, true)
      ))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const parsed = permissionsFromSchoolRow(result[0]);
    permissionCache.set(cacheKey, {
      ...parsed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return parsed;
  } catch (error) {
    console.error('Error fetching location permissions:', error);
    return null;
  }
}

function hasPermissionInGrant(
  grant: { permissions: Record<LocationPermission, boolean>; accessLevel: string },
  permission: LocationPermission,
): boolean {
  if (grant.accessLevel === 'admin') {
    return true;
  }
  return grant.permissions[permission] === true;
}

export async function checkLocationPermission(
  userId: number,
  locationId: number,
  permission: LocationPermission
): Promise<boolean> {
  try {
    const db = await getDb();
    const locationResult = await db
      .select({ schoolId: locations.schoolId })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);

    if (locationResult.length > 0 && locationResult[0].schoolId != null) {
      const schoolGrant = await getUserSchoolPermissions(userId, locationResult[0].schoolId);
      if (schoolGrant && hasPermissionInGrant(schoolGrant, permission)) {
        return true;
      }
    }
  } catch (error) {
    console.error('Error checking school-wide permission:', error);
  }

  const result = await getUserLocationPermissions(userId, locationId);
  if (!result) {
    return false;
  }

  return hasPermissionInGrant(result, permission);
}

export function clearPermissionCache(userId?: number, locationId?: number, schoolId?: number): void {
  if (userId && locationId) {
    permissionCache.delete(getCacheKey(userId, locationId));
  }
  if (userId && schoolId) {
    permissionCache.delete(getSchoolCacheKey(userId, schoolId));
  }
  if (userId && !locationId && !schoolId) {
    for (const key of permissionCache.keys()) {
      if (key.startsWith(`${userId}:`) || key.startsWith(`loc:${userId}:`) || key.startsWith(`school:${userId}:`)) {
        permissionCache.delete(key);
      }
    }
  } else if (!userId) {
    permissionCache.clear();
  }
}

async function isSchoolAdminForLocation(userId: number, locationId: number): Promise<boolean> {
  try {
    const db = await getDb();
    
    const userResult = await db.select({
      role: users.role,
      schoolId: users.schoolId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

    if (userResult.length === 0) {
      return false;
    }

    const user = userResult[0];
    const isSchoolAdmin = user.role === 'schoolAdmin' || user.role === 'admin';
    
    if (!isSchoolAdmin || !user.schoolId) {
      return false;
    }

    const locationResult = await db.select({ schoolId: locations.schoolId })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);

    if (locationResult.length === 0) {
      return false;
    }

    return locationResult[0].schoolId === user.schoolId;
  } catch (error) {
    console.error('Error checking school admin status for location:', error);
    return false;
  }
}

export function requireLocationPermission(permission: LocationPermission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const locationId = parseInt(req.params.locationId);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (isNaN(locationId)) {
      return res.status(400).json({ error: 'Invalid location ID' });
    }

    const isSchoolAdmin = await isSchoolAdminForLocation(userId, locationId);
    if (isSchoolAdmin) {
      return next();
    }

    const hasPermission = await checkLocationPermission(userId, locationId, permission);

    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: `You do not have permission to view parent contacts at this location. Contact your administrator for access.`
      });
    }

    next();
  };
}
