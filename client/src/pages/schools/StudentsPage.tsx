import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PlusCircle, Search, GraduationCap, BookOpen, CalendarDays, FileUp } from "lucide-react";
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

// Sample student data (will be replaced with API data)
const sampleStudents = [
  {
    id: 1,
    name: "Emma Thompson",
    gradeLevel: "9",
    age: 15,
    parentName: "James and Sarah Thompson",
    email: "thompson.family@example.com",
    enrollmentDate: "2023-08-10",
    status: "Active",
    classes: ["Introduction to American History", "Advanced Mathematics", "Biology and Ecosystems"],
    avatar: "",
  },
  {
    id: 2,
    name: "Michael Rodriguez",
    gradeLevel: "10",
    age: 16,
    parentName: "Carlos and Maria Rodriguez",
    email: "rodriguez.family@example.com",
    enrollmentDate: "2022-08-15",
    status: "Active",
    classes: ["Advanced Mathematics", "Biology and Ecosystems", "Beginner Spanish"],
    avatar: "",
  },
  {
    id: 3,
    name: "Sophia Chen",
    gradeLevel: "7",
    age: 13,
    parentName: "David and Lin Chen",
    email: "chen.family@example.com",
    enrollmentDate: "2023-08-20",
    status: "Active",
    classes: ["Creative Writing Workshop", "Beginner Spanish"],
    avatar: "",
  },
  {
    id: 4,
    name: "Ethan Williams",
    gradeLevel: "12",
    age: 18,
    parentName: "Robert and Jennifer Williams",
    email: "williams.family@example.com",
    enrollmentDate: "2020-08-12",
    status: "Active",
    classes: ["Advanced Mathematics", "Physics for College"],
    avatar: "",
  },
  {
    id: 5,
    name: "Olivia Johnson",
    gradeLevel: "8",
    age: 14,
    parentName: "Daniel and Emily Johnson",
    email: "johnson.family@example.com",
    enrollmentDate: "2023-02-01",
    status: "Transfer",
    classes: ["Creative Writing Workshop", "Beginner Spanish", "Pre-Algebra"],
    avatar: "",
  },
  {
    id: 6,
    name: "Jacob Davis",
    gradeLevel: "11",
    age: 17,
    parentName: "Michael and Rebecca Davis",
    email: "davis.family@example.com",
    enrollmentDate: "2021-08-15",
    status: "Active",
    classes: ["Introduction to American History", "Advanced Mathematics", "Physics for College"],
    avatar: "",
  },
];

// Status colors
const STATUS_COLORS = {
  "Active": "green",
  "Inactive": "red",
  "Transfer": "blue",
  "Graduated": "purple",
  "On Leave": "yellow",
};

