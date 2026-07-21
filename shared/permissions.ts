/**
 * Permission registry — single source of truth for staff nav, route guards, and API samples.
 * Fail closed: missing grants = deny.
 */

export const LOCATION_PERMISSION_KEYS = [
  'canViewReports',
  'canManageStaff',
  'canManageClasses',
  'canManageStudents',
  'canSendNotifications',
  'canViewParentContacts',
] as const;

export type LocationPermissionKey = (typeof LOCATION_PERMISSION_KEYS)[number];

/** Capability keys used by nav/API (location flags + school-wide scope). */
export type PermissionKey = LocationPermissionKey | 'canAccessEntireSchool';

export type PermissionFlags = Record<LocationPermissionKey, boolean>;

export const EMPTY_PERMISSION_FLAGS: PermissionFlags = {
  canViewReports: false,
  canManageStaff: false,
  canManageClasses: false,
  canManageStudents: false,
  canSendNotifications: false,
  canViewParentContacts: false,
};

/** Roles that bypass location grants and get full school access. */
export const SCHOOL_ADMIN_BYPASS_ROLES = [
  'schoolAdmin',
  'director',
  'admin',
  'superAdmin',
] as const;

export type SchoolAdminBypassRole = (typeof SCHOOL_ADMIN_BYPASS_ROLES)[number];

export function isSchoolAdminBypassRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim();
  return (SCHOOL_ADMIN_BYPASS_ROLES as readonly string[]).includes(normalized);
}

export type LocationGrantInput = {
  locationId: number;
  isActive?: boolean;
  accessLevel?: string;
  canViewReports?: boolean;
  canManageStaff?: boolean;
  canManageClasses?: boolean;
  canManageStudents?: boolean;
  canSendNotifications?: boolean;
  canViewParentContacts?: boolean;
};

export type SchoolWideGrantInput = {
  isActive?: boolean;
  accessLevel?: string;
  canViewReports?: boolean;
  canManageStaff?: boolean;
  canManageClasses?: boolean;
  canManageStudents?: boolean;
  canSendNotifications?: boolean;
  canViewParentContacts?: boolean;
} | null | undefined;

export type AggregatePermissionsInput = {
  /** Active role the user is acting as (UI / fail-closed for multi-role). */
  activeRole?: string | null;
  /** All roles held (API requireRole still uses these separately). */
  allRoles?: string[];
  locationGrants?: LocationGrantInput[];
  schoolWideGrant?: SchoolWideGrantInput;
};

export type EffectivePermissions = {
  flags: PermissionFlags;
  accessibleLocationIds: number[];
  /** True when role bypass OR active school-wide grant (regional manager). */
  canAccessEntireSchool: boolean;
  /** True when activeRole (or allRoles) is a school-admin bypass role. */
  isSchoolAdminBypass: boolean;
  /** Whether school-admin nav groups should show (active role based). */
  showAdminNavGroups: boolean;
};

function flagsFromGrant(
  grant: LocationGrantInput | NonNullable<SchoolWideGrantInput>,
): PermissionFlags {
  const adminLevel = grant.accessLevel === 'admin';
  return {
    canViewReports: adminLevel || grant.canViewReports === true,
    canManageStaff: adminLevel || grant.canManageStaff === true,
    canManageClasses: adminLevel || grant.canManageClasses === true,
    canManageStudents: adminLevel || grant.canManageStudents === true,
    canSendNotifications: adminLevel || grant.canSendNotifications === true,
    canViewParentContacts: adminLevel || grant.canViewParentContacts === true,
  };
}

function orFlags(a: PermissionFlags, b: PermissionFlags): PermissionFlags {
  return {
    canViewReports: a.canViewReports || b.canViewReports,
    canManageStaff: a.canManageStaff || b.canManageStaff,
    canManageClasses: a.canManageClasses || b.canManageClasses,
    canManageStudents: a.canManageStudents || b.canManageStudents,
    canSendNotifications: a.canSendNotifications || b.canSendNotifications,
    canViewParentContacts: a.canViewParentContacts || b.canViewParentContacts,
  };
}

