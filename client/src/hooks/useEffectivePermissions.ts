/**
 * Client hook: effective permissions from server (fail closed while loading/error).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRole } from '@/contexts/RoleContext';
import { apiRequest } from '@/lib/queryClient';
import {
  aggregateEffectivePermissions,
  canAccessPath,
  canShowNavGroup,
  canShowNavItem,
  filterNavRegistry,
  hasPermission,
  type EffectivePermissions,
  type NavGroupId,
  type NavRegistryItem,
  type PermissionKey,
  EMPTY_PERMISSION_FLAGS,
} from '@shared/permissions';

export type MyPermissionsResponse = {
  userLocations: Array<{
    locationId: number;
    isActive?: boolean;
    accessLevel?: string;
    permissions: {
      canViewReports?: boolean;
      canManageStaff?: boolean;
      canManageClasses?: boolean;
      canManageStudents?: boolean;
      canSendNotifications?: boolean;
      canViewParentContacts?: boolean;
    };
  }>;
  schoolWide?: {
    isActive?: boolean;
    accessLevel?: string;
    permissions: {
      canViewReports?: boolean;
      canManageStaff?: boolean;
      canManageClasses?: boolean;
      canManageStudents?: boolean;
      canSendNotifications?: boolean;
      canViewParentContacts?: boolean;
    };
  } | null;
};

export type EffectivePermissionsApiResponse = {
  activeRole: string;
  flags: EffectivePermissions['flags'];
  accessibleLocationIds: number[];
  canAccessEntireSchool: boolean;
  isSchoolAdminBypass: boolean;
  showAdminNavGroups: boolean;
  nav: { href: string; title: string; group: string }[];
};

const FAIL_CLOSED: EffectivePermissions = {
  flags: { ...EMPTY_PERMISSION_FLAGS },
  accessibleLocationIds: [],
  canAccessEntireSchool: false,
  isSchoolAdminBypass: false,
  showAdminNavGroups: false,
};

export function useEffectivePermissions() {
  const { activeRole, allRoles } = useRole();

  const {
    data: apiData,
    isLoading,
    isError,
    error,
  } = useQuery<EffectivePermissionsApiResponse>({
    // Include activeRole for cache separation only. Default getQueryFn joins
    // key segments into the URL, so use an explicit queryFn for the real path.
    queryKey: ['/api/me/effective-permissions', activeRole],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/me/effective-permissions');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !!activeRole,
  });

  // Ignore cache rows that do not match the current role (belt-and-suspenders).
  const roleMatchedApiData =
    apiData && apiData.activeRole === activeRole ? apiData : undefined;

  const legacyEnabled =
    !!activeRole && (isError || (!isLoading && !roleMatchedApiData));

  // Fallback: my-permissions if effective endpoint not yet available
  const {
    data: legacyData,
    isLoading: legacyLoading,
  } = useQuery<MyPermissionsResponse>({
    queryKey: ['/api/school-admin/user-locations/my-permissions', activeRole],
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        '/api/school-admin/user-locations/my-permissions',
      );
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: legacyEnabled,
  });

  const effective: EffectivePermissions = useMemo(() => {
    if (roleMatchedApiData) {
      return {
        flags: roleMatchedApiData.flags,
        accessibleLocationIds: roleMatchedApiData.accessibleLocationIds,
        canAccessEntireSchool: roleMatchedApiData.canAccessEntireSchool,
        isSchoolAdminBypass: roleMatchedApiData.isSchoolAdminBypass,
        showAdminNavGroups: roleMatchedApiData.showAdminNavGroups,
      };
    }

    if (legacyData) {
      return aggregateEffectivePermissions({
        activeRole,
        allRoles,
        locationGrants: (legacyData.userLocations ?? []).map((ul) => ({
          locationId: ul.locationId,
          isActive: ul.isActive !== false,
          accessLevel: ul.accessLevel,
          ...ul.permissions,
        })),
        schoolWideGrant: legacyData.schoolWide
          ? {
              isActive: legacyData.schoolWide.isActive !== false,
              accessLevel: legacyData.schoolWide.accessLevel,
              ...legacyData.schoolWide.permissions,
            }
          : null,
      });
    }

    // Loading or error: fail closed (do not flash full admin tree)
    if (isSchoolAdminBypassFromRole(activeRole)) {
      return aggregateEffectivePermissions({ activeRole });
    }
    return FAIL_CLOSED;
  }, [roleMatchedApiData, legacyData, activeRole, allRoles]);

  const visibleNav: NavRegistryItem[] = useMemo(
    () => filterNavRegistry(effective),
    [effective],
  );

  const awaitingPrimary =
    !!activeRole && !roleMatchedApiData && isLoading && !isError;
  const awaitingLegacy =
    legacyEnabled && !legacyData && legacyLoading && !roleMatchedApiData;

  return {
    effective,
    isLoading: (awaitingPrimary || awaitingLegacy) && !roleMatchedApiData && !legacyData,
    isError,
    error,
    can: (key: PermissionKey) => hasPermission(effective, key),
    canShowGroup: (group: NavGroupId) => canShowNavGroup(effective, group),
    canShowItem: (item: Pick<NavRegistryItem, 'required'>) =>
      canShowNavItem(effective, item),
    canAccessPath: (path: string) => canAccessPath(effective, path),
    visibleNav,
    showAdminNavGroups: effective.showAdminNavGroups,
  };
}

function isSchoolAdminBypassFromRole(role: string): boolean {
  return ['schoolAdmin', 'director', 'admin', 'superAdmin'].includes(role);
}

/** Alias used by CTAs */
export function useCan(permission: PermissionKey): boolean {
  const { can, isLoading, showAdminNavGroups } = useEffectivePermissions();
  if (showAdminNavGroups) return true;
  if (isLoading) return false;
  return can(permission);
}
