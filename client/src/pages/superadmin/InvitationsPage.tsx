
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Mail, Trash2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export function InvitationsPage() {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("schoolAdmin");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ['role-invitations'],
    queryFn: () => apiRequest('/api/role-invitations')
  });

  const inviteUserMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      return apiRequest('/api/role-invitations', {
        method: 'POST',
        body: JSON.stringify({ email, role })
      });
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent",
        description: "Role invitation has been sent successfully.",
      });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("schoolAdmin");
      queryClient.invalidateQueries({ queryKey: ['role-invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    }
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/role-invitations/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      toast({
        title: "Invitation Revoked",
        description: "The invitation has been revoked successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['role-invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke invitation",
        variant: "destructive",
      });
    }
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim() && inviteRole) {
      inviteUserMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
    }
  };

  const getStatusBadge = (invitation: any) => {
    if (invitation.used_at) {
      return <Badge variant="default">Accepted</Badge>;
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (invitation.is_active) {
      return <Badge variant="secondary">Pending</Badge>;
    }
    return <Badge variant="outline">Inactive</Badge>;
  };

  const getRoleLabel = (role: string) => {
    const roleLabels: Record<string, string> = {
      schoolAdmin: "School Admin",
      teacher: "Teacher",
      admin: "Admin",
      superAdmin: "Super Admin"
    };
    return roleLabels[role] || role;
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Role Invitations</h1>
            <p className="text-muted-foreground">Manage role invitations for the platform</p>
          </div>
          
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Send Invitation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Role Invitation</DialogTitle>
                <DialogDescription>
                  Send an invitation to assign a role to a new user.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInviteSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="schoolAdmin">School Admin</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="superAdmin">Super Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setInviteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={inviteUserMutation.isPending}
                  >
                    {inviteUserMutation.isPending ? "Sending..." : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Invitations</CardTitle>
            <CardDescription>
              View and manage all role invitations sent from the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading invitations...</div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No invitations found. Send your first invitation to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited By</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation: any) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">{invitation.email}</TableCell>
                      <TableCell>{getRoleLabel(invitation.role)}</TableCell>
                      <TableCell>{getStatusBadge(invitation)}</TableCell>
                      <TableCell>{invitation.invited_by || 'System'}</TableCell>
                      <TableCell>
                        {new Date(invitation.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {new Date(invitation.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {invitation.is_active && !invitation.used_at && (
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
