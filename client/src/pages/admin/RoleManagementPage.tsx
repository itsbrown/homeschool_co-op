import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/hooks/useAuth0";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Plus, Send, Trash2, Users, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RoleInvitation {
  id: number;
  email: string;
  role: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  usedAt?: string;
}

export default function RoleManagementPage() {
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Get current user's role from user profile API
  const { data: currentUserProfile } = useQuery({
    queryKey: ['/api/user/profile'],
    queryFn: () => fetch('/api/user/profile').then(res => res.json()),
    enabled: !!user
  });

  const currentUserRole = currentUserProfile?.role || 'admin';

  // Define available roles based on current user's permissions
  // Only Super Admins and Admins can invite school admins
  // All admins can invite parents, educators (teachers), and learners (students)
  const getAvailableRoles = () => {
    const baseRoles = [
      { value: 'parent', label: 'Parent' },
      { value: 'teacher', label: 'Educator/Teacher' },
      { value: 'student', label: 'Learner/Student' }
    ];

    // Only super admins and admins can invite school admins
    if (currentUserRole === 'superAdmin' || currentUserRole === 'admin') {
      baseRoles.push({ value: 'schoolAdmin', label: 'School Administrator' });
    }

    return baseRoles;
  };

  // Fetch current role invitations
  const { data: invitations, isLoading } = useQuery({
    queryKey: ['/api/admin/role-invitations'],
    queryFn: () => fetch('/api/admin/role-invitations').then(res => res.json())
  });

  // Send role invitation mutation
  const sendInvitationMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await fetch('/api/admin/role-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to send invitation');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation sent",
        description: `Role invitation sent to ${email}`,
      });
      setEmail("");
      setSelectedRole("");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/role-invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    }
  });

  // Revoke invitation mutation
  const revokeInvitationMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/role-invitations/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to revoke invitation');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation revoked",
        description: "The role invitation has been revoked",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/role-invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke invitation",
        variant: "destructive",
      });
    }
  });

  const handleSendInvitation = () => {
    if (!email || !selectedRole) {
      toast({
        title: "Missing information",
        description: "Please enter an email and select a role",
        variant: "destructive",
      });
      return;
    }

    sendInvitationMutation.mutate({ email, role: selectedRole });
  };

  const availableRoles = getAvailableRoles();

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "teacher": return "secondary";
      case "schoolAdmin": return "default";
      case "admin": return "destructive";
      case "superAdmin": return "destructive";
      default: return "outline";
    }
  };

  return (
    <AdminLayout pageTitle="Role Management">
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Role Management</h1>
          <p className="text-muted-foreground">
            Manage user roles and permissions. All users default to "Parent" role unless invited to specific roles.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Default Role Policy:</strong> All new users are automatically assigned the "Parent" role. 
              Use invitations to grant users elevated permissions like Teacher, School Admin, or Platform Admin.
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Permission Levels:</strong> Your current role is <Badge variant="secondary">{currentUserRole}</Badge>. 
              {currentUserRole === 'superAdmin' || currentUserRole === 'admin' 
                ? ' You can invite users to all available roles including School Administrators.'
                : ' You can invite Parents, Educators, and Learners. Contact a Super Admin or Admin to invite School Administrators.'
              }
            </AlertDescription>
          </Alert>
        </div>

        <Tabs defaultValue="invite" className="space-y-6">
          <TabsList>
            <TabsTrigger value="invite" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Send Invitation
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Manage Invitations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite">
            <Card>
              <CardHeader>
                <CardTitle>Send Role Invitation</CardTitle>
                <CardDescription>
                  Invite a user to join with a specific role. They will receive an email with instructions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          <div className="font-medium">{role.label}</div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleSendInvitation}
                  disabled={sendInvitationMutation.isPending || !email || !selectedRole}
                  className="w-full"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendInvitationMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage">
            <Card>
              <CardHeader>
                <CardTitle>Role Invitations</CardTitle>
                <CardDescription>
                  View and manage pending role invitations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">Loading invitations...</div>
                ) : invitations?.length > 0 ? (
                  <div className="space-y-4">
                    {invitations.map((invitation: RoleInvitation) => (
                      <div key={invitation.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{invitation.email}</div>
                            <div className="text-sm text-muted-foreground">
                              Invited {new Date(invitation.createdAt).toLocaleDateString()}
                              {invitation.usedAt && ` • Accepted ${new Date(invitation.usedAt).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getRoleBadgeVariant(invitation.role)}>
                            {roleOptions.find(r => r.value === invitation.role)?.label || invitation.role}
                          </Badge>
                          {invitation.isActive && !invitation.usedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revokeInvitationMutation.mutate(invitation.id)}
                              disabled={revokeInvitationMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No role invitations found. Send your first invitation above.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}