import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";

interface RoleContextType {
  activeRole: string;
  setActiveRole: (role: string) => void;
  availableRoles: string[];
  canSwitchRoles: boolean;
  showRoleSelection: boolean;
  setShowRoleSelection: (show: boolean) => void;
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
  // Start with empty role - always fetch from database as source of truth
  // localStorage is only used as a cache after database confirms the role
  const [activeRole, setActiveRole] = useState<string>('');

  const [showRoleSelection, setShowRoleSelection] = useState<boolean>(false);
  const [canSwitchRoles, setCanSwitchRoles] = useState<boolean>(false);

  const availableRoles = canSwitchRoles
    ? ['parent', 'schoolAdmin', 'superAdmin']
    : [user?.user_metadata?.role || 'parent'];

  // Check if user has multiple roles and handle role selection
  const checkUserRoles = (user: any) => {
    // Multi-role users can switch between different roles
    // This list should be managed in the database in the future
    const multiRoleUsers = ['corey@americanseekersacademy.com'];
    return multiRoleUsers.includes(user?.email);
  };
  
  // Fetch user role from backend database
  const fetchUserRole = async (email: string): Promise<string> => {
    try {
      console.log(`🔍 Fetching role for user: ${email}`);
      const response = await fetch(`/api/users/role/${encodeURIComponent(email)}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Role fetched for ${email}:`, data.role);
        return data.role;
      } else {
        console.log(`⚠️ User not found in database: ${email}, defaulting to parent`);
        return 'parent';
      }
    } catch (error) {
      console.error(`❌ Error fetching role for ${email}:`, error);
      return 'parent';
    }
  };

  // Get user role from backend database
  const getUserRole = async (user: any): Promise<string> => {
    // Always fetch role from backend database - no hardcoded emails
    return await fetchUserRole(user?.email);
  };

  // Handle role selection logic immediately after login
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

      console.log('🔄 Role check for user:', user.email);
      const hasMultipleRoles = checkUserRoles(user);
      const savedRole = localStorage.getItem('activeRole');
      
      // Always fetch the role from database first (source of truth)
      const databaseRole = await getUserRole(user);
      console.log(`🔄 Database role for ${user.email}: ${databaseRole}, localStorage role: ${savedRole || 'none'}`);
      
      // Validate localStorage against database
      if (savedRole && savedRole !== databaseRole) {
        console.warn(`⚠️ Role mismatch detected! localStorage: ${savedRole}, database: ${databaseRole}. Using database value.`);
        localStorage.setItem('activeRole', databaseRole);
      }

      if (hasMultipleRoles) {
        console.log(`🎯 Multi-role user detected:`, user.email);
        if (!savedRole || savedRole !== databaseRole) {
          console.log(`🎯 No saved role or mismatch - showing role selection`);
          setShowRoleSelection(true);
          setActiveRole('');
        } else {
          console.log(`🎯 Found valid saved role: ${savedRole}`);
          setActiveRole(savedRole);
          setShowRoleSelection(false);
        }
        setCanSwitchRoles(true); // Enable role switching for multi-role users
      } else {
        // Single role user - use database role (already fetched)
        console.log(`🎯 Single role user - setting role: ${databaseRole} for ${user.email}`);
        setActiveRole(databaseRole);
        localStorage.setItem('activeRole', databaseRole);
        // Allow role switching for superAdmin
        setCanSwitchRoles(databaseRole === 'superAdmin');
        setShowRoleSelection(false);
      }
    };

    handleRoleAssignment();
  }, [user]);

  const handleRoleChange = (role: string) => {
    if (availableRoles.includes(role)) {
      console.log(`🔄 Switching role to: ${role}`);
      setActiveRole(role);
      localStorage.setItem('activeRole', role);
      setShowRoleSelection(false);
      console.log(`🔄 Role change complete - new activeRole:`, role);

      // Force page refresh to ensure clean state
      window.location.reload();
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
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};