const ALL_TRUE_FLAGS: PermissionFlags = {
  canViewReports: true,
  canManageStaff: true,
  canManageClasses: true,
  canManageStudents: true,
  canSendNotifications: true,
  canViewParentContacts: true,
};

/**
 * Resolve effective staff permissions. Fail closed when no grants and no bypass role.
 * School-wide grant (user_school_permissions) ⇒ canAccessEntireSchool + OR flags.
 * Location grants OR across active assignments; inactive rows ignored.
 */
export function aggregateEffectivePermissions(
  input: AggregatePermissionsInput,
): EffectivePermissions {
  const activeRole = input.activeRole ?? '';

  // Nav groups follow active role (not hasRole membership) — fail closed for parent view.
  if (isSchoolAdminBypassRole(activeRole)) {
    return {
      flags: { ...ALL_TRUE_FLAGS },
      accessibleLocationIds: [],
      canAccessEntireSchool: true,
      isSchoolAdminBypass: true,
      showAdminNavGroups: true,
    };
  }

  const activeLocations = (input.locationGrants ?? []).filter((g) => g.isActive !== false);
  const accessibleLocationIds = activeLocations.map((g) => g.locationId);

  let flags = { ...EMPTY_PERMISSION_FLAGS };
  for (const grant of activeLocations) {
    flags = orFlags(flags, flagsFromGrant(grant));
  }

  const schoolWide = input.schoolWideGrant;
  const hasSchoolWide = !!schoolWide && schoolWide.isActive !== false;
  if (hasSchoolWide && schoolWide) {
    flags = orFlags(flags, flagsFromGrant(schoolWide));
  }

  return {
    flags,
    accessibleLocationIds,
    canAccessEntireSchool: hasSchoolWide,
    isSchoolAdminBypass: false,
    showAdminNavGroups: false,
  };
}

export function hasPermission(
  effective: EffectivePermissions,
  key: PermissionKey,
): boolean {
  if (key === 'canAccessEntireSchool') {
    return effective.canAccessEntireSchool || effective.isSchoolAdminBypass;
  }
  if (effective.isSchoolAdminBypass || effective.showAdminNavGroups) {
    return true;
  }
  return effective.flags[key] === true;
}

/** Nav group → required permission (OR schoolAdmin bypass). */
export type NavGroupId =
  | 'School'
  | 'People'
  | 'Enrollments'
  | 'Academics'
  | 'Finance'
  | 'Content'
  | 'Communication';

export const NAV_GROUP_PERMISSIONS: Record<NavGroupId, PermissionKey> = {
  School: 'canManageClasses',
  People: 'canManageStaff',
  Enrollments: 'canManageStudents',
  Academics: 'canManageClasses',
  Finance: 'canViewReports',
  Content: 'canManageClasses', // Content inherits classes until dedicated flag exists
  Communication: 'canSendNotifications',
};

export type NavRegistryItem = {
  title: string;
  href: string;
  group: NavGroupId;
  required: PermissionKey;
};

/**
 * Every school-admin sidebar item must appear here.
 * Contract tests assert completeness against this list.
 */
