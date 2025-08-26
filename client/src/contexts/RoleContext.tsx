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

  // For coreycreates@gmail.com, direct routing to school_admin without role switching

  const availableRoles = canSwitchRoles
    ? ['parent', 'school_admin', 'superAdmin']
    : [user?.user_metadata?.role || 'parent'];

  // Check if user has multiple roles and handle role selection
  const checkUserRoles = (user: any) => {
    // Only corey@americanseekersacademy.com has multiple roles
    // coreycreates@gmail.com should go directly to school_admin role
    const multiRoleUsers = ['corey@americanseekersacademy.com'];
    return multiRoleUsers.includes(user?.email);
  };
  
  // Special handling for superAdmin users and school admins
  const getSuperAdminRole = (user: any) => {
    if (user?.email === 'corey@americanseekersacademy.com') {
      return 'superAdmin';
    }
    if (user?.email === 'coreycreates@gmail.com') {
      return 'school_admin';
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
      
      // Special handling for specific users
      if (user.email === 'corey@americanseekersacademy.com') {
        console.log(`🔑 Forcing educator role for: ${user.email}`);
        // Clear any cached parent role
        localStorage.removeItem('activeRole');
        localStorage.removeItem('selectedRole');
        localStorage.removeItem('userRole');
        setActiveRole('educator');
        localStorage.setItem('activeRole', 'educator');
        setCanSwitchRoles(true); // Allow role switching for educator
      } else if (user.email === 'coreycreates@gmail.com') {
        console.log(`🔑 Forcing school_admin role for: ${user.email}`);
        setActiveRole('school_admin');
        localStorage.setItem('activeRole', 'school_admin');
        setCanSwitchRoles(false); // Direct to school admin, no role switching
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