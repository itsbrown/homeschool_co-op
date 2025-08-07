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

const RoleContext = createContext<RoleContextType | undefined>(undefined);

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

  // Define which users can switch roles - hardcode for now since we know this user should have multi-role access
  const multiRoleUsers = ['coreycreates@gmail.com', 'corey@americanseekersacademy.com'];
  // For coreycreates@gmail.com, always enable role switching regardless of user object state

  const availableRoles = canSwitchRoles
    ? ['parent', 'school_admin', 'superAdmin']
    : [user?.user_metadata?.role || 'parent'];

  // Check if user has multiple roles and handle role selection
  const checkUserRoles = (user: any) => {
    const multiRoleUsers = ['coreycreates@gmail.com', 'corey@americanseekersacademy.com'];
    return multiRoleUsers.includes(user?.email);
  };
  
  // Special handling for superAdmin users
  const getSuperAdminRole = (user: any) => {
    if (user?.email === 'corey@americanseekersacademy.com') {
      return 'superAdmin';
    }
    return user?.user_metadata?.role || 'parent';
  };

  // Handle role selection logic immediately after login
  useEffect(() => {
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
      // Single role user - set default role immediately
      const defaultRole = getSuperAdminRole(user);
      console.log(`🎯 Single role user - setting role: ${defaultRole} for ${user.email}`);
      
      // Special handling for superAdmin users - ensure they get superAdmin role
      if (user.email === 'corey@americanseekersacademy.com') {
        console.log(`🔑 Forcing superAdmin role for: ${user.email}`);
        setActiveRole('superAdmin');
        localStorage.setItem('activeRole', 'superAdmin');
        setCanSwitchRoles(true); // Allow role switching for superAdmin
      } else {
        setActiveRole(defaultRole);
        localStorage.setItem('activeRole', defaultRole);
        setCanSwitchRoles(false); // Disable role switching for single-role users
      }
      setShowRoleSelection(false);
    }
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