import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { supabase } from "@/components/SupabaseProvider";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Typed error for definitive auth failures that should not be retried
class RolesAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RolesAuthError';
    this.status = status;
  }
}

const ROLES_FETCH_TIMEOUT_MS = 10_000;

// Maximum retry attempts for role loading (for newly registered users)
const MAX_ROLE_RETRY_ATTEMPTS = 3;
const ROLE_RETRY_DELAY_MS = 1500;

interface UserRole {
  id: number;
  role: string;
  schoolId: number;
  schoolName?: string;
  isPrimary: boolean;
}

interface RoleContextType {
  activeRole: string;
  activeRoleId: number | null;
  setActiveRole: (roleId: number) => void;
  availableRoles: UserRole[];
  allRoles: string[];
  hasRole: (role: string | string[]) => boolean;
  canSwitchRoles: boolean;
  showRoleSelection: boolean;
  setShowRoleSelection: (show: boolean) => void;
  isLoadingRoles: boolean;
  isSettingUpAccount: boolean;
  /** True after all retries are exhausted and roles could not be loaded */
  rolesLoadFailed: boolean;
}

export const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const useRole = () => {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
};

export const silentRoleContextUpdate = (roleName: string): void => {
  localStorage.setItem('activeRole', roleName);
};

interface RoleProviderProps {
  children: React.ReactNode;
}