export const NAV_REGISTRY: NavRegistryItem[] = [
  { title: 'My School', href: '/schools/my-school', group: 'School', required: 'canManageClasses' },
  { title: 'Locations', href: '/schools/locations', group: 'School', required: 'canManageClasses' },
  { title: 'Classes', href: '/schools/classes', group: 'School', required: 'canManageClasses' },
  { title: 'Sessions', href: '/schools/sessions', group: 'School', required: 'canManageClasses' },
  { title: 'Categories', href: '/schools/categories', group: 'School', required: 'canManageClasses' },
  { title: 'Calendar', href: '/schools/calendar', group: 'School', required: 'canManageClasses' },

  { title: 'Staff', href: '/schools/staff', group: 'People', required: 'canManageStaff' },
  { title: 'Staff Hours', href: '/schools/staff-hours', group: 'People', required: 'canManageStaff' },
  {
    title: 'Staff Permissions',
    href: '/school-admin/staff-permissions',
    group: 'People',
    required: 'canManageStaff',
  },
  { title: 'Educators', href: '/schools/educators', group: 'People', required: 'canManageStaff' },
  { title: 'Students', href: '/schools/students', group: 'People', required: 'canManageStudents' },
  { title: 'Users', href: '/schools/users', group: 'People', required: 'canManageStaff' },

  {
    title: 'Enrollments',
    href: '/schools/enrollments',
    group: 'Enrollments',
    required: 'canManageStudents',
  },
  {
    title: 'Location Enrollments',
    href: '/school-admin/location-enrollments',
    group: 'Enrollments',
    required: 'canViewParentContacts',
  },

  {
    title: 'Weekly Templates',
    href: '/schools/schedule-builder',
    group: 'Academics',
    required: 'canManageClasses',
  },
  {
    title: 'Week Planner',
    href: '/schools/week-planner',
    group: 'Academics',
    required: 'canManageClasses',
  },
  {
    title: 'Assessments',
    href: '/school-admin/assessments',
    group: 'Academics',
    required: 'canManageClasses',
  },
  {
    title: 'Attendance',
    href: '/school-admin/attendance',
    group: 'Academics',
    required: 'canManageClasses',
  },

  {
    title: 'Financial Reports',
    href: '/school-admin/financial-reports',
    group: 'Finance',
    required: 'canViewReports',
  },
  {
    title: 'School Analytics',
    href: '/school-admin/analytics',
    group: 'Finance',
    required: 'canViewReports',
  },
  {
    title: 'Retention Report',
    href: '/school-admin/retention-report',
    group: 'Finance',
    required: 'canViewReports',
  },
  {
    title: 'Refunds',
    href: '/school-admin/refunds',
    group: 'Finance',
    required: 'canViewReports',
  },
  {
    title: 'Public Store',
    href: '/school-admin/public-store',
    group: 'Finance',
    required: 'canViewReports',
  },
  {
    title: 'Manual Payments',
    href: '/schools/manual-payments',
    group: 'Finance',
    required: 'canViewReports',
  },
  {
    title: 'Memberships',
    href: '/schools/memberships',
    group: 'Finance',
    required: 'canViewReports',
  },
  { title: 'Discounts', href: '/schools/discounts', group: 'Finance', required: 'canViewReports' },
  { title: 'Credits', href: '/school-admin/credits', group: 'Finance', required: 'canViewReports' },
  {
    title: 'Fundraisers',
    href: '/school-admin/fundraisers',
    group: 'Finance',
    required: 'canViewReports',
  },

  { title: 'Forms', href: '/school-admin/forms', group: 'Content', required: 'canManageClasses' },
  {
    title: 'Documents',
    href: '/school-admin/documents',
    group: 'Content',
    required: 'canManageClasses',
  },
  {
    title: 'Knowledge Base',
    href: '/schools/knowledge-base',
    group: 'Content',
    required: 'canManageClasses',
  },
  {
    title: 'Marketing Links',
    href: '/schools/marketing-links',
    group: 'Content',
    required: 'canManageClasses',
  },

  {
    title: 'Notifications',
    href: '/schools/notifications',
    group: 'Communication',
    required: 'canSendNotifications',
  },
  {
    title: 'Announcements',
    href: '/schools/announcements',
    group: 'Communication',
    required: 'canSendNotifications',
  },
  {
    title: 'Notification Tracking',
    href: '/schools/notification-tracking',
    group: 'Communication',
    required: 'canSendNotifications',
  },
  {
    title: 'Support Issues',
    href: '/admin/technical-support',
    group: 'Communication',
    required: 'canSendNotifications',
  },
];

