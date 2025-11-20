import { useRole } from "@/contexts/RoleContext";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, User, School, GraduationCap, BookOpen, Shield } from "lucide-react";

// Map role names to icons and labels
const roleConfig: Record<string, { icon: any; label: string }> = {
  parent: { icon: User, label: 'Parent' },
  educator: { icon: GraduationCap, label: 'Educator' },
  teacher: { icon: GraduationCap, label: 'Teacher' },
  learner: { icon: BookOpen, label: 'Learner' },
  student: { icon: BookOpen, label: 'Student' },
  schoolAdmin: { icon: School, label: 'School Admin' },
  admin: { icon: Shield, label: 'Admin' },
  superAdmin: { icon: Shield, label: 'Super Admin' }
};

export default function RoleSwitcher() {
  const { activeRole, availableRoles, canSwitchRoles, setActiveRole, isLoadingRoles } = useRole();

  // Don't show switcher for single-role users
  if (!canSwitchRoles || availableRoles.length <= 1 || isLoadingRoles) {
    return null;
  }

  // Find current active role data
  const currentRoleData = availableRoles.find(r => r.role === activeRole) || availableRoles[0];
  const currentRoleInfo = roleConfig[currentRoleData?.role || 'parent'] || roleConfig.parent;
  const CurrentIcon = currentRoleInfo.icon;
  
  console.log(`🎯 RoleSwitcher render - activeRole:`, activeRole, 'available roles:', availableRoles.length);

  // Determine if user has roles across multiple schools
  const schoolIds = new Set(availableRoles.map(r => r.schoolId));
  const hasMultipleSchools = schoolIds.size > 1;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Role:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <CurrentIcon className="h-4 w-4" />
            <Badge variant="secondary">
              {currentRoleInfo.label}
              {hasMultipleSchools && currentRoleData?.schoolName && ` - ${currentRoleData.schoolName}`}
            </Badge>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {availableRoles.map((role) => {
            const roleInfo = roleConfig[role.role] || roleConfig.parent;
            const RoleIcon = roleInfo.icon;
            const isActive = role.id === currentRoleData?.id;
            
            return (
              <DropdownMenuItem
                key={role.id}
                onClick={() => {
                  console.log(`🎯 Switching to role ID: ${role.id} (${role.role} at school ${role.schoolId})`);
                  setActiveRole(role.id);
                }}
                className="flex items-start gap-3 p-3"
              >
                <RoleIcon className="h-5 w-5 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">
                    {roleInfo.label}
                    {role.isPrimary && <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>}
                  </div>
                  {hasMultipleSchools && role.schoolName && (
                    <div className="text-sm text-muted-foreground">
                      {role.schoolName}
                    </div>
                  )}
                </div>
                {isActive && (
                  <Badge variant="default" className="ml-2">Active</Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}