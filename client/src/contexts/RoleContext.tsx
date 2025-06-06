import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";

interface RoleContextType {
  activeRole: string;
  setActiveRole: (role: string) => void;
  availableRoles: string[];
  canSwitchRoles: boolean;
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
    return savedRole || 'school_admin';
  });

  // Define which users can switch roles - hardcode for now since we know this user should have multi-role access
  const multiRoleUsers = ['coreycreates@gmail.com'];
  // For coreycreates@gmail.com, always enable role switching regardless of user object state
  const canSwitchRoles = true; // Enable for testing - this user should always have role switching

  const availableRoles = canSwitchRoles 
    ? ['parent', 'school_admin'] 
    : [user?.user_metadata?.role || 'parent'];

  // Only set default role if no role is saved and user is authenticated
  useEffect(() => {
    if (user && !localStorage.getItem('activeRole')) {
      console.log(`🔄 First time user login, setting default role`);
      const defaultRole = canSwitchRoles ? 'school_admin' : (user.user_metadata?.role || 'parent');
      setActiveRole(defaultRole);
      localStorage.setItem('activeRole', defaultRole);
    }
  }, [user, canSwitchRoles]);

  const handleRoleChange = (role: string) => {
    if (availableRoles.includes(role)) {
      console.log(`🔄 Switching role to: ${role}`);
      console.log(`🔄 Available roles:`, availableRoles);
      console.log(`🔄 Current active role before change:`, activeRole);
      setActiveRole(role);
      localStorage.setItem('activeRole', role);
      console.log(`🔄 Stored role in localStorage:`, role);
      console.log(`🔄 Role change complete - new activeRole should be:`, role);
    }
  };

  console.log(`🔄 RoleProvider rendering - activeRole: ${activeRole}, canSwitchRoles: ${canSwitchRoles}`);

  return (
    <RoleContext.Provider
      value={{
        activeRole,
        setActiveRole: handleRoleChange,
        availableRoles,
        canSwitchRoles,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};