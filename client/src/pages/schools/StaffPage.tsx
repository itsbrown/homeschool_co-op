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
import AppShell from '@/components/layout/AppShell';
import { apiRequest } from "@/lib/queryClient";

// Sample staff data (will be replaced with API data)
const sampleStaff = [
  {
    id: 1,
    name: "Dr. Sarah Johnson",
    email: "sarah.johnson@example.com",
    phone: "(555) 123-4567",
    role: "Teacher",
    department: "History",
    subjects: ["U.S. History", "World History"],
    status: "Active",
    joinDate: "2021-08-15",
    avatar: "",
  },
  {
    id: 2,
    name: "Prof. Michael Chen",
    email: "michael.chen@example.com",
    phone: "(555) 234-5678",
    role: "Teacher",
    department: "Mathematics",
    subjects: ["Calculus", "Algebra"],
    status: "Active",
    joinDate: "2020-09-01",
    avatar: "",
  },
  {
    id: 3,
    name: "Ms. Elena Rodriguez",
    email: "elena.rodriguez@example.com",
    phone: "(555) 345-6789",
    role: "Teacher",
    department: "Languages",
    subjects: ["Spanish", "ESL"],
    status: "Active",
    joinDate: "2022-01-10",
    avatar: "",
  },
  {
    id: 4,
    name: "Dr. Robert Williams",
    email: "robert.williams@example.com",
    phone: "(555) 456-7890",
    role: "Department Head",
    department: "Science",
    subjects: ["Biology", "Environmental Science"],
    status: "Active",
    joinDate: "2019-08-20",
    avatar: "",
  },
  {
    id: 5,
    name: "Ms. Amanda Taylor",
    email: "amanda.taylor@example.com",
    phone: "(555) 567-8901",
    role: "Teacher",
    department: "English",
    subjects: ["Creative Writing", "Literature"],
    status: "On Leave",
    joinDate: "2020-08-15",
    avatar: "",
  },
  {
    id: 6,
    name: "Mr. David Kim",
    email: "david.kim@example.com",
    phone: "(555) 678-9012",
    role: "Administrator",
    department: "Administration",
    subjects: [],
    status: "Active",
    joinDate: "2018-06-01",
    avatar: "",
  },
];

// Sample status colors
const STATUS_COLORS = {
  "Active": "green",
  "On Leave": "yellow",
  "Inactive": "red",
  "Pending": "blue",
};

