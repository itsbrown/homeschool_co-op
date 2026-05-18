import { getDb } from '../db';
import { storage } from '../storage';
import { userRoles } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import type { User } from '@shared/schema';

const SCHOOL_SCOPED_ADMIN_ROLES = ['schoolAdmin', 'admin', 'director'] as const;
const ANY_ADMIN_ROLES = ['schoolAdmin', 'admin', 'superAdmin', 'superadmin', 'director'] as const;

/**
 * Resolve which school an admin financial report should scope to.
 *
 * Financial reports previously used `userRoles.find(first admin)` which often
 * picked the wrong school for multi-role admins (e.g. superAdmin on school A
 * while actively administering school B via activeRoleId / role switcher).
 */
export async function resolveAdminSchoolId(req: any, user: User): Promise<number | null> {
  const userRolesList = await storage.getUserRolesByUserId(user.id);

  if (user.activeRoleId) {
    const activeEntry = userRolesList.find((r) => r.id === user.activeRoleId);
    if (activeEntry?.schoolId) {
      return activeEntry.schoolId;
    }
  }

  const headerRole = req.headers?.['x-active-role'];
  if (headerRole && typeof headerRole === 'string') {
    const headerMatch = userRolesList.find(
      (r) => r.role.toLowerCase() === headerRole.toLowerCase() && r.schoolId,
    );
    if (headerMatch?.schoolId) {
      return headerMatch.schoolId;
    }
  }

  const activeRoleName = user.activeRole ?? req.auth?.role ?? req.user?.role;
  if (activeRoleName) {
    const roleMatch = userRolesList.find(
      (r) => r.role.toLowerCase() === String(activeRoleName).toLowerCase() && r.schoolId,
    );
    if (roleMatch?.schoolId) {
      return roleMatch.schoolId;
    }
  }

  const schoolScopedAdmin = userRolesList.find(
    (r) => SCHOOL_SCOPED_ADMIN_ROLES.includes(r.role as (typeof SCHOOL_SCOPED_ADMIN_ROLES)[number]) && r.schoolId,
  );
  if (schoolScopedAdmin?.schoolId) {
    return schoolScopedAdmin.schoolId;
  }

  const anyAdminWithSchool = userRolesList.find(
    (r) => ANY_ADMIN_ROLES.some((a) => a.toLowerCase() === r.role.toLowerCase()) && r.schoolId,
  );
  if (anyAdminWithSchool?.schoolId) {
    return anyAdminWithSchool.schoolId;
  }

  if (user.schoolId != null && user.schoolId > 0) {
    return user.schoolId;
  }

  if (user.activeRoleId) {
    const db = await getDb();
    const [row] = await db.select().from(userRoles).where(eq(userRoles.id, user.activeRoleId)).limit(1);
    if (row?.schoolId) {
      return row.schoolId;
    }
  }

  return null;
}

/** SQL: stripe_payment_history.user_id belongs to this school's parent population */
export function sqlStripeHistoryUserAtSchool(schoolId: number, userIdColumn = sql`sph.user_id`) {
  return sql`(
    EXISTS (SELECT 1 FROM users u WHERE u.id = ${userIdColumn} AND u.school_id = ${schoolId})
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = ${userIdColumn}
        AND ur.school_id = ${schoolId}
        AND LOWER(TRIM(ur.role)) = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM program_enrollments pe
      INNER JOIN users u2 ON LOWER(TRIM(u2.email)) = LOWER(TRIM(pe.parent_email))
      WHERE pe.school_id = ${schoolId}
        AND u2.id = ${userIdColumn}
    )
  )`;
}
