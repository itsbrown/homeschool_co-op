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
  // Initialize from localStorage to persist role across page reloads
  const [activeRole, setActiveRole] = useState<string>(() => {
    const savedRole = localStorage.getItem('activeRole');
    return savedRole || '';
  });

  const [showRoleSelection, setShowRoleSelection] = useState<boolean>(false);
  const [canSwitchRoles, setCanSwitchRoles] = useState<boolean>(false);

  const availableRoles = canSwitchRoles
    ? ['parent', 'school_admin', 'superAdmin']
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

        // Clear role-related localStorage on logout
        localStorage.removeItem('selectedRole');
        localStorage.removeItem('userRole');
        return;
      }

      console.log('🔄 Role check for user:', user.email);
      const hasMultipleRoles = checkUserRoles(user);
      const savedRole = localStorage.getItem('activeRole');
      console.log(`🔄 hasMultipleRoles:`, hasMultipleRoles, 'savedRole:', savedRole);

      if (hasMultipleRoles) {
        console.log(`🎯 Multi-role user detected:`, user.email);
        if (!savedRole) {
          console.log(`🎯 No saved role - showing role selection`);
          setShowRoleSelection(true);
          setActiveRole('');
        } else {
          console.log(`🎯 Found saved role: ${savedRole}`);
          setActiveRole(savedRole);
          setShowRoleSelection(false);
        }
        setCanSwitchRoles(true); // Enable role switching for multi-role users
      } else {
        // Single role user - fetch role from backend database
        getUserRole(user).then((defaultRole) => {
          console.log(`🎯 Single role user - setting role: ${defaultRole} for ${user.email}`);
          setActiveRole(defaultRole);
          localStorage.setItem('activeRole', defaultRole);
          // Allow role switching for superAdmin
          setCanSwitchRoles(defaultRole === 'superAdmin');
          setShowRoleSelection(false);
        });
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