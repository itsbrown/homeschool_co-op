import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "../../lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  School,
  Users,
  BookOpen,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Search,
  Eye,
  Edit,
  Trash2,
  Plus,
  UserPlus
} from "lucide-react";
import AppShell from '@/components/layout/AppShell';
import { useToast } from "@/hooks/use-toast";


interface School {
  id: number;
  name: string;
  type: string;
  description?: string;
  location?: string;
  contactEmail?: string;
  contactPhone?: string;
  registrationCode?: string;
  adminEmail?: string;
  isActive?: boolean;
  createdAt?: string;
  studentCount?: number;
  classCount?: number;
  staffCount?: number;
}

export default function AllSchoolsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Fetch all schools
  const { data: schools = [], isLoading, error } = useQuery<School[]>({
    queryKey: ["/api/superadmin/schools"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/superadmin/schools");
      if (!response.ok) throw new Error("Failed to fetch schools");
      return response.json();
    }
  });

  // Mutation for inviting school admin
  const inviteSchoolAdminMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest('/api/role-invitations', {
        method: 'POST',
        body: JSON.stringify({
          email,
          role: 'schoolAdmin'
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent",
        description: "School admin invitation has been sent successfully.",
      });
      setInviteDialogOpen(false);
      setInviteEmail("");
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

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim()) {
      inviteSchoolAdminMutation.mutate(inviteEmail.trim());
    }
  };

  const filteredSchools = schools.filter(school =>
    school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    school.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    school.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeSchools = filteredSchools.filter(school => school.isActive !== false);
  const inactiveSchools = filteredSchools.filter(school => school.isActive === false);

  const handleViewSchool = (school: School) => {
    setLocation(`/superadmin/schools/${school.id}`);
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading schools...</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="p-6">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Schools</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Failed to load school data. Please try again later.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">All Schools</h1>
            <p className="text-muted-foreground">
              Manage and oversee all schools in the platform
            </p>
          </div>
          {/* Invite School Admin Dialog */}
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <UserPlus className="mr-2 h-4 w-4" />
                Invite School Admin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite School Administrator</DialogTitle>
                <DialogDescription>
                  Send an invitation to a new school administrator. They will receive an email with instructions to set up their account.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInviteSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@schooldomain.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
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
                    disabled={inviteSchoolAdminMutation.isPending}
                  >
                    {inviteSchoolAdminMutation.isPending ? "Sending..." : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Add School Button */}
          <Button asChild>
            <Link to="/superadmin/schools/new">
              <Plus className="mr-2 h-4 w-4" />
              Add School
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
              <School className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{schools.length}</div>
              <p className="text-xs text-muted-foreground">
                {activeSchools.length} active, {inactiveSchools.length} inactive
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Students</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {schools.reduce((sum, school) => sum + (school.studentCount || 0), 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Across all schools
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {schools.reduce((sum, school) => sum + (school.classCount || 0), 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Available courses
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {schools.reduce((sum, school) => sum + (school.staffCount || 0), 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Educators & administrators
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search schools..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Schools List */}
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">
              Active Schools ({activeSchools.length})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive Schools ({inactiveSchools.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              All Schools ({filteredSchools.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <SchoolsList schools={activeSchools} onViewSchool={handleViewSchool} />
          </TabsContent>

          <TabsContent value="inactive" className="space-y-4">
            <SchoolsList schools={inactiveSchools} onViewSchool={handleViewSchool} />
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            <SchoolsList schools={filteredSchools} onViewSchool={handleViewSchool} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

interface SchoolsListProps {
  schools: School[];
  onViewSchool: (school: School) => void;
}

function SchoolsList({ schools, onViewSchool }: SchoolsListProps) {
  const [, setLocation] = useLocation();

  if (schools.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <School className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No schools found</h3>
          <p className="text-muted-foreground text-center">
            No schools match your current filter criteria.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {schools.map((school) => (
        <Card key={school.id} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">{school.name}</CardTitle>
                <CardDescription>
                  <Badge variant="secondary">{school.type}</Badge>
                </CardDescription>
              </div>
              <div className="flex space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation(`/superadmin/schools/${school.id}`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation(`/superadmin/schools/${school.id}/edit`)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {school.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {school.description}
              </p>
            )}

            <div className="space-y-2 text-sm">
              {school.location && (
                <div className="flex items-center text-muted-foreground">
                  <MapPin className="h-3 w-3 mr-2" />
                  {school.location}
                </div>
              )}

              {school.contactEmail && (
                <div className="flex items-center text-muted-foreground">
                  <Mail className="h-3 w-3 mr-2" />
                  {school.contactEmail}
                </div>
              )}

              {school.registrationCode && (
                <div className="flex items-center text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    Code: {school.registrationCode}
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
              <span>{school.studentCount || 0} students</span>
              <span>{school.classCount || 0} classes</span>
              <span>{school.staffCount || 0} staff</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}