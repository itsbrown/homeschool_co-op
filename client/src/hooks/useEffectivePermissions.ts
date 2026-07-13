/**
 * Client hook: effective permissions from server (fail closed while loading/error).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRole } from '@/contexts/RoleContext';
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
    queryKey: ['/api/me/effective-permissions'],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Fallback: my-permissions if effective endpoint not yet available
  const { data: legacyData } = useQuery<MyPermissionsResponse>({
    queryKey: ['/api/school-admin/user-locations/my-permissions'],
    staleTime: 5 * 60 * 1000,
    enabled: isError || (!isLoading && !apiData),
  });

  const effective: EffectivePermissions = useMemo(() => {
    if (apiData) {
      return {
        flags: apiData.flags,
        accessibleLocationIds: apiData.accessibleLocationIds,
        canAccessEntireSchool: apiData.canAccessEntireSchool,
        isSchoolAdminBypass: apiData.isSchoolAdminBypass,
        showAdminNavGroups: apiData.showAdminNavGroups,
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
  }, [apiData, legacyData, activeRole, allRoles]);

  const visibleNav: NavRegistryItem[] = useMemo(
    () => filterNavRegistry(effective),
    [effective],
  );

  return {
    effective,
    isLoading: isLoading && !apiData && !legacyData,
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