export default function StudentsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("list");

  // Fetch students for the school (using sample data for now)
  const { data: students, isLoading, error } = useQuery({
    queryKey: ['/api/schools/students'],
    queryFn: () => Promise.resolve(sampleStudents),
  });

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
      <SchoolAdminLayout pageTitle="Students - Error">
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

  // Filter students based on search query and filters
  const filteredStudents = students ? students.filter(student => {
    const matchesSearch = searchQuery === "" || 
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.parentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGradeLevel = gradeLevelFilter === "" || student.gradeLevel === gradeLevelFilter;
    const matchesStatus = statusFilter === "" || student.status === statusFilter;
    
    return matchesSearch && matchesGradeLevel && matchesStatus;
  }) : [];

  // Get unique grade levels and statuses for filters
  const gradeLevels = students ? Array.from(new Set(students.map(student => student.gradeLevel))) : [];
  const statuses = students ? Array.from(new Set(students.map(student => student.status))) : [];

  // Sort grade levels numerically
  gradeLevels.sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <SchoolAdminLayout pageTitle="Students">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold">Students</h1>
              <p className="text-muted-foreground">Manage your school's student roster</p>
            </div>
            <div className="flex gap-2">
              <Link href="/schools/students/import">
                <Button variant="outline" className="flex items-center gap-2">
                  <FileUp className="h-4 w-4" />
                  Import
                </Button>
              </Link>
              <Link href="/schools/students/register">
                <Button className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Register Student
                </Button>
              </Link>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="list">List View</TabsTrigger>
              <TabsTrigger value="grid">Grid View</TabsTrigger>
              <TabsTrigger value="grades">By Grade</TabsTrigger>
            </TabsList>

            <Card>
              <CardHeader>
                <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, parent, or email..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Select value={gradeLevelFilter} onValueChange={setGradeLevelFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Grade Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-grades">All Grades</SelectItem>
                        {gradeLevels.map((grade) => (
                          <SelectItem key={grade} value={grade}>Grade {grade}</SelectItem>
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
                          <TableHead>Student</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Parent/Guardian</TableHead>
                          <TableHead>Classes</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((student) => (
                            <TableRow key={student.id}>
                              <TableCell>
                                <div className="flex items-center space-x-3">
                                  <Avatar>
                                    <AvatarImage src={student.avatar} />
                                    <AvatarFallback>{student.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="font-medium">{student.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {student.email}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center">
                                  <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground" />
                                  <span>Grade {student.gradeLevel}</span>
                                </div>
                              </TableCell>
                              <TableCell>{student.parentName}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {student.classes.length > 2 ? (
                                    <>
                                      <Badge variant="outline">{student.classes[0]}</Badge>
                                      <Badge variant="outline" className="whitespace-nowrap">+{student.classes.length - 1} more</Badge>
                                    </>
                                  ) : (
                                    student.classes.map((cls, index) => (
                                      <Badge key={index} variant="outline">{cls}</Badge>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline" 
                                  className={student.status === "Active" ? "bg-green-100 text-green-800 border-green-200" :
                                    student.status === "Inactive" ? "bg-red-100 text-red-800 border-red-200" :
                                    student.status === "Transfer" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                    student.status === "Graduated" ? "bg-purple-100 text-purple-800 border-purple-200" :
                                    "bg-yellow-100 text-yellow-800 border-yellow-200"}
                                >
                                  {student.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">Actions</Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem>
                                      <Link href={`/schools/students/${student.id}`}>View Profile</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Link href={`/schools/students/${student.id}/edit`}>Edit Details</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Link href={`/schools/students/${student.id}/schedule`}>View Schedule</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Link href={`/schools/students/${student.id}/progress`}>Academic Progress</Link>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                              No students found. Try adjusting your search or filters.
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
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => (
                        <Card key={student.id}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <Badge 
                                variant="outline" 
                                className={student.status === "Active" ? "bg-green-100 text-green-800 border-green-200" :
                                  student.status === "Inactive" ? "bg-red-100 text-red-800 border-red-200" :
                                  student.status === "Transfer" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                  student.status === "Graduated" ? "bg-purple-100 text-purple-800 border-purple-200" :
                                  "bg-yellow-100 text-yellow-800 border-yellow-200"}
                              >
                                {student.status}
                              </Badge>
                              <Badge variant="outline">Grade {student.gradeLevel}</Badge>
                            </div>
                            <div className="flex flex-col items-center mt-2">
                              <Avatar className="w-16 h-16 mb-3">
                                <AvatarImage src={student.avatar} />
                                <AvatarFallback>{student.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                              </Avatar>
                              <CardTitle className="text-center">{student.name}</CardTitle>
                              <CardDescription className="text-center">{student.email}</CardDescription>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center">
                              <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                              <div className="text-sm">
                                <span className="font-medium">{student.classes.length}</span> classes enrolled
                              </div>
                            </div>
                            <div className="flex items-center">
                              <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                              <div className="text-sm">Enrolled {new Date(student.enrollmentDate).toLocaleDateString()}</div>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">Parents:</span> {student.parentName}
                            </div>
                          </CardContent>
                          <CardFooter className="flex justify-center gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/schools/students/${student.id}`}>View Profile</Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/schools/students/${student.id}/edit`}>Edit</Link>
                            </Button>
                          </CardFooter>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-12 text-muted-foreground">
                        <p>No students found. Try adjusting your search or filters.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="grades">
                <CardContent>
                  {gradeLevels.length > 0 && (
                    <div className="space-y-6">
                      {gradeLevelFilter === "" ? (
                        gradeLevels.map(grade => {
                          const gradeStudents = students ? students.filter(s => s.gradeLevel === grade) : [];
                          return (
                            <div key={grade} className="space-y-2">
                              <h3 className="text-lg font-medium flex items-center">
                                <GraduationCap className="mr-2 h-5 w-5" />
                                Grade {grade} <span className="text-muted-foreground ml-2">({gradeStudents.length} students)</span>
                              </h3>
                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Student</TableHead>
                                      <TableHead>Parent/Guardian</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {gradeStudents.map(student => (
                                      <TableRow key={student.id}>
                                        <TableCell>
                                          <div className="flex items-center space-x-3">
                                            <Avatar>
                                              <AvatarImage src={student.avatar} />
                                              <AvatarFallback>{student.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                              <div className="font-medium">{student.name}</div>
                                              <div className="text-sm text-muted-foreground">
                                                {student.email}
                                              </div>
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>{student.parentName}</TableCell>
                                        <TableCell>
                                          <Badge 
                                            variant="outline" 
                                            className={student.status === "Active" ? "bg-green-100 text-green-800 border-green-200" :
                                              student.status === "Inactive" ? "bg-red-100 text-red-800 border-red-200" :
                                              student.status === "Transfer" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                              student.status === "Graduated" ? "bg-purple-100 text-purple-800 border-purple-200" :
                                              "bg-yellow-100 text-yellow-800 border-yellow-200"}
                                          >
                                            {student.status}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Button variant="outline" size="sm" asChild>
                                            <Link href={`/schools/students/${student.id}`}>View</Link>
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="space-y-2">
                          <h3 className="text-lg font-medium flex items-center">
                            <GraduationCap className="mr-2 h-5 w-5" />
                            Grade {gradeLevelFilter} <span className="text-muted-foreground ml-2">({filteredStudents.length} students)</span>
                          </h3>
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Student</TableHead>
                                  <TableHead>Parent/Guardian</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredStudents.map(student => (
                                  <TableRow key={student.id}>
                                    <TableCell>
                                      <div className="flex items-center space-x-3">
                                        <Avatar>
                                          <AvatarImage src={student.avatar} />
                                          <AvatarFallback>{student.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <div className="font-medium">{student.name}</div>
                                          <div className="text-sm text-muted-foreground">
                                            {student.email}
                                          </div>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>{student.parentName}</TableCell>
                                    <TableCell>
                                      <Badge 
                                        variant="outline" 
                                        className={student.status === "Active" ? "bg-green-100 text-green-800 border-green-200" :
                                          student.status === "Inactive" ? "bg-red-100 text-red-800 border-red-200" :
                                          student.status === "Transfer" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                          student.status === "Graduated" ? "bg-purple-100 text-purple-800 border-purple-200" :
                                          "bg-yellow-100 text-yellow-800 border-yellow-200"}
                                      >
                                        {student.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Button variant="outline" size="sm" asChild>
                                        <Link href={`/schools/students/${student.id}`}>View</Link>
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </TabsContent>

              <CardFooter className="flex justify-between items-center border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredStudents.length} of {students.length} students
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={() => {
                    setSearchQuery("");
                    setGradeLevelFilter("");
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
    </SchoolAdminLayout>
  );
}