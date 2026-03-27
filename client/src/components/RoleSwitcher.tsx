import { useRole } from "@/contexts/RoleContext";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, User, School, GraduationCap, BookOpen, Shield } from "lucide-react";

const roleConfig: Record<string, { icon: any; label: string }> = {
  parent: { icon: User, label: 'Parent' },
  educator: { icon: GraduationCap, label: 'Educator' },
  mentor: { icon: GraduationCap, label: 'Mentor' },
  teacher: { icon: GraduationCap, label: 'Teacher' },
  director: { icon: GraduationCap, label: 'Director' },
  learner: { icon: BookOpen, label: 'Learner' },
  student: { icon: BookOpen, label: 'Student' },
  schooladmin: { icon: School, label: 'School Admin' },
  admin: { icon: Shield, label: 'Admin' },
  superadmin: { icon: Shield, label: 'Super Admin' }
};

const normalizeRole = (role: string): string => role.toLowerCase();

export default function RoleSwitcher() {
  const { activeRole, activeRoleId, availableRoles, canSwitchRoles, setActiveRole, isLoadingRoles } = useRole();

  console.warn('🎯 ROLE_SWITCHER_DEBUG:', JSON.stringify({
    canSwitchRoles,
    roleCount: availableRoles.length,
    isLoadingRoles,
    activeRole,
    activeRoleId,
    roles: availableRoles.map(r => ({ id: r.id, role: r.role, schoolId: r.schoolId }))
  }));

  // Determine how many distinct schools this user has roles at
  const schoolIds = new Set(availableRoles.map(r => r.schoolId));
  const hasMultipleSchools = schoolIds.size > 1;

  // Task #52: For single-school multi-role users, all permissions are additive — no switcher needed.
  // The RoleSwitcher is preserved only for multi-school users to change their school context.
  if (!canSwitchRoles || availableRoles.length <= 1 || isLoadingRoles || !hasMultipleSchools) {
    console.warn('🎯 ROLE_SWITCHER_EARLY_EXIT:', JSON.stringify({ canSwitchRoles, count: availableRoles.length, isLoadingRoles, hasMultipleSchools }));
    return null;
  }

  // Find current active role entry
  const currentRoleData = activeRoleId
    ? availableRoles.find(r => r.id === activeRoleId)
    : availableRoles.find(r => r.role === activeRole) || availableRoles[0];

  if (!currentRoleData) {
    console.error('⚠️ RoleSwitcher: No current role data', { activeRoleId, activeRole, availableRoles });
    return null;
  }

  const currentRoleInfo = roleConfig[normalizeRole(currentRoleData.role)] || { icon: User, label: currentRoleData.role };
  const CurrentIcon = currentRoleInfo.icon;

  // Group roles by school for the dropdown — switching selects a school's representative role
  // For each school, pick the most privileged role as the "school context" entry
  const privilegeOrder = ['superAdmin', 'admin', 'schoolAdmin', 'director', 'educator', 'teacher', 'mentor', 'parent', 'student', 'learner'];
  const schoolGroups = Array.from(schoolIds).map(schoolId => {
    const rolesAtSchool = availableRoles.filter(r => r.schoolId === schoolId);
    rolesAtSchool.sort((a, b) => {
      const ai = privilegeOrder.findIndex(p => p.toLowerCase() === a.role.toLowerCase());
      const bi = privilegeOrder.findIndex(p => p.toLowerCase() === b.role.toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return {
      schoolId,
      schoolName: rolesAtSchool[0]?.schoolName,
      roles: rolesAtSchool,
      primaryRole: rolesAtSchool[0],
    };
  });

  const isCurrentSchool = (schoolId: number | null) => schoolId === currentRoleData.schoolId;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">School:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <CurrentIcon className="h-4 w-4" />
            <Badge variant="secondary">
              {currentRoleData.schoolName || `School ${currentRoleData.schoolId}`}
            </Badge>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {schoolGroups.map(group => (
            <div key={group.schoolId}>
              <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-3 pt-2">
                {group.schoolName || `School ${group.schoolId}`}
              </DropdownMenuLabel>
              {group.roles.map(role => {
                const roleInfo = roleConfig[normalizeRole(role.role)] || { icon: User, label: role.role };
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
                    </div>
                    {isActive && (
                      <Badge variant="default" className="ml-2">Active</Badge>
                    )}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
