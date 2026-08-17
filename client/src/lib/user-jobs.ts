/**
 * Direct job membership from user_roles (not RoleContext hasRole hierarchy).
 * schoolAdmin hierarchy implies parent — that must not show Family to pure admins.
 */

export type RoleLike = { role: string } | string;

const NON_TEACHING = new Set([
  'parent',
  'student',
  'learner',
  'schooladmin',
  'director',
  'admin',
  'superadmin',
]);

const TEACHING = new Set(['educator', 'teacher', 'mentor', 'aide']);

const SCHOOL_ADMIN = new Set(['schooladmin', 'director', 'admin', 'superadmin']);

export function roleName(entry: RoleLike): string {
  return (typeof entry === 'string' ? entry : entry.role ?? '').trim();
}

function normalize(entry: RoleLike): string {
  return roleName(entry).toLowerCase();
}

export function holdsParent(roles: RoleLike[] | undefined | null): boolean {
  return (roles ?? []).some((r) => normalize(r) === 'parent');
}

/** Educator/teacher/mentor/aide or a custom staff title (e.g. Mentor, Lead Mentor). */
export function holdsTeaching(roles: RoleLike[] | undefined | null): boolean {
  return (roles ?? []).some((r) => {
    const n = normalize(r);
    if (!n) return false;
    if (TEACHING.has(n)) return true;
    if (NON_TEACHING.has(n)) return false;
    return true;
  });
}

export function holdsSchoolAdmin(roles: RoleLike[] | undefined | null): boolean {
  return (roles ?? []).some((r) => SCHOOL_ADMIN.has(normalize(r)));
}

/** Parent chrome + Teaching group: family who also teach. Not parent+admin-only. */
export function holdsParentAndTeaching(roles: RoleLike[] | undefined | null): boolean {
  return holdsParent(roles) && holdsTeaching(roles);
}

export function formatJobsSubtitle(roles: RoleLike[] | undefined | null): string {
  const list = roles ?? [];
  const labels: string[] = [];
  if (holdsParent(list)) labels.push('Parent');
  if (holdsTeaching(list)) {
    const teaching = list.find((r) => {
      const n = normalize(r);
      return TEACHING.has(n) || (n.length > 0 && !NON_TEACHING.has(n));
    });
    const raw = teaching ? roleName(teaching) : 'Staff';
    labels.push(raw.charAt(0).toUpperCase() + raw.slice(1));
  }
  if (holdsSchoolAdmin(list)) labels.push('School Admin');
  return labels.join(' · ') || 'User';
}
