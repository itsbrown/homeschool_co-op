import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlusCircle, Search, Mail, Phone, UserCheck, UserX, MoreHorizontal, RefreshCw, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { apiRequest } from "@/lib/queryClient";

export default function StaffPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [activeView, setActiveView] = useState("list");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch staff data from API
  const { data: staff, isLoading, error } = useQuery({
    queryKey: ['/api/school-admin/staff'],
    refetchInterval: 5000, // Reasonable refresh interval
    refetchIntervalInBackground: true,
    staleTime: 1000, // Consider data stale after 1 second
  });

  // Ensure staff is treated as an array
  const staffArray = Array.isArray(staff) ? staff : [];
  const staffData = staffArray;

  // Mutation for resending individual invites
  const resendInviteMutation = useMutation({
    mutationFn: async (staffId: number) => {
      return apiRequest("POST", `/school-admin/staff/${staffId}/resend-invite`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invitation resent successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to resend invitation",
        variant: "destructive",
      });
    },
  });

  // Mutation for resending all invites
  const resendAllInvitesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/school-admin/staff/resend-all-invites");
    },
    onSuccess: () => {
      toast({
        title: "Success", 
        description: "All pending invitations resent successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to resend all invitations",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Staff">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading staff information...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error) {
    return (
      <SchoolAdminLayout pageTitle="Staff">
        <div className="max-w-4xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Error Loading Staff</CardTitle>
              <CardDescription>
                There was a problem loading your school's staff information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Please try again later or contact support if this issue persists.</p>
            </CardContent>
            <CardFooter>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </CardFooter>
          </Card>
        </div>
      </SchoolAdminLayout>
    );
  }

  // Filter staff based on search query and filters
  const filteredStaff = staffData.filter((member: any) => {
    const matchesSearch = searchQuery === "" || 
      member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = selectedRole === "all" || member.role === selectedRole;
    const matchesDepartment = selectedDepartment === "all" || member.department === selectedDepartment;
    const matchesStatus = selectedStatus === "all" || member.status === selectedStatus;
    
    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  // Extract unique values for filter dropdowns
  const roles = [...new Set(staffData.map((member: any) => member.role))];
  const departments = [...new Set(staffData.map((member: any) => member.department))];
  const statuses = [...new Set(staffData.map((member: any) => member.status))];

  return (
    <SchoolAdminLayout pageTitle="Staff">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 mb-6">
          <p className="text-muted-foreground">Manage your school's teachers and staff members</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => resendAllInvitesMutation.mutate()}
              disabled={resendAllInvitesMutation.isPending}
              data-testid="button-resend-invites"
              className="w-full sm:w-auto"
            >
              {resendAllInvitesMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Resend All Invites
            </Button>
            <Button asChild data-testid="button-invite-staff" className="w-full sm:w-auto">
              <Link href="/schools/staff/invite">
                <PlusCircle className="mr-2 h-4 w-4" />
                Invite Staff
              </Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-manage-positions" className="w-full sm:w-auto">
              <Link href="/schools/staff/positions">Manage Positions</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-6">
          <Tabs value={activeView} onValueChange={setActiveView}>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
                  <div>
                    <CardTitle>Staff Management</CardTitle>
                    <CardDescription>Manage your school's teachers and staff members</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <TabsList>
                      <TabsTrigger value="list">List View</TabsTrigger>
                      <TabsTrigger value="grid">Grid View</TabsTrigger>
                      <TabsTrigger value="chart">Org Chart</TabsTrigger>
                    </TabsList>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>

                {/* Filters - stack on mobile */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>

              <TabsContent value="list" className="mt-0">
                <CardContent>
                  {/* Desktop Table View - Hidden on mobile */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStaff.length > 0 ? (
                          filteredStaff.map((member: any) => (
                            <TableRow key={member.id}>
                              <TableCell>
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <span className="text-sm font-medium text-primary">
                                      {member.name?.split(' ').map((n: any) => n[0]).join('').toUpperCase() || 'U'}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="font-medium">{member.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      Joined {new Date(member.joinDate).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{member.role}</TableCell>
                              <TableCell>{member.department}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-1">
                                    <Mail className="w-3 h-3" />
                                    <span className="text-sm">{member.email}</span>
                                  </div>
                                  {member.phone && (
                                    <div className="flex items-center space-x-1">
                                      <Phone className="w-3 h-3" />
                                      <span className="text-sm">{member.phone}</span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={member.status === 'Active' ? 'default' : 'secondary'}
                                  className={member.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                                >
                                  {member.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                      <Link href={`/schools/staff/${member.id}`}>View Profile</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                      <Link href={`/schools/staff/${member.id}/edit`}>Edit</Link>
                                    </DropdownMenuItem>
                                    {member.status === "Pending" && (
                                      <DropdownMenuItem 
                                        onClick={() => resendInviteMutation.mutate(member.id)}
                                        disabled={resendInviteMutation.isPending}
                                      >
                                        <Send className="w-4 h-4 mr-2" />
                                        Resend Invite
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              <div className="text-muted-foreground">No staff members found matching your criteria.</div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card View - Shown only on mobile */}
                  <div className="md:hidden space-y-3">
                    {filteredStaff.length > 0 ? (
                      filteredStaff.map((member: any) => (
                        <Card key={member.id} className="overflow-hidden">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-sm font-medium text-primary">
                                    {member.name?.split(' ').map((n: any) => n[0]).join('').toUpperCase() || 'U'}
                                  </span>
                                </div>
                                <div>
                                  <CardTitle className="text-base">{member.name}</CardTitle>
                                  <CardDescription className="text-xs">
                                    {member.role} • {member.department}
                                  </CardDescription>
                                </div>
                              </div>
                              <Badge 
                                variant={member.status === 'Active' ? 'default' : 'secondary'}
                                className={member.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                              >
                                {member.status}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0 space-y-2">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-1 text-sm">
                                <Mail className="w-3 h-3 text-muted-foreground" />
                                <span className="text-muted-foreground">{member.email}</span>
                              </div>
                              {member.phone && (
                                <div className="flex items-center space-x-1 text-sm">
                                  <Phone className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{member.phone}</span>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Joined {new Date(member.joinDate).toLocaleDateString()}
                            </div>
                          </CardContent>
                          <CardFooter className="pt-2 pb-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="w-full"
                                  data-testid={`button-staff-actions-${member.id}`}
                                >
                                  <MoreHorizontal className="mr-2 h-4 w-4" />
                                  Actions
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/schools/staff/${member.id}`}>View Profile</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/schools/staff/${member.id}/edit`}>Edit</Link>
                                </DropdownMenuItem>
                                {member.status === "Pending" && (
                                  <DropdownMenuItem 
                                    onClick={() => resendInviteMutation.mutate(member.id)}
                                    disabled={resendInviteMutation.isPending}
                                  >
                                    <Send className="w-4 h-4 mr-2" />
                                    Resend Invite
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </CardFooter>
                        </Card>
                      ))
                    ) : (
                      <Card>
                        <CardContent className="text-center py-12 text-muted-foreground">
                          No staff members found matching your criteria.
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="grid" className="mt-0">
                <CardContent>
                  {filteredStaff.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredStaff.map((member: any) => (
                        <Card key={member.id} className="hover:shadow-md transition-shadow">
                          <CardHeader className="text-center pb-2">
                            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                              <span className="text-lg font-medium text-primary">
                                {member.name?.split(' ').map((n: any) => n[0]).join('').toUpperCase() || 'U'}
                              </span>
                            </div>
                            <CardTitle className="text-lg">{member.name}</CardTitle>
                            <CardDescription>{member.role} • {member.department}</CardDescription>
                          </CardHeader>
                          <CardContent className="text-center space-y-2">
                            <div className="flex items-center justify-center space-x-1">
                              <Mail className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{member.email}</span>
                            </div>
                            {member.phone && (
                              <div className="flex items-center justify-center space-x-1">
                                <Phone className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm">{member.phone}</span>
                              </div>
                            )}
                            <div className="flex justify-center">
                              <Badge 
                                variant={member.status === 'Active' ? 'default' : 'secondary'}
                                className={member.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                              >
                                {member.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Joined {new Date(member.joinDate).toLocaleDateString()}
                            </div>
                          </CardContent>
                          <CardFooter className="flex justify-center gap-2 pt-2">
                            <Button size="sm" variant="outline">
                              <Link href={`/schools/staff/${member.id}`}>View Profile</Link>
                            </Button>
                            <Button size="sm" variant="outline">
                              <Link href={`/schools/staff/${member.id}/edit`}>Edit</Link>
                            </Button>
                            {member.status === "Pending" && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => resendInviteMutation.mutate(member.id)}
                                disabled={resendInviteMutation.isPending}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                Resend
                              </Button>
                            )}
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="col-span-full flex items-center justify-center p-6 text-muted-foreground">
                      No staff members found matching your criteria.
                    </div>
                  )}
                </CardContent>
              </TabsContent>

              <TabsContent value="chart" className="mt-0">
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-medium">Organization Chart Coming Soon</h3>
                    <p className="text-muted-foreground mt-2 text-center">
                      The organizational chart view for visualizing your school's staff hierarchy is currently in development.
                    </p>
                  </div>
                </CardContent>
              </TabsContent>

              <CardFooter className="flex justify-between border-t pt-6">
                <Button variant="outline" size="sm">
                  Export Staff List
                </Button>
                <div>
                  <span className="text-sm text-muted-foreground mr-4">
                    {filteredStaff.length} of {staff?.length || 0} staff members
                  </span>
                </div>
              </CardFooter>
            </Card>
          </Tabs>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}