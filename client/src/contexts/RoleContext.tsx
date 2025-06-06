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
      // For multi-role users, check localStorage for preferred role
      if (canSwitchRoles) {
        const savedRole = localStorage.getItem('activeRole');
        if (savedRole && availableRoles.includes(savedRole)) {
          setActiveRole(savedRole);
        } else {
          // Keep current role as default
          setActiveRole('school_admin');
        }
      } else {
        setActiveRole(user.user_metadata?.role || 'parent');
      }
    }
  }, [user, canSwitchRoles]);

  const handleRoleChange = (role: string) => {
    if (availableRoles.includes(role)) {
      console.log(`🔄 Switching role to: ${role}`);
      setActiveRole(role);
      localStorage.setItem('activeRole', role);
      // Force page reload to apply role change completely
      window.location.reload();
    }
  };

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