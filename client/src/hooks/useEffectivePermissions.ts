/**
 * Client hook: effective permissions from server (fail closed while loading/error).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ACTIVE_ROLE_CHANGED_EVENT,
  useRole,
} from '@/contexts/RoleContext';
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
  const { activeRole, allRoles, isLoadingRoles, rolesBootstrapRole, isAccountReady } =
    useRole();

  // apiRequest sends X-Active-Role from localStorage; ParentAppShell may update
  // that via silentRoleContextUpdate without changing RoleContext.activeRole.
  // Only trust storage when the user actually holds that role (mirror server).
  const [storageRole, setStorageRole] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('activeRole') || '' : '',
  );
  useEffect(() => {
    const sync = () => setStorageRole(localStorage.getItem('activeRole') || '');
    window.addEventListener(ACTIVE_ROLE_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ACTIVE_ROLE_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const heldRoleSet = useMemo(
    () => new Set((allRoles ?? []).map((r) => r.toLowerCase())),
    [allRoles],
  );
  const trustedStorageRole =
    storageRole && heldRoleSet.has(storageRole.toLowerCase()) ? storageRole : '';
  // Prefer storage (silent switch) → RoleContext → bootstrap role from /api/user/roles
  // so we do not flash Forbidden in the gap before setActiveRole runs.
  const permissionRole =
    trustedStorageRole || activeRole || rolesBootstrapRole || '';

  const {
    data: apiData,
    isLoading,
    isError,
    error,
  } = useQuery<EffectivePermissionsApiResponse>({
    // Include permissionRole for cache separation only. Default getQueryFn joins
    // key segments into the URL, so use an explicit queryFn for the real path.
    queryKey: ['/api/me/effective-permissions', permissionRole],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/me/effective-permissions');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !!permissionRole,
  });

  // Match against the role the API actually used (header / storage), not only RoleContext.
  const roleMatchedApiData =
    apiData &&
    apiData.activeRole?.toLowerCase() === permissionRole.toLowerCase()
      ? apiData
      : undefined;

  const legacyEnabled =
    !!permissionRole && (isError || (!isLoading && !roleMatchedApiData));

  // Fallback: my-permissions if effective endpoint not yet available
  const {
    data: legacyData,
    isLoading: legacyLoading,
  } = useQuery<MyPermissionsResponse>({
    queryKey: ['/api/school-admin/user-locations/my-permissions', permissionRole],
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
        activeRole: permissionRole,
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

    // Loading or error with no grant payload: fail closed.
    // Do not invent bypass from a role string alone — wait for server data.
    return FAIL_CLOSED;
  }, [roleMatchedApiData, legacyData, permissionRole, allRoles]);

  const visibleNav: NavRegistryItem[] = useMemo(
    () => filterNavRegistry(effective),
    [effective],
  );

  const awaitingPrimary =
    !!permissionRole && !roleMatchedApiData && isLoading && !isError;
  const awaitingLegacy =
    legacyEnabled && !legacyData && legacyLoading && !roleMatchedApiData;
  // Stay loading until a permission role is available (covers roles-query done
  // but RoleContext setActiveRole effect not yet applied).
  const awaitingRole = !permissionRole && (isLoadingRoles || !isAccountReady);

  return {
    effective,
    isLoading:
      awaitingRole ||
      ((awaitingPrimary || awaitingLegacy) && !roleMatchedApiData && !legacyData),
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

/** Alias used by CTAs */
export function useCan(permission: PermissionKey): boolean {
  const { can, isLoading, showAdminNavGroups } = useEffectivePermissions();
  if (isLoading) return false;
  if (showAdminNavGroups) return true;
  return can(permission);
}
