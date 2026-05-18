/** Canonical role strings used for API authorization */
export const FINANCIAL_ADMIN_ROLES = ['schoolAdmin', 'admin', 'superAdmin', 'director'] as const;

const ROLE_ALIASES: Record<string, string> = {
  superadmin: 'superAdmin',
  super_admin: 'superAdmin',
  schooladmin: 'schoolAdmin',
  school_admin: 'schoolAdmin',
  schooladministrator: 'schoolAdmin',
};

/** Normalize DB / UI role strings to canonical system role names */
export function normalizeAuthRole(role: string | null | undefined): string {
  if (!role || typeof role !== 'string') return '';
  const trimmed = role.trim();
  if (!trimmed) return '';
  const compact = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return ROLE_ALIASES[compact] ?? ROLE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function expandRolesForAuth(roles: string[]): string[] {
  const out = new Set<string>();
  for (const r of roles) {
    const norm = normalizeAuthRole(r);
    if (norm) out.add(norm);
    if (r.trim()) out.add(r.trim());
  }
  return Array.from(out);
}

export function isSuperAdminRole(role: string): boolean {
  return normalizeAuthRole(role) === 'superAdmin';
}