export const RoleProvider: React.FC<RoleProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  // Start with empty role - always fetch from database as source of truth
  // localStorage is only used as a cache after database confirms the role
  const [activeRole, setActiveRole] = useState<string>('');
  const [activeRoleId, setActiveRoleId] = useState<number | null>(null);

  const [showRoleSelection, setShowRoleSelection] = useState<boolean>(false);
  const [canSwitchRoles, setCanSwitchRoles] = useState<boolean>(false);
  
  // Retry mechanism for newly registered users
  const [roleRetryCount, setRoleRetryCount] = useState<number>(0);
  const [isSettingUpAccount, setIsSettingUpAccount] = useState<boolean>(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch user roles from database with retry logic
  const { data: rolesData, isLoading: isLoadingRoles, error: rolesError, refetch: refetchRoles } = useQuery({
    queryKey: ['/api/user/roles', user?.email],
    queryFn: async ({ signal }) => {
      console.log('🔍 Fetching user roles from database...');

      // Combine TanStack abort signal with our own timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ROLES_FETCH_TIMEOUT_MS);

      // Propagate external abort (e.g. query cancellation) to our controller
      signal?.addEventListener('abort', () => controller.abort());

      let response: Response;
      try {
        response = await apiRequest('GET', '/api/user/roles', undefined, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 403) {
        let errorCode = '';
        let errorMessage = '';
        let errorEmail = '';
        try {
          const body = await response.json() as { error?: string; message?: string; email?: string };
          errorCode = body.error ?? '';
          errorMessage = body.message ?? '';
          errorEmail = body.email ?? '';
        } catch {
          // ignore JSON parse errors
        }

        if (errorCode === 'REGISTRATION_REQUIRED') {
          console.log('🚫 REGISTRATION_REQUIRED on roles fetch — signing out and redirecting to login');
          localStorage.removeItem('supabase_token');
          localStorage.removeItem('activeRole');
          await supabase.auth.signOut();
          sessionStorage.setItem('registration_required_message', errorMessage);
          sessionStorage.setItem('registration_required_email', errorEmail);
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login?error=registration_required';
          }
          // Throw non-retryable error
          throw new RolesAuthError('REGISTRATION_REQUIRED', 403);
        }

        // Other 403 — exit loading state gracefully, do not retry
        throw new RolesAuthError(`403: ${errorCode || 'Forbidden'}`, 403);
      }

      const data = await response.json() as { roles: UserRole[]; activeRole: string; activeRoleId?: number; userId?: number };
      console.log('📋 Roles data received:', { 
        roleCount: data.roles?.length || 0, 
        activeRole: data.activeRole,
        activeRoleId: data.activeRoleId 
      });
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: (failureCount, error: unknown) => {
      // Do not retry on definitive auth failures (403)
      if (error instanceof RolesAuthError) return false;
      // Retry up to 2 times for network/server errors
      return failureCount < 2;
    },
  });

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Handle retry logic for newly registered users with empty roles
  useEffect(() => {
    // Only retry if:
    // 1. User is authenticated
    // 2. Roles data loaded successfully (not loading/error)
    // 3. No roles were returned (empty array)
    // 4. But there's a fallback activeRole from the API (users.role column)
    // 5. Haven't exceeded max retries
    // 6. No retry timeout already pending (prevents race condition)
    if (
      user && 
      rolesData && 
      !isLoadingRoles && 
      !rolesError &&
      Array.isArray(rolesData.roles) && 
      rolesData.roles.length === 0 &&
      rolesData.activeRole && // Has fallback role from users.role
      roleRetryCount < MAX_ROLE_RETRY_ATTEMPTS &&
      !retryTimeoutRef.current // Guard: don't re-enter if timeout pending
    ) {
      // Increment counter SYNCHRONOUSLY when scheduling retry
      // This prevents race condition where effect re-runs before timeout fires
      const nextRetryCount = roleRetryCount + 1;
      setRoleRetryCount(nextRetryCount);
      setIsSettingUpAccount(true);
      
      console.log(`🔄 Empty roles array detected, scheduling retry... (attempt ${nextRetryCount}/${MAX_ROLE_RETRY_ATTEMPTS})`);
      
      retryTimeoutRef.current = setTimeout(() => {
        // Clear ref to allow next retry
        retryTimeoutRef.current = null;
        queryClient.invalidateQueries({ queryKey: ['/api/user/roles', user?.email] });
        refetchRoles();
      }, ROLE_RETRY_DELAY_MS);
    } else if (rolesData?.roles?.length > 0) {
      // Successfully loaded roles - reset retry state and clear any pending timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setRoleRetryCount(0);
      setIsSettingUpAccount(false);
    } else if (roleRetryCount >= MAX_ROLE_RETRY_ATTEMPTS) {
      // Retries exhausted - reset setting up state to avoid indefinite loading
      console.log(`❌ Role loading retries exhausted (${MAX_ROLE_RETRY_ATTEMPTS} attempts)`);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setIsSettingUpAccount(false);
    }
  }, [user, rolesData, isLoadingRoles, rolesError, roleRetryCount, refetchRoles]);

  // Also reset isSettingUpAccount on error
  useEffect(() => {
    if (rolesError) {
      setIsSettingUpAccount(false);
    }
  }, [rolesError]);

  // Show error toast if role fetch fails (after retries exhausted)
  useEffect(() => {
    if (rolesError && roleRetryCount >= MAX_ROLE_RETRY_ATTEMPTS) {
      console.error('❌ Failed to load roles after retries:', rolesError);
      toast({
        title: 'Account setup issue',
        description: 'Unable to load your account settings. Please try refreshing the page or contact support if this persists.',
        variant: 'destructive',
      });
    }
  }, [rolesError, roleRetryCount, toast]);

  // Show "Setting up account" toast for newly registered users
  useEffect(() => {
    if (isSettingUpAccount && roleRetryCount === 1) {
      console.log('🔧 Account setup in progress...');
      toast({
        title: 'Setting up your account...',
        description: 'Please wait while we prepare your dashboard.',
      });
    }
  }, [isSettingUpAccount, roleRetryCount, toast]);

  // Store userId in sessionStorage for error tracking (always when rolesData changes)
  useEffect(() => {
    try {
      if (rolesData?.userId) {
        sessionStorage.setItem('userId', String(rolesData.userId));
      }
    } catch {
      // Silently fail if sessionStorage unavailable
    }
  }, [rolesData?.userId]);

  const availableRoles: UserRole[] = rolesData?.roles || [];

  // Determine if user has multiple roles
  const hasMultipleRoles = availableRoles.length > 1;

  // Compute all roles at the user's current school for additive permission checks.
  // When activeRole is set, derive the current schoolId from that role's entry.
  const getCurrentSchoolId = (): number | null => {
    if (activeRoleId) {
      const r = availableRoles.find(r => r.id === activeRoleId);
      if (r) return r.schoolId;
    }
    const primary = availableRoles.find(r => r.isPrimary);
    return primary?.schoolId ?? availableRoles[0]?.schoolId ?? null;
  };

  // allRoles: all role names the user holds at their current school (lowercased).
  // School-scoped for multi-tenant security.
  const allRoles: string[] = (() => {
    const schoolId = getCurrentSchoolId();
    if (!schoolId) return activeRole ? [activeRole.toLowerCase()] : [];
    const rolesAtSchool = availableRoles
      .filter(r => r.schoolId === schoolId)
      .map(r => r.role.toLowerCase());
    return rolesAtSchool.length > 0 ? rolesAtSchool : (activeRole ? [activeRole.toLowerCase()] : []);
  })();

  // Role hierarchy: higher roles implicitly satisfy lower role requirements
  const roleHierarchyMap: Record<string, string[]> = {
    superadmin: ['admin', 'schooladmin', 'director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
    admin: ['schooladmin', 'director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
    schooladmin: ['director', 'teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
    director: ['teacher', 'educator', 'mentor', 'parent', 'student', 'learner'],
    teacher: ['parent', 'student', 'learner'],
    educator: ['parent', 'student', 'learner'],
    mentor: ['student', 'learner'],
    parent: ['student', 'learner'],
    student: [],
    learner: [],
  };

  // hasRole: returns true if the user holds any of the given roles at their current school,
  // either directly or via hierarchy. Accepts a single role or an array of roles.
  const hasRole = (role: string | string[]): boolean => {
    const roleList = Array.isArray(role) ? role : [role];
    return roleList.some(target => {
      const t = target.toLowerCase();
      // Direct check
      if (allRoles.includes(t)) return true;
      // Hierarchical check: any role in allRoles that subsumes the target
      return allRoles.some(r => {
        const inherited = roleHierarchyMap[r] || [];
        return inherited.includes(t);
      });
    });
  };

  // Get the primary role from available roles
  const getPrimaryRole = (): string => {
    const primaryRole = availableRoles.find(r => r.isPrimary);
    return primaryRole?.role || availableRoles[0]?.role || 'parent';
  };

  // Get active role from backend activeRoleId
  const getActiveRoleFromId = (): { role: string; id: number } | null => {
    const activeId = rolesData?.activeRoleId;
    if (!activeId) return null;
    
    const activeRoleData = availableRoles.find(r => r.id === activeId);
    if (!activeRoleData) return null;
    
    return { role: activeRoleData.role, id: activeRoleData.id };
  };

  // Handle role selection logic when roles data changes
  useEffect(() => {
    const handleRoleAssignment = async () => {
      console.log('🔄 RoleContext useEffect triggered - user:', user?.email || 'null');

      if (!user) {
        console.log('🔄 No user - resetting state and clearing storage');
        setActiveRole('');
        setCanSwitchRoles(false);
        setShowRoleSelection(false);

        // Clear ALL role-related localStorage on logout
        localStorage.removeItem('selectedRole');
        localStorage.removeItem('userRole');
        localStorage.removeItem('activeRole');
        
        // Clear error tracking context from sessionStorage
        try {
          sessionStorage.removeItem('userId');
        } catch {
          // Silently fail if sessionStorage unavailable
        }
        return;
      }

      // Wait for roles to load
      if (isLoadingRoles || !rolesData) {
        console.log('🔄 Waiting for roles data to load...');
        return;
      }

      console.log('🔄 Roles loaded for user:', user.email, 'roles:', availableRoles.length);
      
      // Determine the current active role from database activeRoleId
      const activeRoleFromDb = getActiveRoleFromId();
      let currentActiveRole = '';
      let currentActiveRoleId: number | null = null;
      
      if (activeRoleFromDb) {
        currentActiveRole = activeRoleFromDb.role;
        currentActiveRoleId = activeRoleFromDb.id;
        console.log(`🔄 Active role from database: ${currentActiveRole} (ID: ${currentActiveRoleId})`);
      } else {
        // If no active role in database, use primary role
        const primaryRole = availableRoles.find(r => r.isPrimary);
        if (primaryRole) {
          currentActiveRole = primaryRole.role;
          currentActiveRoleId = primaryRole.id;
          console.log(`🔄 Using primary role: ${currentActiveRole} (ID: ${currentActiveRoleId})`);
        } else if (rolesData?.activeRole) {
          // FALLBACK: For users with no user_roles entries (e.g., newly registered parents),
          // use the activeRole field from the API response which falls back to users.role
          currentActiveRole = rolesData.activeRole;
          currentActiveRoleId = rolesData.activeRoleId || null;
          console.log(`🔄 Using fallback activeRole from API: ${currentActiveRole} (ID: ${currentActiveRoleId})`);
        }
      }

      // Normalize role to canonical casing for consistent routing/matching
      // Handles database values like "Mentor" -> "mentor", "SchoolAdmin" -> "schoolAdmin"
      const normalizeRoleCasing = (role: string): string => {
        const lowerRole = role.toLowerCase();
        const roleMap: Record<string, string> = {
          'superadmin': 'superAdmin',
          'schooladmin': 'schoolAdmin',
          'mentor': 'mentor',
          'educator': 'educator',
          'parent': 'parent',
          'admin': 'admin',
          'student': 'student',
          'learner': 'learner',
          'teacher': 'teacher',
        };
        return roleMap[lowerRole] || role;
      };
      
      const normalizedRole = normalizeRoleCasing(currentActiveRole);
      
      // canSwitchRoles: true only when the user has roles spanning more than one school
      const distinctSchoolIds = new Set(availableRoles.map(r => r.schoolId));
      const rolesAcrossMultipleSchools = distinctSchoolIds.size > 1;

      if (hasMultipleRoles) {
        console.log(`🎯 Multi-role user detected:`, user.email, 'roles:', availableRoles.map(r => r.role));
        setActiveRole(normalizedRole);
        setActiveRoleId(currentActiveRoleId);
        setCanSwitchRoles(rolesAcrossMultipleSchools);
        setShowRoleSelection(false);
      } else {
        // Single role user (or user with basic role only)
        console.log(`🎯 Single role user - setting role: ${normalizedRole} for ${user.email}`);
        setActiveRole(normalizedRole);
        setActiveRoleId(currentActiveRoleId);
        setCanSwitchRoles(false);
        setShowRoleSelection(false);
      }
    };

    handleRoleAssignment();
  }, [user, rolesData, isLoadingRoles]);

  const handleRoleChange = async (roleId: number) => {
    try {
      console.log(`🔄 Switching to role ID: ${roleId}`);
      
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/user/switch-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({ roleId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to switch role' }));
        throw new Error(errorData.error || 'Failed to switch role');
      }

      const data = await response.json();
      console.log(`🔄 Role switch successful:`, data);

      // Normalize role to canonical casing
      const normalizeRoleCasing = (role: string): string => {
        const lowerRole = role.toLowerCase();
        const roleMap: Record<string, string> = {
          'superadmin': 'superAdmin',
          'schooladmin': 'schoolAdmin',
          'mentor': 'mentor',
          'educator': 'educator',
          'parent': 'parent',
          'admin': 'admin',
          'student': 'student',
          'learner': 'learner',
          'teacher': 'teacher',
        };
        return roleMap[lowerRole] || role;
      };
      
      // Update local state with roleId from backend (normalize casing)
      const normalizedSwitchedRole = data.activeRole ? normalizeRoleCasing(data.activeRole) : '';
      setActiveRole(normalizedSwitchedRole);
      setActiveRoleId(data.activeRoleId);
      setShowRoleSelection(false);

      // Invalidate all role-scoped queries to ensure fresh data
      // This includes school-admin, parent, educator, and user-specific queries
      console.log('🔄 Invalidating cached queries after role switch...');
      await queryClient.invalidateQueries({ queryKey: ['/api/user/roles'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/school-admin'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/parent'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/educator'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      console.log('✅ Cache invalidation complete');

      toast({
        title: 'Role switched',
        description: `Switched to ${data.activeRole} role successfully`,
      });
    } catch (error) {
      console.error('❌ Error switching role:', error);
      toast({
        title: 'Failed to switch role',
        description: error instanceof Error ? error.message : 'Unable to switch to the selected role. Please try again.',
        variant: 'destructive',
      });
    }
  };

  console.log(`🔄 RoleProvider rendering - activeRole: ${activeRole}, canSwitchRoles: ${canSwitchRoles}, showRoleSelection: ${showRoleSelection}, isSettingUpAccount: ${isSettingUpAccount}, user: ${user?.email}`);

  // rolesLoadFailed: true when roles query has errored out (all retries exhausted)
  // and we are no longer loading — signals UI to redirect instead of spinning forever
  const rolesLoadFailed = !!rolesError && !isLoadingRoles;

  return (
    <RoleContext.Provider
      value={{
        activeRole,
        activeRoleId,
        setActiveRole: handleRoleChange,
        availableRoles,
        allRoles,
        hasRole,
        canSwitchRoles,
        showRoleSelection,
        setShowRoleSelection,
        isLoadingRoles,
        isSettingUpAccount,
        rolesLoadFailed,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};