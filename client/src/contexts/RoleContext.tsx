import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface UserRole {
  id: number;
  role: string;
  schoolId: number;
  schoolName?: string;
  isPrimary: boolean;
}

interface RoleContextType {
  activeRole: string;
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

  // Get active role ID from rolesData
  const getActiveRoleId = (): number | null => {
    return rolesData?.activeRoleId || null;
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
      const savedRole = localStorage.getItem('activeRole');
      
      // Determine current active role
      let currentActiveRole = '';
      const activeRoleId = getActiveRoleId();
      
      if (activeRoleId) {
        // User has an active role set in the database
        const activeRoleData = availableRoles.find(r => r.id === activeRoleId);
        if (activeRoleData) {
          currentActiveRole = activeRoleData.role;
          console.log(`🔄 Active role from database: ${currentActiveRole}`);
        }
      }
      
      // If no active role in database, use primary role
      if (!currentActiveRole) {
        currentActiveRole = getPrimaryRole();
        console.log(`🔄 Using primary role: ${currentActiveRole}`);
      }
      
      // Validate localStorage against database
      if (savedRole && savedRole !== currentActiveRole) {
        console.warn(`⚠️ Role mismatch detected! localStorage: ${savedRole}, database: ${currentActiveRole}. Using database value.`);
        localStorage.setItem('activeRole', currentActiveRole);
      }

      if (hasMultipleRoles) {
        console.log(`🎯 Multi-role user detected:`, user.email, 'roles:', availableRoles.map(r => r.role));
        setActiveRole(currentActiveRole);
        localStorage.setItem('activeRole', currentActiveRole);
        setCanSwitchRoles(true);
        setShowRoleSelection(false);
      } else {
        // Single role user
        console.log(`🎯 Single role user - setting role: ${currentActiveRole} for ${user.email}`);
        setActiveRole(currentActiveRole);
        localStorage.setItem('activeRole', currentActiveRole);
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

      // Update local state
      setActiveRole(data.activeRole);
      localStorage.setItem('activeRole', data.activeRole);
      setShowRoleSelection(false);

      // Force page refresh to ensure clean state (especially if school changed)
      window.location.reload();
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