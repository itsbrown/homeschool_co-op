import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PlusCircle, Search, GraduationCap, BookOpen, CalendarDays, FileUp, MoreHorizontal } from "lucide-react";
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

export default function StudentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeView, setActiveView] = useState("list");
  const { toast } = useToast();

  // Fetch students data from API
  const { data: students, isLoading, error } = useQuery({
    queryKey: ['/api/school-admin/students'],
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchIntervalInBackground: true,
  });

  // Ensure students is treated as an array
  const studentsArray = Array.isArray(students) ? students : [];
  const studentsData = studentsArray;

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Students">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading students...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error) {
    return (
      <SchoolAdminLayout pageTitle="Students">
        <div className="max-w-4xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Error Loading Students</CardTitle>
              <CardDescription>
                There was a problem loading your school's student information.
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

  // Filter and sort students based on search query and filters
  const filteredStudents = studentsArray.length > 0 ? studentsArray.filter((student: any) => {
    const matchesSearch = searchQuery === "" || 
      student.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.parentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGradeLevel = gradeLevelFilter === "all" || student.gradeLevel === gradeLevelFilter;
    const matchesStatus = statusFilter === "all" || student.status === statusFilter;
    const matchesLocation = locationFilter === "all" || student.locationName === locationFilter;
    
    return matchesSearch && matchesGradeLevel && matchesStatus && matchesLocation;
  }).sort((a: any, b: any) => {
    let aValue: any = "";
    let bValue: any = "";
    
    switch (sortField) {
      case "name":
        aValue = a.name?.toLowerCase() || "";
        bValue = b.name?.toLowerCase() || "";
        break;
      case "grade":
        aValue = parseInt(a.gradeLevel) || 0;
        bValue = parseInt(b.gradeLevel) || 0;
        break;
      case "age":
        aValue = parseInt(a.age) || 0;
        bValue = parseInt(b.age) || 0;
        break;
      case "location":
        aValue = a.locationName?.toLowerCase() || "";
        bValue = b.locationName?.toLowerCase() || "";
        break;
      case "parent":
        aValue = a.parentName?.toLowerCase() || "";
        bValue = b.parentName?.toLowerCase() || "";
        break;
      case "enrollment":
        aValue = new Date(a.enrollmentDate || 0).getTime();
        bValue = new Date(b.enrollmentDate || 0).getTime();
        break;
      case "status":
        aValue = a.status?.toLowerCase() || "";
        bValue = b.status?.toLowerCase() || "";
        break;
      default:
        aValue = a.name?.toLowerCase() || "";
        bValue = b.name?.toLowerCase() || "";
    }
    
    if (sortDirection === "asc") {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  }) : [];

  // Get unique grade levels, statuses, and locations for filters
  const gradeLevels = studentsArray.length > 0 ? [...new Set(studentsArray.map((student: any) => student.gradeLevel))] : [];
  const statuses = studentsArray.length > 0 ? [...new Set(studentsArray.map((student: any) => student.status))] : [];
  const locations = studentsArray.length > 0 ? [...new Set(studentsArray.map((student: any) => student.locationName).filter(Boolean))] : [];

  // Sort grade levels numerically
  gradeLevels.sort((a: any, b: any) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (isNaN(numA) || isNaN(numB)) {
      return a.localeCompare(b);
    }
    return numA - numB;
  });

  return (
    <SchoolAdminLayout pageTitle="Students">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Students</h1>
            <p className="text-muted-foreground">Manage your school's student enrollment and information</p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/schools/students/add">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Student
              </Link>
            </Button>
            <Button variant="outline">
              <FileUp className="mr-2 h-4 w-4" />
              Import Students
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-6">
          <Tabs value={activeView} onValueChange={setActiveView}>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
                  <div>
                    <CardTitle>Student Management</CardTitle>
                    <CardDescription>Manage your school's student roster and enrollment</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <TabsList>
                      <TabsTrigger value="list">List View</TabsTrigger>
                      <TabsTrigger value="grid">Grid View</TabsTrigger>
                      <TabsTrigger value="analytics">Analytics</TabsTrigger>
                    </TabsList>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Search and Filters */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, parent, or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Select value={gradeLevelFilter} onValueChange={setGradeLevelFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Grade Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Grades</SelectItem>
                        {gradeLevels.map((grade: any) => (
                          <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {locations.map((location: any) => (
                          <SelectItem key={location} value={location}>{location}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {statuses.map((status: any) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Sorting Controls */}
                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">Sort by:</span>
                      <Select value={sortField} onValueChange={setSortField}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="grade">Grade Level</SelectItem>
                          <SelectItem value="age">Age</SelectItem>
                          <SelectItem value="location">Location</SelectItem>
                          <SelectItem value="parent">Parent/Guardian</SelectItem>
                          <SelectItem value="enrollment">Enrollment Date</SelectItem>
                          <SelectItem value="status">Status</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                      >
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {filteredStudents.length} of {studentsData.length || 0} students
                    </div>
                  </div>
                </div>
              </CardContent>

              <TabsContent value="list" className="mt-0">
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Parent/Guardian</TableHead>
                        <TableHead>Enrollment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.length > 0 ? (
                        filteredStudents.map((student: any) => (
                          <TableRow key={student.id}>
                            <TableCell>
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-sm font-medium text-primary">
                                    {student.name?.split(' ').map((n: any) => n[0]).join('').toUpperCase() || 'S'}
                                  </span>
                                </div>
                                <div>
                                  <div className="font-medium">{student.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    ID: {student.id}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{student.gradeLevel}</Badge>
                            </TableCell>
                            <TableCell>{student.age || 'N/A'}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{student.locationName || 'Unknown'}</div>
                                <div className="text-xs text-muted-foreground">{student.locationCode || 'N/A'}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{student.parentName || 'N/A'}</div>
                                <div className="text-sm text-muted-foreground">{student.email || 'No email'}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : 'N/A'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={student.status === 'Active' ? 'default' : 'secondary'}
                                className={student.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                              >
                                {student.status || 'Active'}
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
                                    <Link href={`/schools/students/${student.id}`}>View Profile</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/schools/students/${student.id}/edit`}>Edit Student</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/schools/students/${student.id}/classes`}>Manage Classes</Link>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <div className="text-muted-foreground">No students found matching your criteria.</div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </TabsContent>

              <TabsContent value="grid" className="mt-0">
                <CardContent>
                  {filteredStudents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredStudents.map((student: any) => (
                        <Card key={student.id} className="hover:shadow-md transition-shadow">
                          <CardHeader className="text-center pb-2">
                            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                              <span className="text-lg font-medium text-primary">
                                {student.name?.split(' ').map((n: any) => n[0]).join('').toUpperCase() || 'S'}
                              </span>
                            </div>
                            <CardTitle className="text-lg">{student.name}</CardTitle>
                            <CardDescription>Grade {student.gradeLevel} • {student.age ? `Age ${student.age}` : 'Age N/A'}</CardDescription>
                          </CardHeader>
                          <CardContent className="text-center space-y-2">
                            <div className="text-sm">
                              <strong>Parent:</strong> {student.parentName || 'N/A'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {student.email || 'No email provided'}
                            </div>
                            <div className="flex justify-center">
                              <Badge 
                                variant={student.status === 'Active' ? 'default' : 'secondary'}
                                className={student.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                              >
                                {student.status || 'Active'}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Enrolled: {student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : 'N/A'}
                            </div>
                          </CardContent>
                          <CardFooter className="flex justify-center gap-2 pt-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/schools/students/${student.id}`}>View</Link>
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/schools/students/${student.id}/edit`}>Edit</Link>
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="col-span-full flex items-center justify-center p-6 text-muted-foreground">
                      No students found matching your criteria.
                    </div>
                  )}
                </CardContent>
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <GraduationCap className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-medium">Student Analytics Coming Soon</h3>
                    <p className="text-muted-foreground mt-2 text-center">
                      Detailed analytics and insights about your student population are currently in development.
                    </p>
                  </div>
                </CardContent>
              </TabsContent>

              <CardFooter className="flex justify-between border-t pt-6">
                <Button variant="outline" size="sm">
                  Export Student List
                </Button>
                <div>
                  <span className="text-sm text-muted-foreground mr-4">
                    {filteredStudents.length} of {students?.length || 0} students
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