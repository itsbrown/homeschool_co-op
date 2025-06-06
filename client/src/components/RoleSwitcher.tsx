import { useState } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, User, School } from "lucide-react";

interface RoleSwitcherProps {
  currentRole: string;
  onRoleChange: (role: string) => void;
}

export default function RoleSwitcher({ currentRole, onRoleChange }: RoleSwitcherProps) {
  const { user } = useAuth();

  // Define available roles for users who have multiple permissions
  const availableRoles = [
    { 
      id: 'parent', 
      label: 'Parent Portal', 
      icon: User,
      description: 'Access your children\'s information and programs'
    },
    { 
      id: 'school_admin', 
      label: 'School Admin', 
      icon: School,
      description: 'Manage school operations and staff'
    }
  ];

  // Only show role switcher for users with email coreycreates@gmail.com
  const shouldShowRoleSwitcher = user?.email === 'coreycreates@gmail.com';

  if (!shouldShowRoleSwitcher) {
    return null;
  }

  const currentRoleData = availableRoles.find(role => role.id === currentRole);
  
  console.log(`🎯 RoleSwitcher render - currentRole prop:`, currentRole);
  console.log(`🎯 RoleSwitcher render - currentRoleData:`, currentRoleData);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Role:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {currentRoleData && <currentRoleData.icon className="h-4 w-4" />}
            <Badge variant="secondary">{currentRoleData?.label || currentRole}</Badge>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {availableRoles.map((role) => (
            <DropdownMenuItem
              key={role.id}
              onClick={() => {
                console.log(`🎯 Role switcher clicked: ${role.id}`);
                onRoleChange(role.id);
              }}
              className="flex items-start gap-3 p-3"
            >
              <role.icon className="h-5 w-5 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">{role.label}</div>
                <div className="text-sm text-muted-foreground">
                  {role.description}
                </div>
              </div>
              {currentRole === role.id && (
                <Badge variant="default" className="ml-2">Active</Badge>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}