import { useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { useToast } from "@/hooks/use-toast";

export type LayoutType = 'schoolAdmin' | 'parent' | 'educator';

export interface UseRoleAwareLayoutOptions {
  redirectOnUnauthenticated?: boolean;
  redirectOnMissingRole?: boolean;
  showToastOnMissingRole?: boolean;
}

export interface UseRoleAwareLayoutResult {
  layoutType: LayoutType;
  isLoading: boolean;
  shouldRedirect: boolean;
  activeRole: string;
  isAuthenticated: boolean;
  isSchoolAdminContext: boolean;
  isParentContext: boolean;
  isEducatorContext: boolean;
}

const defaultOptions: UseRoleAwareLayoutOptions = {
  redirectOnUnauthenticated: true,
  redirectOnMissingRole: true,
  showToastOnMissingRole: true,
};

export function useRoleAwareLayout(options: UseRoleAwareLayoutOptions = {}): UseRoleAwareLayoutResult {
  const mergedOptions = { ...defaultOptions, ...options };
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { activeRole, isLoadingRoles } = useRole();
  const { toast } = useToast();

  const hasHandledMissingRole = useRef(false);
  const hasHandledUnauthenticated = useRef(false);

  useEffect(() => {
    if (mergedOptions.redirectOnUnauthenticated && !isAuthLoading && !isAuthenticated && !hasHandledUnauthenticated.current) {
      hasHandledUnauthenticated.current = true;
      setLocation('/login');
    }
    if (isAuthenticated) {
      hasHandledUnauthenticated.current = false;
    }
  }, [isAuthLoading, isAuthenticated, setLocation, mergedOptions.redirectOnUnauthenticated]);

  useEffect(() => {
    if (
      mergedOptions.redirectOnMissingRole &&
      !isAuthLoading &&
      isAuthenticated &&
      !isLoadingRoles &&
      !activeRole &&
      !hasHandledMissingRole.current
    ) {
      hasHandledMissingRole.current = true;
      if (mergedOptions.showToastOnMissingRole) {
        toast({
          title: "Session Error",
          description: "Unable to determine your role. Please try logging in again.",
          variant: "destructive",
        });
      }
      setLocation('/login');
    }
    if (activeRole) {
      hasHandledMissingRole.current = false;
    }
  }, [isAuthLoading, isAuthenticated, isLoadingRoles, activeRole, setLocation, toast, mergedOptions.redirectOnMissingRole, mergedOptions.showToastOnMissingRole]);

  const isLoading = isAuthLoading || isLoadingRoles;
  
  // shouldRedirect respects the configurable options
  // Only report shouldRedirect=true if the corresponding redirect option is enabled
  const shouldRedirectForUnauthenticated = !!(mergedOptions.redirectOnUnauthenticated && 
                                            !isAuthLoading && !isAuthenticated);
  const shouldRedirectForMissingRole = !!(mergedOptions.redirectOnMissingRole && 
                                        !isAuthLoading && isAuthenticated && !isLoadingRoles && !activeRole);
  const shouldRedirect = shouldRedirectForUnauthenticated || shouldRedirectForMissingRole;

  const currentPath = useMemo(() => {
    return location || (typeof window !== 'undefined' ? window.location.pathname : '/');
  }, [location]);

  const normalizedLocation = useMemo(() => {
    return currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
  }, [currentPath]);

  const isSchoolAdminContext = useMemo(() => {
    return activeRole === 'schoolAdmin' || normalizedLocation.startsWith('/school-admin/');
  }, [activeRole, normalizedLocation]);

  const isParentContext = useMemo(() => {
    if (activeRole === 'parent') return true;
    if (activeRole) return false;
    return normalizedLocation.startsWith('/parent/') || 
           normalizedLocation.startsWith('/dashboard') ||
           normalizedLocation.startsWith('/children/') ||
           normalizedLocation.startsWith('/enrollment') ||
           normalizedLocation.startsWith('/cart') ||
           normalizedLocation.startsWith('/checkout');
  }, [activeRole, normalizedLocation]);

  const isEducatorContext = useMemo(() => {
    return activeRole === 'educator' || normalizedLocation.startsWith('/educator/');
  }, [activeRole, normalizedLocation]);

  const layoutType = useMemo((): LayoutType => {
    if (isSchoolAdminContext) return 'schoolAdmin';
    if (isEducatorContext) return 'educator';
    return 'parent';
  }, [isSchoolAdminContext, isEducatorContext]);

  return {
    layoutType,
    isLoading,
    shouldRedirect,
    activeRole,
    isAuthenticated,
    isSchoolAdminContext,
    isParentContext,
    isEducatorContext,
  };
}

export default useRoleAwareLayout;
