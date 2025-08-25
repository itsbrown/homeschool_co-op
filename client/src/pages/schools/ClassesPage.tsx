import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlusCircle, Search, Filter, FileDown, Calendar, Users, Clock, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import AppShell from '@/components/layout/AppShell';
import { apiRequest } from "@/lib/queryClient";

// Sample class data (will be replaced with API data)
const sampleClasses = [
  {
    id: 1,
    title: "Introduction to American History",
    category: "History",
    subject: "U.S. History",
    instructor: "Dr. Sarah Johnson",
    gradeLevel: "9-12",
    status: "Active",
    enrollmentCount: 18,
    maxEnrollment: 25,
    schedule: "Mon, Wed 2:00-3:30 PM",
    startDate: "2023-09-05",
    endDate: "2023-12-15",
  },
  {
    id: 2,
    title: "Advanced Mathematics",
    category: "Mathematics",
    subject: "Calculus",
    instructor: "Prof. Michael Chen",
    gradeLevel: "10-12",
    status: "Active",
    enrollmentCount: 15,
    maxEnrollment: 20,
    schedule: "Tue, Thu 10:00-11:30 AM",
    startDate: "2023-09-07",
    endDate: "2023-12-14",
  },
  {
    id: 3,
    title: "Creative Writing Workshop",
    category: "Language Arts",
    subject: "English",
    instructor: "Ms. Emily Rodriguez",
    gradeLevel: "7-9",
    status: "Upcoming",
    enrollmentCount: 12,
    maxEnrollment: 18,
    schedule: "Fri 1:00-2:30 PM",
    startDate: "2024-01-15",
    endDate: "2024-05-20",
  },
  {
    id: 4,
    title: "Science Laboratory",
    category: "Science",
    subject: "Chemistry",
    instructor: "Dr. Robert Kim",
    gradeLevel: "10-12",
    status: "Draft",
    enrollmentCount: 0,
    maxEnrollment: 15,
    schedule: "Wed 3:00-4:30 PM",
    startDate: "2024-01-10",
    endDate: "2024-05-22",
  },
];

// Sample class states for filtering
const STATUS_COLORS: Record<string, string> = {
  "Active": "green",
  "Upcoming": "blue",
  "Completed": "gray",
  "Canceled": "red",
  "Draft": "yellow",
};