export default function StaffPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("list");

  // Mutation for resending individual invite
  const resendInviteMutation = useMutation({
    mutationFn: async (staffId: number) => {
      const response = await apiRequest("POST", `/school-admin/staff/${staffId}/resend-invite`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
      toast({
        title: "Invite resent",
        description: "The invitation has been resent successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resend invite",
        description: error?.message || "There was an error resending the invitation.",
        variant: "destructive",
      });
    },
  });

  // Mutation for resending all pending invites
  const resendAllInvitesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/school-admin/staff/resend-all-invites");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
      toast({
        title: "Invites resent",
        description: `${data.count || 0} pending invitations have been resent successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resend invites",
        description: error?.message || "There was an error resending the invitations.",
        variant: "destructive",
      });
    },
  });

  // Fetch staff for the school with automatic polling for real-time updates
  const { data: staff, isLoading, error } = useQuery({
    queryKey: ['/api/school-admin/staff'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/school-admin/staff', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          // If we get an error, return empty array instead of throwing
          console.log('Staff API returned error:', response.status);
          return [];
        }
        
        return await response.json();
      } catch (error) {
        console.log('Staff fetch error:', error);
        return [];
      }
    },
    retry: false,
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
    refetchIntervalInBackground: true, // Continue polling when window is not focused
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading staff information...</span>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
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
      </AppShell>
    );
  }

  // Filter staff based on search query and filters
  const filteredStaff = staff?.filter(member => {
    const matchesSearch = searchQuery === "" || 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === "" || member.role === roleFilter;
    const matchesDepartment = departmentFilter === "" || member.department === departmentFilter;
    const matchesStatus = statusFilter === "" || member.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  }) || [];

  // Get unique roles, departments, and statuses for filters
  const roles = staff ? [...new Set(staff.map(member => member.role))] : [];
  const departments = staff ? [...new Set(staff.map(member => member.department))] : [];
  const statuses = staff ? [...new Set(staff.map(member => member.status))] : [];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Staff Management</h1>
            <p className="text-muted-foreground">Manage your school's teachers and staff members</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => resendAllInvitesMutation.mutate()}
              disabled={resendAllInvitesMutation.isPending}
            >
              {resendAllInvitesMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Resend All Invites
            </Button>
            <Button asChild>
              <Link href="/schools/staff/invite">
                <PlusCircle className="mr-2 h-4 w-4" />
                Invite Staff
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/schools/staff/positions">Manage Positions</Link>
            </Button>
          </div>
        </div>

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold">Staff Management</h1>
              <p className="text-muted-foreground">Manage your school's teachers and staff members</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => resendAllInvitesMutation.mutate()}
                disabled={resendAllInvitesMutation.isPending}
              >
                {resendAllInvitesMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Resend All Invites
              </Button>
              <Link href="/schools/staff/invite">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Invite Staff
                </Button>
              </Link>
              <Link href="/schools/staff/positions">
                <Button variant="outline">
                  Manage Positions
                </Button>
              </Link>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="list">List View</TabsTrigger>
              <TabsTrigger value="grid">Grid View</TabsTrigger>
              <TabsTrigger value="org">Org Chart</TabsTrigger>
            </TabsList>

            <Card>
              <CardHeader>
                <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-roles">All Roles</SelectItem>
                        {roles.map((role) => (
                          <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-departments">All Departments</SelectItem>
                        {departments.map((department) => (
                          <SelectItem key={department} value={department}>{department}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-statuses">All Statuses</SelectItem>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <TabsContent value="list">
                <CardContent>
                  <div className="rounded-md border">
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
                          filteredStaff.map((member) => (
                            <TableRow key={member.id}>
                              <TableCell>
                                <div className="flex items-center space-x-3">
                                  <Avatar>
                                    <AvatarImage src={member.avatar} />
                                    <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                  </Avatar>
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
                                <div className="flex flex-col space-y-1">
                                  <div className="flex items-center">
                                    <Mail className="w-3 h-3 mr-1 text-muted-foreground" />
                                    <span className="text-sm">{member.email}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <Phone className="w-3 h-3 mr-1 text-muted-foreground" />
                                    <span className="text-sm">{member.phone}</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline" 
                                  className={`bg-opacity-15 border border-opacity-30 ${member.status === "Active" ? "bg-green-100 text-green-800 border-green-200" : 
                                    member.status === "On Leave" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                                    member.status === "Inactive" ? "bg-red-100 text-red-800 border-red-200" :
                                    "bg-blue-100 text-blue-800 border-blue-200"}`}
                                >
                                  {member.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem>
                                      <Link href={`/schools/staff/${member.id}`}>View Profile</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Link href={`/schools/staff/${member.id}/edit`}>Edit Details</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Link href={`/schools/staff/${member.id}/schedule`}>View Schedule</Link>
                                    </DropdownMenuItem>
                                    {member.status === "Pending" && (
                                      <DropdownMenuItem
                                        onClick={() => resendInviteMutation.mutate(member.id)}
                                        disabled={resendInviteMutation.isPending}
                                      >
                                        <div className="flex items-center text-blue-600">
                                          <Send className="mr-2 h-4 w-4" />
                                          <span>Resend Invite</span>
                                        </div>
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem>
                                      {member.status === "Active" ? (
                                        <div className="flex items-center text-red-500">
                                          <UserX className="mr-2 h-4 w-4" />
                                          <span>Set Inactive</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center text-green-500">
                                          <UserCheck className="mr-2 h-4 w-4" />
                                          <span>Set Active</span>
                                        </div>
                                      )}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                              No staff members found. Try adjusting your search or filters.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="grid">
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredStaff.length > 0 ? (
                      filteredStaff.map((member) => (
                        <Card key={member.id}>
                          <CardHeader className="text-center pb-2">
                            <div className="flex justify-end">
                              <Badge 
                                variant="outline" 
                                className={`bg-opacity-15 border border-opacity-30 ${member.status === "Active" ? "bg-green-100 text-green-800 border-green-200" : 
                                    member.status === "On Leave" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                                    member.status === "Inactive" ? "bg-red-100 text-red-800 border-red-200" :
                                    "bg-blue-100 text-blue-800 border-blue-200"}`}
                              >
                                {member.status}
                              </Badge>
                            </div>
                            <div className="flex flex-col items-center mt-2">
                              <Avatar className="w-24 h-24 mb-3">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback className="text-2xl">{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                              </Avatar>
                              <CardTitle className="text-xl">{member.name}</CardTitle>
                              <CardDescription>{member.role} - {member.department}</CardDescription>
                            </div>
                          </CardHeader>
                          <CardContent className="text-center pb-2">
                            <div className="space-y-2">
                              <div className="flex items-center justify-center">
                                <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                                <span className="text-sm">{member.email}</span>
                              </div>
                              <div className="flex items-center justify-center">
                                <Phone className="w-4 h-4 mr-2 text-muted-foreground" />
                                <span className="text-sm">{member.phone}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Joined {new Date(member.joinDate).toLocaleDateString()}
                              </div>
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
                      ))
                    ) : (
                      <div className="col-span-full flex items-center justify-center p-6 text-muted-foreground">
                        No staff members found. Try adjusting your search or filters.
                      </div>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="org">
                <CardContent>
                  <div className="p-6 min-h-[300px] flex items-center justify-center flex-col">
                    <div className="mb-4">
                      <svg
                        className="h-12 w-12 text-primary opacity-70"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
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
    </AppShell>
  );
}