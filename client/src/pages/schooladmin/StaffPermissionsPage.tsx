import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, parseApiErrorMessage } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  UserPlus,
  ChevronsUpDown,
  Search,
  Building2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

type PermissionFlags = {
  canViewReports: boolean;
  canManageStaff: boolean;
  canManageClasses: boolean;
  canManageStudents: boolean;
  canSendNotifications: boolean;
  canViewParentContacts: boolean;
};

interface StaffPermissionRow extends PermissionFlags {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  accessLevel: string;
  isActive: boolean;
}

interface UserLocationPermission extends StaffPermissionRow {
  locationId: number;
  locationName: string;
}

interface Location {
  id: number;
  name: string;
  code: string;
}

interface SchoolUser {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
  locationId?: number | null;
}

const permissionLabels: Record<string, { label: string; icon: typeof FileText; description: string }> = {
  canViewReports: {
    label: 'View Reports',
    icon: FileText,
    description: 'Access location reports and analytics',
  },
  canManageStaff: {
    label: 'Manage Staff',
    icon: Users,
    description: 'Add, edit, and remove staff members',
  },
  canManageClasses: {
    label: 'Manage Classes',
    icon: GraduationCap,
    description: 'Create and modify class schedules',
  },
  canManageStudents: {
    label: 'Manage Students',
    icon: Users,
    description: 'Manage student enrollments',
  },
  canSendNotifications: {
    label: 'Send Notifications',
    icon: Bell,
    description: 'Send announcements to parents',
  },
  canViewParentContacts: {
    label: 'View Parent Contacts',
    icon: Phone,
    description: 'Access parent phone and email information',
  },
};

function displayUserName(user: SchoolUser): string {
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || user.email;
}

