import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PlusCircle, Search, Filter, FileDown, Calendar, Users, Clock } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

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
    startDate: "2023-09-06",
    endDate: "2023-12-16",
  },
  {
    id: 3,
    title: "Beginner Spanish",
    category: "Languages",
    subject: "Spanish",
    instructor: "Ms. Elena Rodriguez",
    gradeLevel: "6-8",
    status: "Active",
    enrollmentCount: 22,
    maxEnrollment: 24,
    schedule: "Mon, Wed, Fri 9:00-10:00 AM",
    startDate: "2023-09-05",
    endDate: "2023-12-15",
  },
  {
    id: 4,
    title: "Biology and Ecosystems",
    category: "Science",
    subject: "Biology",
    instructor: "Dr. Robert Williams",
    gradeLevel: "9-10",
    status: "Upcoming",
    enrollmentCount: 12,
    maxEnrollment: 24,
    schedule: "Tue, Thu 1:00-2:30 PM",
    startDate: "2024-01-08",
    endDate: "2024-05-20",
  },
  {
    id: 5,
    title: "Creative Writing Workshop",
    category: "English",
    subject: "Writing",
    instructor: "Ms. Amanda Taylor",
    gradeLevel: "7-9",
    status: "Draft",
    enrollmentCount: 0,
    maxEnrollment: 15,
    schedule: "Wed 3:00-4:30 PM",
    startDate: "2024-01-10",
    endDate: "2024-05-22",
  },
];

// Sample class states for filtering
const STATUS_COLORS = {
  "Active": "green",
  "Upcoming": "blue",
  "Completed": "gray",
  "Canceled": "red",
  "Draft": "yellow",
};

export default function SchoolClassesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("");
  const [activeTab, setActiveTab] = useState("list");

  // Fetch classes for the school (using sample data for now)
  const { data: classes, isLoading, error } = useQuery({
    queryKey: ['/api/schools/classes'],
    queryFn: () => Promise.resolve(sampleClasses),
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Classes">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading classes...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error) {
    return (
      <SchoolAdminLayout pageTitle="Classes - Error">
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
      </SchoolAdminLayout>
    );
  }

  // Filter classes based on search query and filters
  const filteredClasses = classes.filter(cls => {
    const matchesSearch = searchQuery === "" || 
      cls.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "" || cls.category === categoryFilter;
    const matchesStatus = statusFilter === "" || cls.status === statusFilter;
    const matchesGradeLevel = gradeLevelFilter === "" || cls.gradeLevel === gradeLevelFilter;
    
    return matchesSearch && matchesCategory && matchesStatus && matchesGradeLevel;
  });

  // Get unique categories, statuses, and grade levels for filters
  const categories = [...new Set(classes.map(cls => cls.category))];
  const statuses = [...new Set(classes.map(cls => cls.status))];
  const gradeLevels = [...new Set(classes.map(cls => cls.gradeLevel))];

  return (
    <SchoolAdminLayout pageTitle="Classes">
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

            <Card>
              <CardHeader>
                <div className="flex flex-col space-y-4 xl:flex-row xl:space-y-0 xl:space-x-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by class name or instructor..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All Categories</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
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

                    <Select value={gradeLevelFilter} onValueChange={setGradeLevelFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Grade Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All Grades</SelectItem>
                        {gradeLevels.map((grade) => (
                          <SelectItem key={grade} value={grade}>{grade}</SelectItem>
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
                          <TableHead>Class Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Instructor</TableHead>
                          <TableHead>Grade Level</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Enrollment</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredClasses.length > 0 ? (
                          filteredClasses.map((cls) => (
                            <TableRow key={cls.id}>
                              <TableCell className="font-medium">{cls.title}</TableCell>
                              <TableCell>{cls.category}</TableCell>
                              <TableCell>{cls.instructor}</TableCell>
                              <TableCell>{cls.gradeLevel}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline" 
                                  className={`bg-${STATUS_COLORS[cls.status]}-100 text-${STATUS_COLORS[cls.status]}-800 border-${STATUS_COLORS[cls.status]}-200`}
                                >
                                  {cls.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{cls.enrollmentCount}/{cls.maxEnrollment}</TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">Actions</Button>
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
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                              No classes found. Try adjusting your search or filters.
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
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map((cls) => (
                        <Card key={cls.id}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <Badge 
                                variant="outline" 
                                className={`bg-${STATUS_COLORS[cls.status]}-100 text-${STATUS_COLORS[cls.status]}-800 border-${STATUS_COLORS[cls.status]}-200`}
                              >
                                {cls.status}
                              </Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">...</Button>
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
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <CardTitle className="text-lg mt-2">{cls.title}</CardTitle>
                            <CardDescription>{cls.subject}</CardDescription>
                          </CardHeader>
                          <CardContent className="pb-2">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center">
                                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                                <span>Instructor: {cls.instructor}</span>
                              </div>
                              <div className="flex items-center">
                                <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                                <span>{cls.schedule}</span>
                              </div>
                              <div className="flex items-center">
                                <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                                <span>{cls.startDate} to {cls.endDate}</span>
                              </div>
                            </div>
                          </CardContent>
                          <CardFooter className="pt-2">
                            <div className="w-full flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Grades {cls.gradeLevel}</span>
                              <span className="text-sm font-medium">{cls.enrollmentCount}/{cls.maxEnrollment} enrolled</span>
                            </div>
                          </CardFooter>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-12 text-muted-foreground">
                        <p>No classes found. Try adjusting your search or filters.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="calendar">
                <CardContent className="py-12 text-center">
                  <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Calendar View Coming Soon</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mt-2">
                    The calendar view will allow you to see all your classes scheduled throughout the semester.
                    Check back soon for this feature.
                  </p>
                </CardContent>
              </TabsContent>

              <CardFooter className="flex justify-between items-center border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredClasses.length} of {classes.length} classes
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <FileDown className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-1" />
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