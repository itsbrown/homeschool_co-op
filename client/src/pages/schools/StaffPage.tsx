import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PlusCircle, Search, Mail, Phone, UserCheck, UserX, MoreHorizontal } from "lucide-react";
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
import DashboardLayout from '@/components/layout/DashboardLayout';

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
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("list");

  // Fetch staff for the school (using sample data for now)
  const { data: staff, isLoading, error } = useQuery({
    queryKey: ['/api/schools/staff'],
    queryFn: () => Promise.resolve(sampleStaff),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading staff information...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
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
      </DashboardLayout>
    );
  }

  // Filter staff based on search query and filters
  const filteredStaff = staff.filter(member => {
    const matchesSearch = searchQuery === "" || 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === "" || member.role === roleFilter;
    const matchesDepartment = departmentFilter === "" || member.department === departmentFilter;
    const matchesStatus = statusFilter === "" || member.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  // Get unique roles, departments, and statuses for filters
  const roles = [...new Set(staff.map(member => member.role))];
  const departments = [...new Set(staff.map(member => member.department))];
  const statuses = [...new Set(staff.map(member => member.status))];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold">Staff Management</h1>
              <p className="text-muted-foreground">Manage your school's teachers and staff members</p>
            </div>
            <div className="flex gap-2">
              <Link href="/schools/staff/invite">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Invite Staff
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
                        <SelectItem value="">All Roles</SelectItem>
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
                        <SelectItem value="">All Departments</SelectItem>
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
                        <SelectItem value="">All Statuses</SelectItem>
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
                                  className={`bg-${STATUS_COLORS[member.status]}-100 text-${STATUS_COLORS[member.status]}-800 border-${STATUS_COLORS[member.status]}-200`}
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
                                className={`bg-${STATUS_COLORS[member.status]}-100 text-${STATUS_COLORS[member.status]}-800 border-${STATUS_COLORS[member.status]}-200`}
                              >
                                {member.status}
                              </Badge>
                            </div>
                            <div className="flex flex-col items-center mt-2">
                              <Avatar className="w-24 h-24 mb-3">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback className="text-xl">{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                              </Avatar>
                              <CardTitle className="text-xl">{member.name}</CardTitle>
                              <CardDescription className="text-sm">{member.role} - {member.department}</CardDescription>
                            </div>
                          </CardHeader>
                          <CardContent className="text-center pb-2">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-center">
                                <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                                <span>{member.email}</span>
                              </div>
                              <div className="flex items-center justify-center">
                                <Phone className="w-4 h-4 mr-2 text-muted-foreground" />
                                <span>{member.phone}</span>
                              </div>
                              {member.subjects.length > 0 && (
                                <div className="flex flex-wrap justify-center gap-1 mt-1">
                                  {member.subjects.map(subject => (
                                    <Badge key={subject} variant="secondary" className="mt-1">{subject}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                          <CardFooter className="flex justify-center gap-2 pt-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/schools/staff/${member.id}`}>View Profile</Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/schools/staff/${member.id}/edit`}>Edit</Link>
                            </Button>
                          </CardFooter>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-12 text-muted-foreground">
                        <p>No staff members found. Try adjusting your search or filters.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="org">
                <CardContent className="py-12 text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-12 h-12 mx-auto text-muted-foreground mb-4"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                  <h3 className="text-lg font-medium">Organization Chart Coming Soon</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mt-2">
                    The organization chart will display the hierarchical structure of your staff.
                    Check back soon for this feature.
                  </p>
                </CardContent>
              </TabsContent>

              <CardFooter className="flex justify-between items-center border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredStaff.length} of {staff.length} staff members
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={() => {
                    setSearchQuery("");
                    setRoleFilter("");
                    setDepartmentFilter("");
                    setStatusFilter("");
                  }}>
                    Reset Filters
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}