function PermissionsTable({
  rows,
  onToggle,
  isPending,
}: {
  rows: StaffPermissionRow[];
  onToggle: (rowId: number, permission: string, currentValue: boolean) => void;
  isPending: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
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
          {rows.map((perm) => (
            <TableRow key={perm.id} data-testid={`permission-row-${perm.id}`}>
              <TableCell>
                <div>
                  <div className="font-medium">{perm.userName}</div>
                  <div className="text-sm text-muted-foreground">{perm.userEmail}</div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    perm.accessLevel === 'admin'
                      ? 'default'
                      : perm.accessLevel === 'manage'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {perm.accessLevel}
                </Badge>
              </TableCell>
              {Object.keys(permissionLabels).map((permKey) => (
                <TableCell key={permKey} className="text-center">
                  <Switch
                    checked={perm[permKey as keyof PermissionFlags] as boolean}
                    onCheckedChange={() =>
                      onToggle(perm.id, permKey, perm[permKey as keyof PermissionFlags] as boolean)
                    }
                    disabled={isPending || perm.accessLevel === 'admin'}
                    data-testid={`switch-${perm.id}-${permKey}`}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function StaffPermissionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [schoolUserPickerOpen, setSchoolUserPickerOpen] = useState(false);

  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    enabled: !!user,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery<UserLocationPermission[]>({
    queryKey: ['/api/school-admin/user-locations', selectedLocationId],
    enabled: !!selectedLocationId,
  });

  const { data: schoolPermissions, isLoading: schoolPermissionsLoading } = useQuery<StaffPermissionRow[]>({
    queryKey: ['/api/school-admin/user-school-permissions'],
    enabled: !!user,
  });

  const { data: schoolUsers, isLoading: schoolUsersLoading } = useQuery<SchoolUser[]>({
    queryKey: ['/api/school-admin/users'],
    enabled: !!user,
  });

  const assignedUserIds = useMemo(
    () => new Set(permissions?.map((p) => p.userId) || []),
    [permissions],
  );

  const assignedSchoolWideUserIds = useMemo(
    () => new Set(schoolPermissions?.map((p) => p.userId) || []),
    [schoolPermissions],
  );

  const unassignedUsers = useMemo(
    () =>
      (schoolUsers ?? []).filter(
        (u) =>
          !assignedUserIds.has(u.id) &&
          u.isActive !== false &&
          !(selectedLocationId != null && u.locationId === selectedLocationId),
      ),
    [schoolUsers, assignedUserIds, selectedLocationId],
  );

  const unassignedSchoolWideUsers = useMemo(
    () =>
      (schoolUsers ?? []).filter(
        (u) => !assignedSchoolWideUserIds.has(u.id) && u.isActive !== false,
      ),
    [schoolUsers, assignedSchoolWideUserIds],
  );

  const assignUserMutation = useMutation({
    mutationFn: async ({ userId, locationId }: { userId: number; locationId: number }) => {
      const res = await apiRequest('POST', '/api/school-admin/user-locations', {
        userId,
        locationId,
        accessLevel: 'view',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/user-locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/users'] });
      setUserPickerOpen(false);
      toast({
        title: 'Access granted',
        description: 'You can now set permissions for this user at this location.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: parseApiErrorMessage(error, 'Failed to grant location access'),
        variant: 'destructive',
      });
    },
  });

  const assignSchoolUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest('POST', '/api/school-admin/user-school-permissions', {
        userId,
        accessLevel: 'view',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/user-school-permissions'] });
      setSchoolUserPickerOpen(false);
      toast({
        title: 'School-wide access granted',
        description: 'Permissions apply to every location at your school.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: parseApiErrorMessage(error, 'Failed to grant school-wide access'),
        variant: 'destructive',
      });
    },
  });

  const updateSchoolPermissionMutation = useMutation({
    mutationFn: async ({
      permissionId,
      permission,
      value,
    }: {
      permissionId: number;
      permission: string;
      value: boolean;
    }) => {
      const res = await apiRequest('PATCH', `/api/school-admin/user-school-permissions/${permissionId}`, {
        [permission]: value,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update permission');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/user-school-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/user-locations/my-permissions'] });
      toast({
        title: 'Permission updated',
        description: 'School-wide permissions have been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update permission',
        variant: 'destructive',
      });
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      userLocationId,
      permission,
      value,
    }: {
      userLocationId: number;
      permission: string;
      value: boolean;
    }) => {
      const res = await apiRequest('PATCH', `/api/school-admin/user-locations/${userLocationId}`, {
        [permission]: value,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update permission');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/user-locations'] });
      toast({
        title: 'Permission updated',
        description: 'Location permissions have been updated successfully.',
      });
    },
    onError: (error: Error) => {
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
    currentValue: boolean,
  ) => {
    updatePermissionMutation.mutate({
      userLocationId,
      permission,
      value: !currentValue,
    });
  };

  const handleAssignUser = (userId: number) => {
    if (!selectedLocationId) return;
    assignUserMutation.mutate({ userId, locationId: selectedLocationId });
  };

  const handleAssignSchoolWide = (userId: number) => {
    assignSchoolUserMutation.mutate(userId);
  };

  const handleSchoolPermissionToggle = (
    permissionId: number,
    permission: string,
    currentValue: boolean,
  ) => {
    updateSchoolPermissionMutation.mutate({
      permissionId,
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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Staff Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Grant school-wide or per-location access to any user — staff, mentors, and more. School-wide permissions apply at every location.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              School-wide access
            </CardTitle>
            <CardDescription>
              These permissions apply to all locations. Use this for directors or staff who work across the school.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {schoolPermissionsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : schoolPermissions && schoolPermissions.length > 0 ? (
              <PermissionsTable
                rows={schoolPermissions}
                onToggle={handleSchoolPermissionToggle}
                isPending={updateSchoolPermissionMutation.isPending}
              />
            ) : (
              <div className="text-center py-6 text-muted-foreground border rounded-lg">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No school-wide access granted yet</p>
                <p className="text-sm mt-1">Add someone below to grant permissions across all locations.</p>
              </div>
            )}

            <div className="border-t pt-6 space-y-4">
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Grant school-wide access
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Search any school user who does not already have school-wide access.
                </p>
              </div>

              <Popover open={schoolUserPickerOpen} onOpenChange={setSchoolUserPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={schoolUserPickerOpen}
                    className="w-full max-w-md justify-between font-normal"
                    disabled={schoolUsersLoading || assignSchoolUserMutation.isPending}
                    data-testid="grant-school-access-user-picker"
                  >
                    {schoolUsersLoading ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading users…
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Search by name or email…
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Name or email…" />
                    <CommandList>
                      <CommandEmpty>
                        {unassignedSchoolWideUsers.length === 0 && !schoolUsersLoading
                          ? 'Everyone already has school-wide access or no users match.'
                          : 'No matching user.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {unassignedSchoolWideUsers.map((schoolUser) => (
                          <CommandItem
                            key={schoolUser.id}
                            value={`${displayUserName(schoolUser)} ${schoolUser.email}`}
                            onSelect={() => handleAssignSchoolWide(schoolUser.id)}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span>{displayUserName(schoolUser)}</span>
                              <span className="text-xs text-muted-foreground">{schoolUser.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {unassignedSchoolWideUsers.length > 0 && (
                <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                  {unassignedSchoolWideUsers.slice(0, 8).map((schoolUser) => (
                    <div
                      key={schoolUser.id}
                      className="flex items-center justify-between p-3 gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{displayUserName(schoolUser)}</div>
                        <div className="text-sm text-muted-foreground truncate">{schoolUser.email}</div>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={() => handleAssignSchoolWide(schoolUser.id)}
                        disabled={assignSchoolUserMutation.isPending}
                      >
                        {assignSchoolUserMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-1" />
                            Grant school-wide
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Select Location
            </CardTitle>
            <CardDescription>Choose a location to manage who can access it</CardDescription>
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
                Location access &amp; permissions
              </CardTitle>
              <CardDescription>
                Users listed below can access this location. Toggle permissions for each person.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {permissionsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : permissions && permissions.length > 0 ? (
                <PermissionsTable
                  rows={permissions}
                  onToggle={handlePermissionToggle}
                  isPending={updatePermissionMutation.isPending}
                />
              ) : (
                <div className="text-center py-6 text-muted-foreground border rounded-lg">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No users have access to this location yet</p>
                  <p className="text-sm mt-1">Add someone below to grant access and set permissions.</p>
                </div>
              )}

              <div className="border-t pt-6 space-y-4">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Grant access to a user
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Search any school user (mentor, educator, parent, etc.) who is not already assigned here.
                  </p>
                </div>

                <Popover open={userPickerOpen} onOpenChange={setUserPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={userPickerOpen}
                      className="w-full max-w-md justify-between font-normal"
                      disabled={schoolUsersLoading || assignUserMutation.isPending}
                      data-testid="grant-access-user-picker"
                    >
                      {schoolUsersLoading ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading users…
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Search className="h-4 w-4" />
                          Search by name or email…
                        </span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Name or email…" />
                      <CommandList>
                        <CommandEmpty>
                          {unassignedUsers.length === 0 && !schoolUsersLoading
                            ? 'Everyone at your school already has access here.'
                            : 'No matching user.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {unassignedUsers.map((schoolUser) => (
                            <CommandItem
                              key={schoolUser.id}
                              value={`${displayUserName(schoolUser)} ${schoolUser.email} ${schoolUser.role || ''}`}
                              onSelect={() => handleAssignUser(schoolUser.id)}
                              data-testid={`grant-access-option-${schoolUser.id}`}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span>{displayUserName(schoolUser)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {schoolUser.email}
                                  {schoolUser.role ? ` · ${schoolUser.role}` : ''}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {unassignedUsers.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {unassignedUsers.slice(0, 12).map((schoolUser) => (
                      <div
                        key={schoolUser.id}
                        className="flex items-center justify-between p-3 gap-3"
                        data-testid={`unassigned-user-${schoolUser.id}`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{displayUserName(schoolUser)}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {schoolUser.email}
                            {schoolUser.role && (
                              <Badge variant="outline" className="ml-2 text-xs capitalize">
                                {schoolUser.role}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="shrink-0"
                          onClick={() => handleAssignUser(schoolUser.id)}
                          disabled={assignUserMutation.isPending}
                          data-testid={`assign-user-button-${schoolUser.id}`}
                        >
                          {assignUserMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4 mr-1" />
                              Grant access
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                    {unassignedUsers.length > 12 && (
                      <p className="text-xs text-center text-muted-foreground p-2">
                        {unassignedUsers.length - 12} more — use search above
                      </p>
                    )}
                  </div>
                )}

                {!schoolUsersLoading && unassignedUsers.length === 0 && (permissions?.length ?? 0) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    All active school users already have access at this location.
                  </p>
                )}
              </div>
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
              The &quot;View Parent Contacts&quot; permission grants access to parent phone numbers and email
              addresses. This information is sensitive and access is logged for security purposes.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Only grant this permission to people who need direct parent communication</li>
              <li>All access to parent contact information is logged</li>
              <li>Rate limits apply to prevent bulk data access</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}
