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

  // Handle role selection logic for multi-role users
  useEffect(() => {
    console.log(`🔄 RoleContext useEffect - user:`, user?.email, 'savedRole:', localStorage.getItem('activeRole'));
    
    if (user?.email === 'coreycreates@gmail.com') {
      // For testing, clear any saved role to force role selection
      localStorage.removeItem('activeRole');
      console.log(`🎯 Multi-role user detected - clearing saved role and showing selection`);
      setShowRoleSelection(true);
      setActiveRole('');
    } else if (user && !localStorage.getItem('activeRole')) {
      // Single role user - set default role
      const defaultRole = user.user_metadata?.role || 'parent';
      console.log(`🎯 Single role user - setting default role:`, defaultRole);
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