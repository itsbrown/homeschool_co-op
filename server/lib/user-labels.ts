import { getDb } from '../db';
import { userRoles } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { systemRoles } from '@shared/schema';

/** System roles shown in Users filter and notification targeting (school-scoped). */
export const NOTIFICATION_SYSTEM_LABELS = [
  'parent',
  'educator',
  'teacher',
  'director',
  'schoolAdmin',
] as const;

export const STAFF_TYPE_ROLES = ['educator', 'teacher', 'schoolAdmin'] as const;

export function normalizeLabelKey(role: string): string {
  return String(role || '').trim().toLowerCase();
}

export function labelsMatch(a: string, b: string): boolean {
  return normalizeLabelKey(a) === normalizeLabelKey(b);
}

export type UserLabelRow = {
  role: string;
  roleId: number;
  schoolId: number | null;
  isPrimary: boolean;
};

/**
 * All user_roles rows for a user at a school (display casing preserved from DB).
 */
export async function getLabelRowsForUserAtSchool(
  userId: number,
  schoolId: number,
): Promise<UserLabelRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.schoolId, schoolId)));

  return rows.map((r) => ({
    role: r.role,
    roleId: r.id,
    schoolId: r.schoolId,
    isPrimary: r.isPrimary,
  }));
}

export async function getLabelsForUserAtSchool(
  userId: number,
  schoolId: number,
): Promise<string[]> {
  const rows = await getLabelRowsForUserAtSchool(userId, schoolId);
  return rows.map((r) => r.role);
}

export function getPrimaryLabelFromRows(rows: UserLabelRow[]): string | null {
  if (rows.length === 0) return null;
  const primary = rows.find((r) => r.isPrimary);
  return primary?.role ?? rows[0].role;
}

/**
 * Distinct user IDs at a school matching any of the given labels (case-insensitive).
 * Optionally merges legacy users.role when no user_roles rows exist for that user at school.
 */
export async function getUserIdsWithLabelsAtSchool(
  schoolId: number,
  labels: string[],
  options?: { includeLegacyUsersRoleFallback?: boolean },
): Promise<number[]> {
  if (!Number.isFinite(schoolId) || schoolId <= 0) return [];
  const normalizedTargets = [...new Set(labels.map(normalizeLabelKey).filter(Boolean))];
  if (normalizedTargets.length === 0) return [];

  const db = await getDb();
  const roleRows = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.schoolId, schoolId));

  const ids = new Set<number>();
  for (const row of roleRows) {
    if (normalizedTargets.includes(normalizeLabelKey(row.role))) {
      ids.add(row.userId);
    }
  }

  if (options?.includeLegacyUsersRoleFallback) {
    const { storage } = await import('../storage');
    const allUsers = await storage.getAllUsers();
    const usersWithRolesAtSchool = new Set(
      roleRows.map((r) => r.userId),
    );
    for (const u of allUsers) {
      if (usersWithRolesAtSchool.has(u.id)) continue;
      const legacySchoolId = u.schoolId;
      if (legacySchoolId != null && legacySchoolId !== schoolId) continue;
      const legacyRole = normalizeLabelKey(u.role || '');
      if (normalizedTargets.includes(legacyRole)) {
        ids.add(u.id);
      }
    }
  }

  return [...ids].filter((id) => id > 0);
}

/** Labels available for filter UI: system + custom (caller passes custom titles). */
export function buildAvailableLabelOptions(customPositionTitles: string[]): {
  system: string[];
  custom: string[];
} {
  const custom = customPositionTitles
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !NOTIFICATION_SYSTEM_LABELS.some((s) => labelsMatch(s, t)));

  return {
    system: [...NOTIFICATION_SYSTEM_LABELS],
    custom,
  };
}

/** Resolve legacy display role without defaulting unknown roles to parent. */
export type ResolvedStaffTarget = {
  userId: number;
  user: Awaited<ReturnType<typeof import('../storage').storage.getUser>>;
  roleRecord: UserLabelRow | null;
  staffRecord: Awaited<ReturnType<typeof import('../storage').storage.getSchoolStaffById>> | null;
  resolvedVia: 'userId' | 'schoolStaffId' | 'userRoleId';
};

/**
 * Resolve :id from staff routes — canonical users.id, with deprecated fallbacks.
 */
export async function resolveStaffMemberFromParam(
  paramId: number,
  schoolId: number,
): Promise<ResolvedStaffTarget | null> {
  const { storage } = await import('../storage');

  const userById = await storage.getUser(paramId);
  if (userById) {
    const labelRows = await getLabelRowsForUserAtSchool(paramId, schoolId);
    const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(schoolId);
    const staffRecord =
      schoolStaffRecords.find((s) => s.userId === paramId) ?? null;
    const roleRecord = labelRows[0]
      ? {
          role: labelRows[0].role,
          roleId: labelRows[0].roleId,
          schoolId: labelRows[0].schoolId,
          isPrimary: labelRows[0].isPrimary,
        }
      : null;
    return {
      userId: paramId,
      user: userById,
      roleRecord,
      staffRecord,
      resolvedVia: 'userId',
    };
  }

  const staffRecord = await storage.getSchoolStaffById(paramId);
  if (staffRecord && staffRecord.schoolId === schoolId) {
    const user = await storage.getUser(staffRecord.userId);
    if (!user) return null;
    console.warn(
      `[resolveStaffMemberFromParam] Deprecated: resolved school_staff.id=${paramId} — use users.id=${user.id}`,
    );
    const labelRows = await getLabelRowsForUserAtSchool(user.id, schoolId);
    return {
      userId: user.id,
      user,
      roleRecord: labelRows[0] ?? null,
      staffRecord,
      resolvedVia: 'schoolStaffId',
    };
  }

  const db = await getDb();
  const [roleRow] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.id, paramId), eq(userRoles.schoolId, schoolId)))
    .limit(1);
  if (roleRow) {
    const user = await storage.getUser(roleRow.userId);
    if (!user) return null;
    console.warn(
      `[resolveStaffMemberFromParam] Deprecated: resolved user_roles.id=${paramId} — use users.id=${user.id}`,
    );
    const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(schoolId);
    const staffRecord =
      schoolStaffRecords.find((s) => s.userId === user.id) ?? null;
    return {
      userId: user.id,
      user,
      roleRecord: {
        role: roleRow.role,
        roleId: roleRow.id,
        schoolId: roleRow.schoolId,
        isPrimary: roleRow.isPrimary,
      },
      staffRecord,
      resolvedVia: 'userRoleId',
    };
  }

  return null;
}

export function resolvePrimaryLabelForList(
  labelRows: UserLabelRow[],
  user: { activeRole?: string | null; role?: string | null },
): string | null {
  const fromRoles = getPrimaryLabelFromRows(labelRows);
  if (fromRoles) return fromRoles;

  if (user.activeRole && (systemRoles as readonly string[]).includes(user.activeRole as any)) {
    return user.activeRole;
  }
  if (user.role && (systemRoles as readonly string[]).includes(user.role as any)) {
    return user.role;
  }
  if (user.role) return user.role;
  return null;
}