export default function SchoolClassesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("");
  const [activeTab, setActiveTab] = useState("list");
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    className: true,
    category: true,
    instructor: true,
    gradeLevel: true,
    status: true,
    enrollment: true,
    actions: true
  });

  // Load column preferences from localStorage
  useEffect(() => {
    const savedColumns = localStorage.getItem('classTableColumns');
    if (savedColumns) {
      setVisibleColumns(JSON.parse(savedColumns));
    }
  }, []);

  // Save column preferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('classTableColumns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Toggle column visibility
  const toggleColumn = (column: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // Fetch classes for the school from the API
  const { data: classes, isLoading, error, refetch } = useQuery({
    queryKey: ['/school-admin/classes'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/school-admin/classes");
      const data = await response.json();
      return data;
    },
  });

  // Mutation for duplicating a class
  const duplicateClassMutation = useMutation({
    mutationFn: async (classData: any) => {
      const duplicatedClass = {
        ...classData,
        title: `${classData.title} - Copy`,
        status: "upcoming",
        enrollmentCount: 0,
        id: undefined // Remove ID so it creates a new class
      };
      delete duplicatedClass.id;
      
      const response = await apiRequest("POST", "/school-admin/classes", duplicatedClass);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/school-admin/classes'] });
      toast({
        title: "Success",
        description: "Class has been duplicated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to duplicate class. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation for unassigning instructor
  const unassignInstructorMutation = useMutation({
    mutationFn: async (classId: number) => {
      const response = await apiRequest("PATCH", `/school-admin/classes/${classId}`, {
        instructorName: "no-instructor"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/school-admin/classes'] });
      toast({
        title: "Success",
        description: "Instructor has been unassigned from the class.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unassign instructor.",
        variant: "destructive",
      });
    },
  });

  // Handler for unassigning instructor
  const handleUnassignInstructor = async (classId: number, className: string) => {
    if (confirm(`Are you sure you want to unassign the instructor from "${className}"?`)) {
      unassignInstructorMutation.mutate(classId);
    }
  };

  // Handler for duplicating a class
  const handleDuplicateClass = (classData: any) => {
    duplicateClassMutation.mutate(classData);
  };

  // Mutation for deleting a class
  const deleteClassMutation = useMutation({
    mutationFn: async (classId: number) => {
      const response = await apiRequest("DELETE", `/school-admin/classes/${classId}`);
      if (!response.ok) {
        throw new Error('Failed to delete class');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/school-admin/classes'] });
      toast({
        title: "Success",
        description: "Class has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete class. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handler for deleting a class
  const handleDeleteClass = async (classId: number, className: string) => {
    if (confirm(`Are you sure you want to delete "${className}"? This action cannot be undone and will remove all associated data including enrollments and payment records.`)) {
      deleteClassMutation.mutate(classId);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="container mx-auto p-4">
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-lg">Loading classes...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="container mx-auto p-4">
          <div className="max-w-4xl mx-auto p-6">
            <Card>
              <CardHeader>
                <CardTitle>Error Loading Classes</CardTitle>
                <CardDescription>
                  There was a problem loading your school's classes.
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
        </div>
      </AppShell>
    );
  }

  // Use API data if available, otherwise fall back to sample data
  const classData = classes?.items || sampleClasses;

  // Filter logic
  const filteredClasses = classData.filter((cls: any) => {
    return (
      (!searchQuery || 
       cls.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
       cls.instructor.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (!categoryFilter || categoryFilter === 'all-categories' || cls.category === categoryFilter) &&
      (!statusFilter || statusFilter === 'all-statuses' || cls.status === statusFilter) &&
      (!gradeLevelFilter || gradeLevelFilter === 'all-grade-levels' || cls.gradeLevel === gradeLevelFilter)
    );
  });

  // Extract unique values for filters
  const categories = Array.from(new Set(classData.map((cls: any) => cls.category)));
  const statuses = Array.from(new Set(classData.map((cls: any) => cls.status)));
  const gradeLevels = Array.from(new Set(classData.map((cls: any) => cls.gradeLevel)));

  const exportClassList = () => {
    const csvContent = [
      ['Class Name', 'Category', 'Instructor', 'Grade Level', 'Status', 'Enrollment', 'Schedule'],
      ...filteredClasses.map((cls: any) => [
        cls.title,
        cls.category,
        cls.instructor,
        cls.gradeLevel,
        cls.status,
        `${cls.enrollmentCount}/${cls.maxEnrollment}`,
        cls.schedule
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'class-list.csv';
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Class list exported",
      description: "Your class list has been downloaded as a CSV file.",
    });
  };

  return (
    <AppShell>
      <div className="container mx-auto p-4">
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex flex-col space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
              <div>
                <h1 className="text-3xl font-bold">School Classes</h1>
                <p className="text-muted-foreground">Manage your school's classes and curricula</p>
              </div>
              <Link href="/schools/classes/new">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add New Class
                </Button>
              </Link>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="list">List View</TabsTrigger>
                <TabsTrigger value="grid">Grid View</TabsTrigger>
                <TabsTrigger value="calendar">Calendar View</TabsTrigger>
              </TabsList>

              {/* Filters and Search */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search by class name or instructor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-categories">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-statuses">All Statuses</SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Settings className="mr-2 h-4 w-4" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Show/Hide Columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.className}
                      onCheckedChange={() => toggleColumn('className')}
                    >
                      Class Name
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.category}
                      onCheckedChange={() => toggleColumn('category')}
                    >
                      Category
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.instructor}
                      onCheckedChange={() => toggleColumn('instructor')}
                    >
                      Instructor
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.gradeLevel}
                      onCheckedChange={() => toggleColumn('gradeLevel')}
                    >
                      Grade Level
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.status}
                      onCheckedChange={() => toggleColumn('status')}
                    >
                      Status
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.enrollment}
                      onCheckedChange={() => toggleColumn('enrollment')}
                    >
                      Enrollment
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={visibleColumns.actions}
                      onCheckedChange={() => toggleColumn('actions')}
                    >
                      Actions
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" onClick={exportClassList}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Export Class List
                </Button>
              </div>

              {/* List View */}
              <TabsContent value="list">
                <Card>
                  <CardHeader>
                    <CardTitle>Class List</CardTitle>
                    <CardDescription>
                      {filteredClasses.length} of {classData.length} classes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {visibleColumns.className && <TableHead>Class Name</TableHead>}
                            {visibleColumns.category && <TableHead>Category</TableHead>}
                            {visibleColumns.instructor && <TableHead>Instructor</TableHead>}
                            {visibleColumns.gradeLevel && <TableHead>Grade Level</TableHead>}
                            {visibleColumns.status && <TableHead>Status</TableHead>}
                            {visibleColumns.enrollment && <TableHead>Enrollment</TableHead>}
                            {visibleColumns.actions && <TableHead>Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredClasses.length > 0 ? (
                            filteredClasses.map((cls: any) => (
                              <TableRow key={cls.id}>
                                {visibleColumns.className && <TableCell className="font-medium">{cls.title}</TableCell>}
                                {visibleColumns.category && <TableCell>{cls.category}</TableCell>}
                                {visibleColumns.instructor && (
                                  <TableCell>
                                    {cls.instructorName && cls.instructorName !== "no-instructor" 
                                      ? cls.instructorName 
                                      : "No Instructor Assigned"}
                                  </TableCell>
                                )}
                                {visibleColumns.gradeLevel && <TableCell>{cls.gradeLevel}</TableCell>}
                                {visibleColumns.status && (
                                  <TableCell>
                                    <Badge variant="secondary">{cls.status}</Badge>
                                  </TableCell>
                                )}
                                {visibleColumns.enrollment && <TableCell>{cls.enrollmentCount || 0}/{cls.capacity || cls.maxEnrollment || 0}</TableCell>}
                                {visibleColumns.actions && <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" className="h-8 w-8 p-0">
                                        <span className="sr-only">Open menu</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-more-horizontal h-4 w-4"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem>
                                        <Link href={`/schools/classes/${cls.id}`}>View Details</Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Link href={`/schools/classes/${cls.id}/edit`}>Edit Class</Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Link href={`/schools/classes/${cls.id}/roster`}>View Roster</Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Link href={`/schools/classes/${cls.id}/schedule`}>Manage Schedule</Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDuplicateClass(cls)}
                                        className="text-blue-600"
                                      >
                                        Duplicate Class
                                      </DropdownMenuItem>
                                      {cls.instructorName && cls.instructorName !== "no-instructor" && cls.instructorName !== "No Instructor Assigned" && (
                                        <DropdownMenuItem 
                                          onClick={() => handleUnassignInstructor(cls.id, cls.title)}
                                          className="text-orange-600"
                                        >
                                          Unassign Instructor
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem 
                                        onClick={() => handleDeleteClass(cls.id, cls.title)}
                                        className="text-red-600"
                                      >
                                        Delete Class
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>}
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell 
                                colSpan={Object.values(visibleColumns).filter(Boolean).length} 
                                className="text-center py-6 text-muted-foreground"
                              >
                                No classes found. Try adjusting your search or filters.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Grid View */}
              <TabsContent value="grid">
                <Card>
                  <CardHeader>
                    <CardTitle>Classes Grid</CardTitle>
                    <CardDescription>
                      {filteredClasses.length} of {classData.length} classes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredClasses.length > 0 ? (
                        filteredClasses.map((cls: any) => (
                          <Card key={cls.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                              <div className="flex justify-between items-start">
                                <CardTitle className="text-lg">{cls.title}</CardTitle>
                                <Badge variant="secondary">{cls.status}</Badge>
                              </div>
                              <CardDescription>{cls.category} • {cls.gradeLevel}</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="space-y-2">
                                <div className="flex items-center">
                                  <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                                  <span className="text-sm">{cls.instructor}</span>
                                </div>
                                <div className="flex items-center">
                                  <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                                  <span className="text-sm">{cls.schedule}</span>
                                </div>
                                <div className="flex items-center">
                                  <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                                  <span className="text-sm">{cls.startDate} to {cls.endDate}</span>
                                </div>
                              </div>
                            </CardContent>
                            <CardFooter className="pt-2">
                              <div className="w-full flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">
                                  Enrolled: {cls.enrollmentCount || 0}/{cls.capacity || cls.maxEnrollment || 0}
                                </span>
                                <Button size="sm" variant="outline">
                                  <Link href={`/schools/classes/${cls.id}`}>View Details</Link>
                                </Button>
                              </div>
                            </CardFooter>
                          </Card>
                        ))
                      ) : (
                        <div className="col-span-full flex items-center justify-center p-6 text-muted-foreground">
                          No classes found. Try adjusting your search or filters.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Calendar View */}
              <TabsContent value="calendar">
                <Card>
                  <CardHeader>
                    <CardTitle>Class Calendar</CardTitle>
                    <CardDescription>
                      View classes in calendar format
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12 text-muted-foreground">
                      <Calendar className="w-12 h-12 mx-auto mb-4" />
                      <p>Calendar view coming soon</p>
                      <p className="text-sm">This will show your classes in a monthly calendar layout</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppShell>
  );
}