import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  MapPin,
  Shield,
  Eye,
  FileText,
  Bell,
  GraduationCap,
  Phone,
  Loader2,
  UserPlus
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface UserLocationPermission {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  locationId: number;
  locationName: string;
  accessLevel: string;
  canViewReports: boolean;
  canManageStaff: boolean;
  canManageClasses: boolean;
  canManageStudents: boolean;
  canSendNotifications: boolean;
  canViewParentContacts: boolean;
  isActive: boolean;
}

interface Location {
  id: number;
  name: string;
  code: string;
}

interface StaffMember {
  id: number;
  userId: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

const permissionLabels: Record<string, { label: string; icon: any; description: string }> = {
  canViewReports: { 
    label: 'View Reports', 
    icon: FileText,
    description: 'Access location reports and analytics'
  },
  canManageStaff: { 
    label: 'Manage Staff', 
    icon: Users,
    description: 'Add, edit, and remove staff members'
  },
  canManageClasses: { 
    label: 'Manage Classes', 
    icon: GraduationCap,
    description: 'Create and modify class schedules'
  },
  canManageStudents: { 
    label: 'Manage Students', 
    icon: Users,
    description: 'Manage student enrollments'
  },
  canSendNotifications: { 
    label: 'Send Notifications', 
    icon: Bell,
    description: 'Send announcements to parents'
  },
  canViewParentContacts: { 
    label: 'View Parent Contacts', 
    icon: Phone,
    description: 'Access parent phone and email information'
  },
};

export default function StaffPermissionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    enabled: !!user,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery<UserLocationPermission[]>({
    queryKey: ['/api/school-admin/user-locations', selectedLocationId],
    enabled: !!selectedLocationId,
  });

  // Fetch all school staff to show unassigned ones
  const { data: allStaff } = useQuery<StaffMember[]>({
    queryKey: ['/api/school-admin/staff'],
    enabled: !!user && !!selectedLocationId,
  });

  // Calculate unassigned staff for the selected location
  const assignedUserIds = new Set(permissions?.map(p => p.userId) || []);
  const unassignedStaff = allStaff?.filter(staff => !assignedUserIds.has(staff.userId)) || [];

  const assignStaffMutation = useMutation({
    mutationFn: async ({ userId, locationId }: { userId: number; locationId: number }) => {
      return apiRequest('POST', '/api/school-admin/user-locations', {
        userId,
        locationId,
        accessLevel: 'view',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/user-locations'] });
      toast({
        title: 'Staff assigned',
        description: 'Staff member has been assigned to this location.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign staff member',
        variant: 'destructive',
      });
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({ 
      userLocationId, 
      permission, 
      value 
    }: { 
      userLocationId: number; 
      permission: string; 
      value: boolean;
    }) => {
      return apiRequest('PATCH', `/api/school-admin/user-locations/${userLocationId}`, {
        [permission]: value,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/user-locations'] });
      toast({
        title: 'Permission updated',
        description: 'Staff permissions have been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update permission',
        variant: 'destructive',
      });
    },
  });

  const handlePermissionToggle = (
    userLocationId: number, 
    permission: string, 
    currentValue: boolean
  ) => {
    updatePermissionMutation.mutate({
      userLocationId,
      permission,
      value: !currentValue,
    });
  };

  if (locationsLoading) {
    return (
      <SchoolAdminLayout pageTitle="Staff Permissions">
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Staff Permissions">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Staff Permissions
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage what staff members can access at each location
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Select Location
            </CardTitle>
            <CardDescription>
              Choose a location to manage staff permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {locations?.map((location) => (
                <Button
                  key={location.id}
                  variant={selectedLocationId === location.id ? 'default' : 'outline'}
                  onClick={() => setSelectedLocationId(location.id)}
                  data-testid={`location-button-${location.id}`}
                >
                  {location.name}
                  <Badge variant="secondary" className="ml-2">
                    {location.code}
                  </Badge>
                </Button>
              ))}
              {(!locations || locations.length === 0) && (
                <p className="text-muted-foreground">No locations found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedLocationId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Staff Access
              </CardTitle>
              <CardDescription>
                Toggle permissions for each staff member at this location
              </CardDescription>
            </CardHeader>
            <CardContent>
              {permissionsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : permissions && permissions.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff Member</TableHead>
                        <TableHead>Access Level</TableHead>
                        {Object.entries(permissionLabels).map(([key, { label, icon: Icon }]) => (
                          <TableHead key={key} className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Icon className="h-4 w-4" />
                              <span className="text-xs">{label}</span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {permissions.map((perm) => (
                        <TableRow key={perm.id} data-testid={`permission-row-${perm.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{perm.userName}</div>
                              <div className="text-sm text-muted-foreground">{perm.userEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              perm.accessLevel === 'admin' ? 'default' : 
                              perm.accessLevel === 'manage' ? 'secondary' : 
                              'outline'
                            }>
                              {perm.accessLevel}
                            </Badge>
                          </TableCell>
                          {Object.keys(permissionLabels).map((permKey) => (
                            <TableCell key={permKey} className="text-center">
                              <Switch
                                checked={perm[permKey as keyof UserLocationPermission] as boolean}
                                onCheckedChange={() => 
                                  handlePermissionToggle(
                                    perm.id, 
                                    permKey, 
                                    perm[permKey as keyof UserLocationPermission] as boolean
                                  )
                                }
                                disabled={
                                  updatePermissionMutation.isPending || 
                                  perm.accessLevel === 'admin'
                                }
                                data-testid={`switch-${perm.id}-${permKey}`}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center py-4 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No staff members assigned to this location yet</p>
                  </div>
                  
                  {unassignedStaff.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Assign Staff to This Location
                      </h4>
                      <div className="border rounded-lg divide-y">
                        {unassignedStaff.map((staff) => (
                          <div 
                            key={staff.id} 
                            className="flex items-center justify-between p-3"
                            data-testid={`unassigned-staff-${staff.id}`}
                          >
                            <div>
                              <div className="font-medium">
                                {staff.firstName || staff.lastName 
                                  ? `${staff.firstName || ''} ${staff.lastName || ''}`.trim()
                                  : staff.email}
                              </div>
                              <div className="text-sm text-muted-foreground">{staff.email}</div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => assignStaffMutation.mutate({ 
                                userId: staff.userId, 
                                locationId: selectedLocationId! 
                              })}
                              disabled={assignStaffMutation.isPending}
                              data-testid={`assign-button-${staff.id}`}
                            >
                              {assignStaffMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <UserPlus className="h-4 w-4 mr-1" />
                                  Assign
                                </>
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {unassignedStaff.length === 0 && (
                    <p className="text-sm text-center text-muted-foreground">
                      All staff members have been assigned to this location
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Eye className="h-5 w-5" />
              About Parent Contact Access
            </CardTitle>
          </CardHeader>
          <CardContent className="text-amber-700 dark:text-amber-300">
            <p>
              The "View Parent Contacts" permission grants access to parent phone numbers and email addresses.
              This information is sensitive and access is logged for security purposes.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Only grant this permission to staff who need direct parent communication</li>
              <li>All access to parent contact information is logged</li>
              <li>Rate limits apply to prevent bulk data access</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}
