import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  UserCog
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const [selectedRole, setSelectedRole] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [manageRolesUser, setManageRolesUser] = useState<any>(null);
  
  const queryClient = useQueryClient();
  const { schoolId } = useSchoolAdmin();

  // Fetch users for the school
  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/school-admin/users'],
  });

  // Filter users based on search and role
  const filteredUsers = users.filter((user: any) => {
    const matchesSearch = user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'all' || user.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'schoolAdmin':
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
    switch (role) {
      case 'schoolAdmin':
        return 'School Admin';
      case 'educator':
        return 'Educator';
      case 'parent':
        return 'Parent';
      case 'staff':
        return 'Staff';
      default:
        return role;
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setShowCreateDialog(true); // Reuse the create dialog for editing
  };

  const { toast } = useToast();

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
              {users.filter((u: any) => u.role === 'parent').length}
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
              {users.filter((u: any) => u.role === 'staff').length}
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
              {users.filter((u: any) => u.role === 'educator').length}
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
                  Role: {selectedRole === 'all' ? 'All' : getRoleDisplayName(selectedRole)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedRole('all')}>
                  All Roles
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedRole('parent')}>
                  Parents
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedRole('educator')}>
                  Educators
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedRole('staff')}>
                  Staff
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedRole('schoolAdmin')}>
                  School Admins
                </DropdownMenuItem>
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
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {searchTerm || selectedRole !== 'all' ? 'No users match your filters.' : 'No users found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user: any) => (
                    <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">
                        <Link 
                          href={
                            user.role === 'parent' ? `/schools/parents/${user.id}` :
                            user.role === 'educator' ? `/schools/educators/${user.id}` :
                            user.role === 'staff' ? `/schools/staff/${user.id}` :
                            user.role === 'schoolAdmin' ? `/schools/admins/${user.id}` :
                            `/schools/users/${user.id}`
                          }
                          data-testid={`link-user-${user.id}`}
                        >
                          <Button variant="link" className="h-auto p-0 font-medium hover:underline">
                            {user.firstName} {user.lastName}
                          </Button>
                        </Link>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {getRoleDisplayName(user.role)}
                        </Badge>
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
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditUser(user)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit User
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
      </div>
    </SchoolAdminLayout>
  );
}