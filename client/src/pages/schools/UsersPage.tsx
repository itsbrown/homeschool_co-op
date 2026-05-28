import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  UserPlus, 
  Upload, 
  Search, 
  MoreHorizontal, 
  Edit, 
  Trash2,
  Users,
  Filter,
  Mail,
  Key,
  Send,
  UserCog,
  Eye,
  RefreshCw,
  Download,
  Phone
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from 'wouter';
import CreateUserDialog from '@/components/schools/CreateUserDialog';
import ImportUsersDialog from '@/components/schools/ImportUsersDialog';
import ManageUserRolesDialog from '@/components/admin/ManageUserRolesDialog';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { useToast } from '@/hooks/use-toast';
import { useSchoolAdmin } from '@/hooks/useSchoolAdmin';
import { apiRequest } from '@/lib/queryClient';

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [manageRolesUser, setManageRolesUser] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [editPhoneUser, setEditPhoneUser] = useState<any>(null);
  const [editPhoneValue, setEditPhoneValue] = useState('');
  const [editPhoneError, setEditPhoneError] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { schoolId, isLoading: isLoadingSchool, userProfile } = useSchoolAdmin();
  const { toast } = useToast();

  // Fetch locations for the school
  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ['/api/locations'],
    enabled: !!schoolId,
  });

  const { data: users = [], isLoading: isLoadingUsers, error: usersQueryError, isError: usersQueryIsError } = useQuery<any[]>({
    queryKey: ['/api/school-admin/users'],
    enabled: !!schoolId,
    select: (raw) => (Array.isArray(raw) ? raw : []),
  });

  const { data: labelOptions } = useQuery<{ system: string[]; custom: string[] }>({
    queryKey: ['/api/school-admin/users/label-options'],
    enabled: !!schoolId,
  });

  const normalizeLabel = (label: string) => (label || '').toLowerCase();

  const getUserLabels = (user: any): string[] => {
    if (Array.isArray(user.labels) && user.labels.length > 0) return user.labels;
    if (user.role) return [user.role];
    return [];
  };

  const toggleLabelFilter = (label: string) => {
    const key = normalizeLabel(label);
    setSelectedLabels((prev) =>
      prev.some((l) => normalizeLabel(l) === key)
        ? prev.filter((l) => normalizeLabel(l) !== key)
        : [...prev, label],
    );
  };

  const isLoading = isLoadingSchool || isLoadingUsers;

  // Filter users based on search, role, and location
  const filteredUsers = users.filter((user: any) => {
    const matchesSearch = user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLabel =
      selectedLabels.length === 0 ||
      getUserLabels(user).some((l) =>
        selectedLabels.some((s) => normalizeLabel(s) === normalizeLabel(l)),
      );
    const matchesLocation = selectedLocation === 'all' || 
                           (selectedLocation === 'none' && !user.locationId) ||
                           String(user.locationId) === selectedLocation;
    return matchesSearch && matchesLabel && matchesLocation;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch ((role || '').toLowerCase()) {
      case 'schooladmin':
        return 'default';
      case 'educator':
        return 'secondary';
      case 'parent':
        return 'outline';
      case 'staff':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch ((role || '').toLowerCase()) {
      case 'schooladmin':
        return 'School Admin';
      case 'educator':
        return 'Educator';
      case 'parent':
        return 'Parent';
      case 'staff':
        return 'Staff';
      case 'mentor':
        return 'Mentor';
      case 'teacher':
        return 'Teacher';
      case 'instructor':
        return 'Instructor';
      default:
        return role;
    }
  };

  const getProfileUrl = (user: any): string => `/schools/users/${user.id}`;

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setShowCreateDialog(true); // Reuse the create dialog for editing
  };

  const editPhoneMutation = useMutation({
    mutationFn: async ({ userId, phone }: { userId: number; phone: string }) => {
      const response = await apiRequest('PUT', `/api/school-admin/users/${userId}`, { phone });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to update phone number');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Phone Updated', description: 'Phone number updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/users'] });
      setEditPhoneUser(null);
      setEditPhoneValue('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update phone number', variant: 'destructive' });
    },
  });

  const handleExportUsers = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/admin-users/export/users-and-children', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/csv',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      if (!response.ok) {
        // Handle specific error codes
        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          toast({
            title: "Access Denied",
            description: errorData.message || "You don't have permission to export user data.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(`Export failed with status ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_and_children_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Complete",
        description: "Users and children data has been downloaded.",
      });
    } catch (error) {
      console.error('Error exporting users:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    
    try {
      await apiRequest('DELETE', `/api/school-admin/users/${userId}`);
      
      // Refresh the users list
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/users'] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "Failed to delete user. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendInvite = async (userId: number, userName: string) => {
    try {
      await apiRequest('POST', `/api/school-admin/users/${userId}/send-invite`);
      
      toast({
        title: "Success",
        description: `Account invite sent to ${userName}`,
      });
    } catch (error) {
      console.error('Error sending invite:', error);
      toast({
        title: "Error",
        description: "Failed to send invite. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendPasswordReset = async (userId: number, userName: string) => {
    try {
      await apiRequest('POST', `/api/school-admin/users/${userId}/send-password-reset`);
      
      toast({
        title: "Success",
        description: `Password reset email sent to ${userName}`,
      });
    } catch (error) {
      console.error('Error sending password reset:', error);
      toast({
        title: "Error",
        description: "Failed to send password reset. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResendWelcomeEmail = async (userId: number, userName: string) => {
    try {
      await apiRequest('POST', '/api/school-admin/resend-welcome-email', { userId });
      
      toast({
        title: "Success",
        description: `Welcome email sent to ${userName}`,
      });
    } catch (error) {
      console.error('Error resending welcome email:', error);
      toast({
        title: "Error",
        description: "Failed to send welcome email. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResendStaffInvite = async (user: any) => {
    if (!user.staffId) {
      toast({
        title: "Error",
        description: "Cannot resend invite - staff record not found.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await apiRequest('POST', `/api/school-admin/staff/${user.staffId}/resend-invite`);
      
      toast({
        title: "Success",
        description: `Invitation resent to ${user.firstName || user.name} ${user.lastName || ''}`.trim(),
      });
    } catch (error: any) {
      console.error('Error resending staff invite:', error);
      const errorMessage = error?.message || "Failed to resend invitation. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Users">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground">
            Manage user accounts and permissions for your school
          </p>
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleExportUsers}
              variant="outline"
              className="flex items-center gap-2"
              disabled={isExporting}
              data-testid="button-export-users"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export Data'}
            </Button>
            <Button 
              onClick={() => setShowImportDialog(true)}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-import-users"
            >
              <Upload className="h-4 w-4" />
              Import Users
            </Button>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2"
              data-testid="button-create-user"
            >
              <UserPlus className="h-4 w-4" />
              Create User
            </Button>
          </div>
        </div>

        {usersQueryIsError && (
          <Alert variant="destructive">
            <AlertTitle>Could not load users</AlertTitle>
            <AlertDescription>
              {(usersQueryError as Error)?.message ||
                'Check the browser Network tab for GET /api/school-admin/users (403 = missing school on your account; 500 = server/database error).'}
            </AlertDescription>
          </Alert>
        )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u: any) => getUserLabels(u).some((l) => normalizeLabel(l) === 'parent')).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u: any) => u.staffId).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Educators</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u: any) => getUserLabels(u).some((l) => ['educator', 'teacher'].includes(normalizeLabel(l))).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Search and filter users, or manage individual accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Labels: {selectedLabels.length === 0 ? 'All' : `${selectedLabels.length} selected`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto w-56">
                <DropdownMenuItem onClick={() => setSelectedLabels([])}>
                  All labels
                </DropdownMenuItem>
                {(labelOptions?.system || ['parent', 'educator', 'teacher', 'director', 'schoolAdmin']).map((label) => (
                  <DropdownMenuItem
                    key={`sys-${label}`}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleLabelFilter(label);
                    }}
                  >
                    <span className={selectedLabels.some((l) => normalizeLabel(l) === normalizeLabel(label)) ? 'font-semibold' : ''}>
                      {getRoleDisplayName(label)}
                      {selectedLabels.some((l) => normalizeLabel(l) === normalizeLabel(label)) ? ' ✓' : ''}
                    </span>
                  </DropdownMenuItem>
                ))}
                {(labelOptions?.custom || []).map((label) => (
                  <DropdownMenuItem
                    key={`custom-${label}`}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleLabelFilter(label);
                    }}
                  >
                    <span className={selectedLabels.some((l) => normalizeLabel(l) === normalizeLabel(label)) ? 'font-semibold' : ''}>
                      {label}
                      {selectedLabels.some((l) => normalizeLabel(l) === normalizeLabel(label)) ? ' ✓' : ''}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Location: {selectedLocation === 'all' ? 'All' : 
                            selectedLocation === 'none' ? 'No Location' :
                            locationsData.find((l: any) => String(l.id) === selectedLocation)?.name || 'Unknown'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedLocation('all')}>
                  All Locations
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedLocation('none')}>
                  No Location
                </DropdownMenuItem>
                {locationsData.map((location: any) => (
                  <DropdownMenuItem 
                    key={location.id} 
                    onClick={() => setSelectedLocation(String(location.id))}
                  >
                    {location.name} {location.code && `(${location.code})`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Users Table */}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Labels</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      {searchTerm || selectedLabels.length > 0 || selectedLocation !== 'all' ? 'No users match your filters.' : 'No users found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user: any) => (
                    <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">
                        <Link 
                          href={getProfileUrl(user)}
                          data-testid={`link-user-${user.id}`}
                        >
                          <Button variant="link" className="h-auto p-0 font-medium hover:underline">
                            {user.firstName} {user.lastName}
                          </Button>
                        </Link>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.phone ? (
                          <span className="text-sm flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {user.phone}
                          </span>
                        ) : (
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                            onClick={() => { setEditPhoneUser(user); setEditPhoneValue(''); }}
                          >
                            Add phone
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getUserLabels(user).length > 0 ? (
                            getUserLabels(user).map((label: string) => (
                              <Badge key={label} variant={getRoleBadgeVariant(label)} className="text-xs">
                                {getRoleDisplayName(label)}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.locationName ? (
                          <Badge variant="outline">
                            {user.locationName}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? 'default' : 'secondary'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              className="h-8 w-8 p-0 relative z-10"
                              data-testid={`button-actions-${user.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-50">
                            <Link href={getProfileUrl(user)}>
                              <DropdownMenuItem data-testid={`button-view-profile-${user.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Profile
                              </DropdownMenuItem>
                            </Link>
                            <DropdownMenuItem onClick={() => handleEditUser(user)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setEditPhoneUser(user); setEditPhoneValue(user.phone || ''); }}>
                              <Phone className="h-4 w-4 mr-2" />
                              Edit Phone Number
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setManageRolesUser(user)} data-testid={`button-manage-roles-${user.id}`}>
                              <UserCog className="h-4 w-4 mr-2" />
                              Manage Roles
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSendInvite(user.id, `${user.firstName || user.name} ${user.lastName || ''}`)}>
                              <Mail className="h-4 w-4 mr-2" />
                              Send Account Invite
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSendPasswordReset(user.id, `${user.firstName || user.name} ${user.lastName || ''}`)}>
                              <Key className="h-4 w-4 mr-2" />
                              Send Password Reset
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResendWelcomeEmail(user.id, `${user.firstName || user.name} ${user.lastName || ''}`)}>
                              <Send className="h-4 w-4 mr-2" />
                              Resend Welcome Email
                            </DropdownMenuItem>
                            {user.staffId && !user.isActive && (
                              <DropdownMenuItem onClick={() => handleResendStaffInvite(user)}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Resend Staff Invite
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateUserDialog 
        open={showCreateDialog} 
        onClose={() => {
          setShowCreateDialog(false);
          setEditingUser(null);
        }}
        editUser={editingUser}
      />
      <ImportUsersDialog 
        open={showImportDialog} 
        onOpenChange={setShowImportDialog}
        schoolId={schoolId || 0}
      />
      {manageRolesUser && (
        <ManageUserRolesDialog
          open={!!manageRolesUser}
          onOpenChange={(open) => !open && setManageRolesUser(null)}
          userId={manageRolesUser.id}
          userEmail={manageRolesUser.email}
          userName={`${manageRolesUser.firstName || ''} ${manageRolesUser.lastName || ''}`.trim()}
        />
      )}

      {/* Edit Phone Dialog */}
      <Dialog open={!!editPhoneUser} onOpenChange={(open) => !open && setEditPhoneUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Phone Number</DialogTitle>
            <DialogDescription>
              Update the phone number for {editPhoneUser ? `${editPhoneUser.firstName || ''} ${editPhoneUser.lastName || ''}`.trim() || editPhoneUser.email : 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="phone-input">Phone Number</Label>
            <Input
              id="phone-input"
              type="tel"
              placeholder="e.g. (555) 123-4567"
              value={editPhoneValue}
              onChange={(e) => { setEditPhoneValue(e.target.value); setEditPhoneError(null); }}
              className={`mt-1${editPhoneError ? ' border-destructive' : ''}`}
            />
            {editPhoneError ? (
              <p className="text-xs text-destructive mt-1">{editPhoneError}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Enter a US phone number (10 digits).</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditPhoneUser(null); setEditPhoneError(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editPhoneUser) return;
                if (editPhoneValue) {
                  const digits = editPhoneValue.replace(/\D/g, '');
                  const valid = digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
                  if (!valid) {
                    setEditPhoneError('Invalid US phone number. Must be a 10-digit number or 11-digit number starting with 1.');
                    return;
                  }
                }
                setEditPhoneError(null);
                editPhoneMutation.mutate({ userId: editPhoneUser.id, phone: editPhoneValue });
              }}
              disabled={editPhoneMutation.isPending}
            >
              {editPhoneMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
    </SchoolAdminLayout>
  );
}