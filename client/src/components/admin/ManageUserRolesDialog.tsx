import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, Crown, Building2, AlertCircle } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';

interface UserRole {
  id: number;
  userId: number;
  role: string;
  schoolId: number | null;
  schoolName?: string;
  isPrimary: boolean;
}

interface School {
  id: number;
  name: string;
}

interface ManageUserRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  userEmail: string;
  userName: string;
}

const ROLE_OPTIONS = [
  { value: 'parent', label: 'Parent' },
  { value: 'educator', label: 'Educator' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'schoolAdmin', label: 'School Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'superAdmin', label: 'Super Admin' },
  { value: 'student', label: 'Student' },
  { value: 'learner', label: 'Learner' },
];

export default function ManageUserRolesDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  userName,
}: ManageUserRolesDialogProps) {
  const { toast } = useToast();
  const [showAddRole, setShowAddRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('none');
  const [isPrimary, setIsPrimary] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<UserRole | null>(null);

  // Fetch user's roles
  const { data: rolesResponse, isLoading: rolesLoading } = useQuery<{
    user: {
      id: number;
      email: string;
      name: string;
      primaryRole: string;
      activeRole: string;
      schoolId: number | null;
    };
    roles: UserRole[];
  }>({
    queryKey: ['/api/user/admin/users', userId, 'roles'],
    enabled: open && !!userId,
  });

  // Extract roles from the response
  const userRoles = rolesResponse?.roles;

  // Fetch current admin's profile to determine school access
  const { data: adminProfile } = useQuery<{ role: string; schoolId: number | null }>({
    queryKey: ['/api/users/profile'],
    enabled: open,
  });

  // Fetch schools (for school selection)
  const { data: allSchools } = useQuery<School[]>({
    queryKey: ['/api/schools'],
    enabled: open,
  });

  // Filter schools based on admin privileges
  // SchoolAdmins can only assign roles to their own school
  const schools = adminProfile?.role === 'schoolAdmin' && adminProfile?.schoolId
    ? allSchools?.filter(school => school.id === adminProfile.schoolId)
    : allSchools;

  // Add role mutation
  const addRoleMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        'POST',
        `/api/user/admin/users/${userId}/roles`,
        {
          role: selectedRole,
          schoolId: selectedSchoolId && selectedSchoolId !== 'none' ? parseInt(selectedSchoolId) : null,
          isPrimary,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/admin/users', userId, 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/users'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/user/roles');
        }
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/user/current-role');
        }
      });
      toast({
        title: 'Success',
        description: 'Role added successfully',
      });
      setShowAddRole(false);
      setSelectedRole('');
      setSelectedSchoolId('none');
      setIsPrimary(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add role',
        variant: 'destructive',
      });
    },
  });

  // Remove role mutation
  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      console.log('🔧 removeRoleMutation.mutationFn called with roleId:', roleId);
      console.log('📍 DELETE URL:', `/api/user/admin/users/${userId}/roles/${roleId}`);
      try {
        const result = await apiRequest(
          'DELETE',
          `/api/user/admin/users/${userId}/roles/${roleId}`
        );
        console.log('✅ DELETE request successful, result:', result);
        return result;
      } catch (error) {
        console.error('❌ DELETE request failed:', error);
        throw error;
      }
    },
    onMutate: (roleId) => {
      console.log('🔄 removeRoleMutation.onMutate - Starting mutation for roleId:', roleId);
    },
    onSuccess: (data, roleId) => {
      console.log('✅ removeRoleMutation.onSuccess - Role deleted successfully:', { data, roleId });
      console.log('🔄 Invalidating query cache...');
      queryClient.invalidateQueries({ queryKey: ['/api/user/admin/users', userId, 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/users'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/user/roles');
        }
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/user/current-role');
        }
      });
      console.log('✅ Cache invalidated');
      toast({
        title: 'Success',
        description: 'Role removed successfully',
      });
      console.log('🔄 Clearing roleToDelete state...');
      setRoleToDelete(null);
      console.log('🔄 Closing dialog...');
      onOpenChange(false);
      console.log('✅ Dialog close triggered');
    },
    onError: (error: any, roleId) => {
      console.error('❌ removeRoleMutation.onError - Failed to delete role:', { error, roleId });
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove role',
        variant: 'destructive',
      });
      setRoleToDelete(null);
    },
  });

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      superAdmin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      admin: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      schoolAdmin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      educator: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      teacher: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      parent: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      student: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      learner: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    return colors[role] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  const handleAddRole = () => {
    if (!selectedRole) {
      toast({
        title: 'Error',
        description: 'Please select a role',
        variant: 'destructive',
      });
      return;
    }

    addRoleMutation.mutate();
  };

  const handleDeleteRole = (role: UserRole) => {
    try {
      console.log('🗑️ handleDeleteRole called with role:', role);
      setRoleToDelete(role);
      console.log('✅ roleToDelete state set successfully');
    } catch (error) {
      console.error('❌ Error in handleDeleteRole:', error);
      toast({
        title: 'Error',
        description: `Failed to prepare role deletion: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const confirmDeleteRole = () => {
    try {
      console.log('🔄 confirmDeleteRole called, roleToDelete:', roleToDelete);
      if (roleToDelete) {
        console.log('🚀 Calling removeRoleMutation.mutate with roleId:', roleToDelete.id);
        removeRoleMutation.mutate(roleToDelete.id);
        console.log('✅ Mutation called successfully');
      } else {
        console.warn('⚠️ roleToDelete is null/undefined');
      }
    } catch (error) {
      console.error('❌ Error in confirmDeleteRole:', error);
      toast({
        title: 'Error',
        description: `Failed to delete role: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-manage-user-roles">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Manage Roles: {userName}
              <span className="text-sm font-normal text-muted-foreground">({userEmail})</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Current Roles */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Current Roles</h3>
              {rolesLoading ? (
                <div className="flex items-center space-x-2 py-4">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span className="text-sm text-muted-foreground">Loading roles...</span>
                </div>
              ) : userRoles && userRoles.length > 0 ? (
                <div className="space-y-2">
                  {userRoles.map((role) => (
                    <div
                      key={role.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                      data-testid={`role-item-${role.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={getRoleColor(role.role)} data-testid={`badge-role-${role.role}`}>
                          {role.role}
                        </Badge>
                        {role.isPrimary && (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200" data-testid="badge-primary">
                            <Crown className="h-3 w-3 mr-1" />
                            Primary
                          </Badge>
                        )}
                        {role.schoolName && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground" data-testid={`text-school-${role.id}`}>
                            <Building2 className="h-3 w-3" />
                            {role.schoolName}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRole(role)}
                        disabled={removeRoleMutation.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        data-testid={`button-delete-role-${role.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No roles assigned
                </div>
              )}
            </div>

            {/* Add Role Section */}
            {!showAddRole ? (
              <Button
                onClick={() => setShowAddRole(true)}
                variant="outline"
                className="w-full"
                data-testid="button-show-add-role"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Role
              </Button>
            ) : (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Add New Role</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddRole(false);
                      setSelectedRole('');
                      setSelectedSchoolId('none');
                      setIsPrimary(false);
                    }}
                    data-testid="button-cancel-add-role"
                  >
                    Cancel
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="role-select">Role</Label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger id="role-select" data-testid="select-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="school-select">
                      {adminProfile?.role === 'schoolAdmin' ? 'School' : 'School (Optional)'}
                    </Label>
                    <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                      <SelectTrigger id="school-select" data-testid="select-school">
                        <SelectValue placeholder={
                          adminProfile?.role === 'schoolAdmin' 
                            ? "Select a school" 
                            : "Select a school (optional)"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {adminProfile?.role !== 'schoolAdmin' && (
                          <SelectItem value="none">No School</SelectItem>
                        )}
                        {schools?.map((school) => (
                          <SelectItem key={school.id} value={school.id.toString()}>
                            {school.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="primary-checkbox"
                      checked={isPrimary}
                      onCheckedChange={(checked) => setIsPrimary(checked as boolean)}
                      data-testid="checkbox-primary"
                    />
                    <Label htmlFor="primary-checkbox" className="text-sm font-normal cursor-pointer">
                      Set as primary role
                    </Label>
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      Setting as primary will make this the default role when the user logs in. Only one role can be primary.
                    </p>
                  </div>

                  <Button
                    onClick={handleAddRole}
                    disabled={!selectedRole || addRoleMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-add-role"
                  >
                    {addRoleMutation.isPending ? 'Adding...' : 'Add Role'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!roleToDelete} onOpenChange={() => setRoleToDelete(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Role?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the <strong>{roleToDelete?.role}</strong> role
              {roleToDelete?.schoolName && ` from ${roleToDelete.schoolName}`}?
              {roleToDelete?.isPrimary && (
                <span className="block mt-2 text-yellow-700 dark:text-yellow-400 font-medium">
                  ⚠️ This is the user's primary role. Another role will be automatically set as primary.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRole}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Remove Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
