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

  // Define which users can switch roles - hardcode for now since we know this user should have multi-role access
  const multiRoleUsers = ['coreycreates@gmail.com'];
  // For coreycreates@gmail.com, always enable role switching regardless of user object state
  const canSwitchRoles = user?.email === 'coreycreates@gmail.com';

  const availableRoles = canSwitchRoles 
    ? ['parent', 'school_admin'] 
    : [user?.user_metadata?.role || 'parent'];

  // Check if user has multiple roles and handle role selection
  const checkUserRoles = (user: any) => {
    const multiRoleUsers = ['coreycreates@gmail.com'];
    return multiRoleUsers.includes(user?.email);
  };

  // Handle role selection logic immediately after login
  useEffect(() => {
    if (!user) {
      // User logged out - reset state
      setActiveRole('');
      setShowRoleSelection(false);
      return;
    }

    console.log(`🔄 Role check for user:`, user.email);
    const hasMultipleRoles = checkUserRoles(user);
    const savedRole = localStorage.getItem('activeRole');

    if (hasMultipleRoles) {
      console.log(`🎯 Multi-role user detected:`, user.email);
      // Clear any existing role for testing - force role selection
      localStorage.removeItem('activeRole');
      console.log(`🎯 Clearing saved role - showing role selection`);
      setShowRoleSelection(true);
      setActiveRole('');
    } else {
      // Single role user - set default role immediately
      const defaultRole = user.user_metadata?.role || 'parent';
      console.log(`🎯 Single role user - setting role: ${defaultRole}`);
      setActiveRole(defaultRole);
      localStorage.setItem('activeRole', defaultRole);
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
    }
  };

  console.log(`🔄 RoleProvider rendering - activeRole: ${activeRole}, canSwitchRoles: ${canSwitchRoles}, showRoleSelection: ${showRoleSelection}`);

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