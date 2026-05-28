import { storage } from '../storage';
import { getLabelRowsForUserAtSchool, normalizeLabelKey } from './user-labels';
import { getAdminPermittedSchoolAccess } from './resolve-school-id';

export type UserProfileCapabilities = {
  viewOverview: boolean;
  viewFamily: boolean;
  viewEnrollments: boolean;
  viewPayments: boolean;
  viewTeaching: boolean;
  viewStaff: boolean;
};

export function deriveCapabilitiesFromLabels(labels: string[]): UserProfileCapabilities {
  const normalized = new Set(labels.map(normalizeLabelKey));
  const has = (...keys: string[]) => keys.some((k) => normalized.has(normalizeLabelKey(k)));

  return {
    viewOverview: true,
    viewFamily: has('parent'),
    viewEnrollments: has('parent'),
    viewPayments: has('parent'),
    viewTeaching: has('educator', 'teacher', 'instructor', 'mentor'),
    viewStaff: labels.some(
      (l) =>
        !has('parent') &&
        (has('educator', 'teacher', 'schooladmin', 'director') ||
          !['parent', 'student', 'learner'].includes(normalizeLabelKey(l))),
    ),
  };
}

/**
 * Whether the requesting admin may open this user's school profile.
 */
export async function assertAdminCanViewUserProfile(
  adminEmail: string,
  targetUserId: number,
  schoolId: number,
  headerRoles: string[] = [],
): Promise<{ allowed: boolean; reason?: string }> {
  const adminUser = await storage.getUserByEmail(adminEmail);
  if (!adminUser) {
    return { allowed: false, reason: 'Admin user not found' };
  }

  const targetUser = await storage.getUser(targetUserId);
  if (!targetUser) {
    return { allowed: false, reason: 'User not found' };
  }

  const adminAccess = await getAdminPermittedSchoolAccess(adminUser, { headerRoles });
  if (adminAccess.isUnrestricted) {
    return { allowed: true };
  }

  if (
    adminAccess.schoolIds.length === 0 &&
    !['schoolAdmin', 'director'].includes(adminAccess.effectiveRole) &&
    !headerRoles.some((r) => r === 'schoolAdmin' || r === 'director')
  ) {
    return { allowed: false, reason: 'You must be associated with a school to view user profiles' };
  }

  const schoolIds = adminAccess.schoolIds;
  if (!schoolIds.includes(schoolId)) {
    return { allowed: false, reason: 'You do not have permission to view this user profile' };
  }

  const labelRows = await getLabelRowsForUserAtSchool(targetUserId, schoolId);
  const hasParentRole = labelRows.some((r) => normalizeLabelKey(r.role) === 'parent');
  const hasRoleAtSchool = labelRows.length > 0;

  if (hasRoleAtSchool || hasParentRole) {
    return { allowed: true };
  }

  const children = await storage.getChildrenByParentEmail(targetUser.email);
  const childrenById = await storage.getChildrenByParentId(targetUser.id);
  const allChildren = childrenById.length > 0 ? childrenById : children;
  if (allChildren.some((c: any) => c.schoolId && schoolIds.includes(c.schoolId))) {
    return { allowed: true };
  }

  const memberships = await storage.getMembershipEnrollmentsByParentId(targetUserId);
  if (memberships.some((m) => schoolIds.includes(m.schoolId))) {
    return { allowed: true };
  }

  if (targetUser.schoolId && schoolIds.includes(targetUser.schoolId)) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'You do not have permission to view this user profile' };
}
