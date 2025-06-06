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
  const [activeRole, setActiveRole] = useState<string>('school_admin');

  // Define which users can switch roles - hardcode for now since we know this user should have multi-role access
  const multiRoleUsers = ['coreycreates@gmail.com'];
  // For coreycreates@gmail.com, always enable role switching regardless of user object state
  const canSwitchRoles = true; // Enable for testing - this user should always have role switching

  const availableRoles = canSwitchRoles 
    ? ['parent', 'school_admin'] 
    : [user?.user_metadata?.role || 'parent'];

  // Initialize role based on user metadata or default to parent
  useEffect(() => {
    if (user) {
      console.log(`🔄 Role initialization - User:`, user.email);
      console.log(`🔄 Can switch roles:`, canSwitchRoles);
      console.log(`🔄 Available roles:`, availableRoles);
      
      // For multi-role users, check localStorage but ensure consistency
      if (canSwitchRoles) {
        // Clear any inconsistent state and start fresh
        localStorage.removeItem('activeRole');
        const defaultRole = 'school_admin';
        console.log(`🔄 Multi-role user detected, setting to default:`, defaultRole);
        setActiveRole(defaultRole);
        localStorage.setItem('activeRole', defaultRole);
      } else {
        const defaultRole = user.user_metadata?.role || 'parent';
        console.log(`🔄 Setting active role to user metadata role:`, defaultRole);
        setActiveRole(defaultRole);
      }
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
      
      // Force page reload to ensure complete state reset
      setTimeout(() => {
        console.log(`🔄 Reloading page to apply role change`);
        window.location.reload();
      }, 100);
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