import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

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
  canSwitchRoles: boolean;
  showRoleSelection: boolean;
  setShowRoleSelection: (show: boolean) => void;
  isLoadingRoles: boolean;
}

export const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const useRole = () => {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
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

  // Fetch user roles from database
  const { data: rolesData, isLoading: isLoadingRoles, error: rolesError } = useQuery({
    queryKey: ['/api/user/roles', user?.email],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/user/roles', {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch roles');
      }
      return response.json();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Show error toast if role fetch fails
  useEffect(() => {
    if (rolesError) {
      console.error('❌ Failed to load roles:', rolesError);
      toast({
        title: 'Failed to load roles',
        description: 'Unable to load your account roles. Please try refreshing the page.',
        variant: 'destructive',
      });
    }
  }, [rolesError, toast]);

  const availableRoles: UserRole[] = rolesData?.roles || [];

  // Determine if user has multiple roles
  const hasMultipleRoles = availableRoles.length > 1;

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

      if (hasMultipleRoles) {
        console.log(`🎯 Multi-role user detected:`, user.email, 'roles:', availableRoles.map(r => r.role));
        setActiveRole(currentActiveRole);
        setActiveRoleId(currentActiveRoleId);
        setCanSwitchRoles(true);
        setShowRoleSelection(false);
      } else {
        // Single role user (or user with basic role only)
        console.log(`🎯 Single role user - setting role: ${currentActiveRole} for ${user.email}`);
        setActiveRole(currentActiveRole);
        setActiveRoleId(currentActiveRoleId);
        // Allow role switching for superAdmin
        setCanSwitchRoles(currentActiveRole === 'superAdmin');
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

      // Update local state with roleId from backend
      setActiveRole(data.activeRole);
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

  console.log(`🔄 RoleProvider rendering - activeRole: ${activeRole}, canSwitchRoles: ${canSwitchRoles}, showRoleSelection: ${showRoleSelection}, user: ${user?.email}`);

  return (
    <RoleContext.Provider
      value={{
        activeRole,
        activeRoleId,
        setActiveRole: handleRoleChange,
        availableRoles,
        canSwitchRoles,
        showRoleSelection,
        setShowRoleSelection,
        isLoadingRoles,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};