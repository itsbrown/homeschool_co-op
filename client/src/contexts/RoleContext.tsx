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
  const [activeRole, setActiveRole] = useState<string>('parent');

  // Define which users can switch roles
  const multiRoleUsers = ['coreycreates@gmail.com'];
  const canSwitchRoles = user?.email ? multiRoleUsers.includes(user.email) : false;

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
          setActiveRole('parent'); // Default to parent for multi-role users
        }
      } else {
        setActiveRole(user.user_metadata?.role || 'parent');
      }
    }
  }, [user, canSwitchRoles]);

  const handleRoleChange = async (role: string) => {
    if (availableRoles.includes(role)) {
      try {
        // Call backend API to switch role context
        const response = await fetch('/api/switch-role', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}`
          },
          body: JSON.stringify({ targetRole: role })
        });

        if (response.ok) {
          setActiveRole(role);
          localStorage.setItem('activeRole', role);
          // Force page reload to apply role change completely
          window.location.reload();
        } else {
          console.error('Failed to switch role:', await response.text());
        }
      } catch (error) {
        console.error('Error switching role:', error);
        // Fallback to local role change if API fails
        setActiveRole(role);
        localStorage.setItem('activeRole', role);
        window.location.reload();
      }
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