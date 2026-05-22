import type { User } from '@shared/schema';
import { getDb } from '../db';
import { userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  getAllSchoolsCore,
  getSchoolCoreById,
  getSchoolCoreByAdminId,
  getSchoolsCoreByAdminId,
} from './school-db';

const SCHOOL_ADMIN_ROLES = new Set(['schoolAdmin', 'director']);
const PLATFORM_ADMIN_ROLES = new Set(['superAdmin', 'admin']);

export type AssignableSchool = { id: number; name: string };

/**
 * Resolve the canonical school id for a DB user.
 *
 * Priority for school admins:
 * 1. schools.admin_id = user.id (matches registration link / my-school adminId)
 * 2. users.school_id (legacy; can be stale after DB restore)
 * 3. active user_roles.school_id
 */
export async function resolveSchoolIdForUser(user: User): Promise<number | null> {
  const role = user.role ?? '';
  if (SCHOOL_ADMIN_ROLES.has(role)) {
    const adminSchool = await getSchoolCoreByAdminId(user.id);
    if (adminSchool) {
      if (user.schoolId != null && user.schoolId !== adminSchool.id) {
        console.warn(
          `[resolveSchoolId] user ${user.email} schoolId=${user.schoolId} ` +
            `but admin_id school is ${adminSchool.id} (${adminSchool.name}) — using admin school`,
        );
      }
      return adminSchool.id;
    }
  }

  if (user.schoolId != null && user.schoolId > 0) {
    return user.schoolId;
  }

  if (user.activeRoleId) {
    const db = await getDb();
    const activeRoles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, user.activeRoleId))
      .limit(1);
    if (activeRoles.length > 0 && activeRoles[0].schoolId) {
      return activeRoles[0].schoolId;
    }
  }

  return null;
}

/** Schools a user may attach locations to (admin_id schools + legacy users.school_id). */
export async function getAssignableSchoolsForUser(user: User): Promise<AssignableSchool[]> {
  const byId = new Map<number, AssignableSchool>();

  const add = (id: number, name: string) => {
    if (id > 0) {
      byId.set(id, { id, name });
    }
  };

  if (PLATFORM_ADMIN_ROLES.has(user.role ?? '')) {
    for (const school of await getAllSchoolsCore()) {
      add(school.id, school.name);
    }
    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
  }

  if (SCHOOL_ADMIN_ROLES.has(user.role ?? '')) {
    for (const school of await getSchoolsCoreByAdminId(user.id)) {
      add(school.id, school.name);
    }
  }

  const db = await getDb();
  const roleRows = await db
    .select({ schoolId: userRoles.schoolId, role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));
  for (const row of roleRows) {
    if (
      row.schoolId != null &&
      row.schoolId > 0 &&
      (row.role === 'schoolAdmin' || row.role === 'director')
    ) {
      const school = await getSchoolCoreById(row.schoolId);
      if (school) {
        add(school.id, school.name);
      }
    }
  }

  if (user.schoolId != null && user.schoolId > 0) {
    const legacy = await getSchoolCoreById(user.schoolId);
    if (legacy) {
      add(legacy.id, legacy.name);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

export async function isSchoolAssignableForUser(
  user: User,
  schoolId: number,
): Promise<boolean> {
  if (!Number.isFinite(schoolId) || schoolId <= 0) {
    return false;
  }
  const assignable = await getAssignableSchoolsForUser(user);
  return assignable.some((s) => s.id === schoolId);
}

/** Parsed schoolId from query/body, validated against assignable schools. */
/** School IDs a school-scoped admin may access (admin_id, legacy school_id, user_roles). */
export async function getAssignableSchoolIdsForUser(user: User): Promise<number[]> {
  const assignable = await getAssignableSchoolsForUser(user);
  const ids = assignable.map((s) => s.id);
  if (ids.length > 0) {
    return ids;
  }
  const resolved = await resolveSchoolIdForUser(user);
  return resolved != null ? [resolved] : [];
}

export type AdminSchoolAccess = {
  schoolIds: number[];
  isUnrestricted: boolean;
  effectiveRole: string;
};

/**
 * Resolve permitted school IDs for parent-profile / admin tenant checks.
 * Prefer schools.admin_id over stale user_roles.school_id on activeRoleId.
 */
export async function getAdminPermittedSchoolAccess(
  adminUser: User,
  options?: { headerRoles?: string[] },
): Promise<AdminSchoolAccess> {
  let effectiveRole = adminUser.role ?? 'parent';

  if (adminUser.activeRoleId) {
    const db = await getDb();
    const activeRoles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.id, adminUser.activeRoleId))
      .limit(1);
    if (activeRoles.length > 0 && activeRoles[0].role) {
      effectiveRole = activeRoles[0].role;
    }
  }

  const headerRoles = options?.headerRoles ?? [];
  const hasPlatformRole =
    PLATFORM_ADMIN_ROLES.has(effectiveRole) ||
    headerRoles.some((r) => PLATFORM_ADMIN_ROLES.has(r));

  if (hasPlatformRole) {
    return { schoolIds: [], isUnrestricted: true, effectiveRole };
  }

  const hasSchoolScopedRole =
    SCHOOL_ADMIN_ROLES.has(effectiveRole) ||
    headerRoles.some((r) => SCHOOL_ADMIN_ROLES.has(r));

  if (hasSchoolScopedRole) {
    const schoolIds = await getAssignableSchoolIdsForUser(adminUser);
    return { schoolIds, isUnrestricted: false, effectiveRole };
  }

  return { schoolIds: [], isUnrestricted: false, effectiveRole };
}

export async function resolveRequestedSchoolIdForUser(
  user: User,
  requested: unknown,
  fallbackSchoolId: number | null,
): Promise<number | null> {
  const parsed =
    requested != null && requested !== ''
      ? Number(requested)
      : fallbackSchoolId;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  if (await isSchoolAssignableForUser(user, parsed)) {
    return parsed;
  }
  return null;
}
