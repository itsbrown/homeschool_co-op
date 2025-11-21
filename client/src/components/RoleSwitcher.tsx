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
  const { activeRole, activeRoleId, availableRoles, canSwitchRoles, setActiveRole, isLoadingRoles } = useRole();

  console.log('🎯 RoleSwitcher RENDER - canSwitchRoles:', canSwitchRoles, 'roles:', availableRoles.length, 'loading:', isLoadingRoles, 'data:', JSON.stringify(availableRoles));

  // Don't show switcher for single-role users
  if (!canSwitchRoles || availableRoles.length <= 1 || isLoadingRoles) {
    console.log('🎯 RoleSwitcher EARLY EXIT - canSwitch:', canSwitchRoles, 'count:', availableRoles.length, 'loading:', isLoadingRoles);
    return null;
  }

  // SECURITY FIX: Find current active role data using activeRoleId to prevent duplicate role name issues
  // Users might have the same role name at multiple schools (e.g., "educator" at school 1 and school 2)
  // Using roleId ensures we always reference the correct active role at the correct school
  const currentRoleData = activeRoleId 
    ? availableRoles.find(r => r.id === activeRoleId)
    : availableRoles.find(r => r.role === activeRole) || availableRoles[0];
  
  console.log('🎯 RoleSwitcher currentRoleData:', JSON.stringify(currentRoleData));
  
  // Defensive guard: If we can't find current role data, don't render the switcher
  if (!currentRoleData || !currentRoleData.schoolId) {
    console.error('⚠️ RoleSwitcher MISSING DATA - activeRoleId:', activeRoleId, 'activeRole:', activeRole, 'currentRoleData:', currentRoleData);
    return null;
  }
  
  const currentRoleInfo = roleConfig[currentRoleData.role] || roleConfig.parent;
  const CurrentIcon = currentRoleInfo.icon;
  
  // SECURITY: Only show roles from the same school to prevent cross-school switching
  const currentSchoolId = currentRoleData.schoolId;
  const sameSchoolRoles = availableRoles.filter(r => r.schoolId === currentSchoolId);
  
  console.log(`🎯 RoleSwitcher render - activeRole:`, activeRole, 'same-school roles:', sameSchoolRoles.length, 'of', availableRoles.length);

  // Don't show switcher if only one role at current school
  if (sameSchoolRoles.length <= 1) {
    return null;
  }

  // Check if user has roles at multiple schools (for informational purposes)
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
          {sameSchoolRoles.map((role) => {
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
                  {role.schoolName && (
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