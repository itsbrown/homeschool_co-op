/** Canonical role strings for routing and RoleContext (matches RoleContext maps). */
export function normalizeRoleCasing(role: string): string {
  const lowerRole = role.toLowerCase();
  const roleMap: Record<string, string> = {
    superadmin: 'superAdmin',
    schooladmin: 'schoolAdmin',
    director: 'director',
    mentor: 'mentor',
    educator: 'educator',
    parent: 'parent',
    admin: 'admin',
    student: 'student',
    learner: 'learner',
    teacher: 'teacher',
  };
  return roleMap[lowerRole] || role;
}

export function resolveBootstrapRoleFromRolesApi(data: {
  activeRole?: string | null;
  roles?: Array<{ role: string; isPrimary?: boolean }>;
} | undefined): string {
  if (!data) return '';
  if (data.activeRole?.trim()) {
    return normalizeRoleCasing(data.activeRole);
  }
  const primary = data.roles?.find((r) => r.isPrimary);
  if (primary?.role) {
    return normalizeRoleCasing(primary.role);
  }
  if (data.roles?.[0]?.role) {
    return normalizeRoleCasing(data.roles[0].role);
  }
  return '';
}