/** Representative API samples for nav↔API contract tests. */
export type ApiSample = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  required: PermissionKey;
  description: string;
};

export const NAV_API_SAMPLES: ApiSample[] = [
  {
    method: 'GET',
    path: '/api/school-admin/metrics/financial',
    required: 'canViewReports',
    description: 'Finance / financial reports',
  },
  {
    method: 'GET',
    path: '/api/school-admin/staff',
    required: 'canManageStaff',
    description: 'People / staff',
  },
  {
    method: 'GET',
    path: '/api/school-admin/students',
    required: 'canManageStudents',
    description: 'People / students',
  },
  {
    method: 'GET',
    path: '/api/school-admin/classes',
    required: 'canManageClasses',
    description: 'School / classes',
  },
  {
    method: 'GET',
    path: '/api/school-admin/notifications/tracking',
    required: 'canSendNotifications',
    description: 'Communication / notification tracking',
  },
];

export function canShowNavItem(
  effective: EffectivePermissions,
  item: Pick<NavRegistryItem, 'required'>,
): boolean {
  if (effective.showAdminNavGroups || effective.isSchoolAdminBypass) {
    return true;
  }
  return hasPermission(effective, item.required);
}

export function canShowNavGroup(
  effective: EffectivePermissions,
  group: NavGroupId,
): boolean {
  if (effective.showAdminNavGroups || effective.isSchoolAdminBypass) {
    return true;
  }
  return hasPermission(effective, NAV_GROUP_PERMISSIONS[group]);
}

export function filterNavRegistry(
  effective: EffectivePermissions,
): NavRegistryItem[] {
  return NAV_REGISTRY.filter((item) => canShowNavItem(effective, item));
}

export function canAccessPath(
  effective: EffectivePermissions,
  path: string,
): boolean {
  if (effective.showAdminNavGroups || effective.isSchoolAdminBypass) {
    return true;
  }
  const normalized = path.split('?')[0];
  const matches = NAV_REGISTRY.filter(
    (item) =>
      normalized === item.href || normalized.startsWith(`${item.href}/`),
  );
  if (matches.length === 0) {
    // Unlisted staff deep links: school-wide / bypass only (do not over-permit on one unrelated flag)
    return effective.canAccessEntireSchool || effective.isSchoolAdminBypass;
  }
  return matches.some((item) => canShowNavItem(effective, item));
}

export function isLocationInScope(
  effective: EffectivePermissions,
  locationId: number | null | undefined,
): boolean {
  if (effective.canAccessEntireSchool || effective.isSchoolAdminBypass) {
    return true;
  }
  if (locationId == null || Number.isNaN(Number(locationId))) {
    return false;
  }
  return effective.accessibleLocationIds.includes(Number(locationId));
}

/** Enforcement mode: off | observe (log) | enforce (403). */
export type PermissionsEnforcementMode = 'off' | 'observe' | 'enforce';

export function getPermissionsEnforcementMode(
  envValue?: string | null,
): PermissionsEnforcementMode {
  const v = (envValue ?? '').trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return 'off';
  if (v === 'observe' || v === 'soft') return 'observe';
  if (v === 'enforce' || v === 'on' || v === 'true' || v === '1') return 'enforce';
  // Default: enforce in production-minded setups; observe is safer for first deploy
  return 'observe';
}

/** Legacy JSONB alias: canCreateClasses maps to canManageClasses. */
export function legacyCanCreateClassesAllowed(
  effective: EffectivePermissions,
  userPermissionsJson?: { canCreateClasses?: boolean } | null,
): boolean {
  if (hasPermission(effective, 'canManageClasses')) {
    return true;
  }
  // Only honor explicit false from legacy JSONB when no location grant
  if (userPermissionsJson?.canCreateClasses === false) {
    return false;
  }
  // Legacy true without location grant — deny (fail closed; prefer user_locations)
  return false;
}
