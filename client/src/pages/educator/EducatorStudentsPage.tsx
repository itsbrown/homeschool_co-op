import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/SupabaseProvider";
import { Link } from "wouter";
import { 
  Users, 
  Search, 
  Filter, 
  Mail, 
  Phone,
  Eye,
  GraduationCap,
  BookOpen
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

export default function EducatorStudentsPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterGrade, setFilterGrade] = useState<string>("all");

  // Get educator's assigned classes using the working legacy endpoint (same as Dashboard)
  const { data: classesData, isLoading: classesLoading } = useQuery<any[]>({
    queryKey: ["/api/educator/classes"],
  });

  // Get students directly using the working legacy endpoint (same as Dashboard)
  const { data: studentsResponse, isLoading: studentsLoading } = useQuery<{ students: any[] }>({
    queryKey: ["/api/educator/students"],
  });

  // Transform students data to include class info
  const studentsData = {
    students: (studentsResponse?.students ?? []).map((student: any) => ({
      ...student,
      classId: student.classId,
      className: student.className
    })),
    totalStudents: studentsResponse?.students?.length || 0,
    uniqueStudentCount: new Set((studentsResponse?.students ?? []).map((s: any) => s.id)).size
  };

  const isLoading = classesLoading || studentsLoading;

  // Filter students based on search and filters
  const filteredStudents = studentsData?.students?.filter((student: any) => {
    const matchesSearch = 
      `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.parentEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesClass = filterClass === "all" || student.classId?.toString() === filterClass;
    const matchesGrade = filterGrade === "all" || student.gradeLevel === filterGrade;
    
    return matchesSearch && matchesClass && matchesGrade;
  }) || [];

  // Get unique grade levels for filter (guard against undefined)
  const gradeLevels = [...new Set((studentsData?.students ?? []).map((s: any) => s.gradeLevel).filter(Boolean))] as string[];

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="space-y-4">
          {Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Students</h1>
          <p className="text-gray-600 mt-1">Students enrolled in your classes</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{studentsData?.totalStudents || 0}</div>
            <p className="text-xs text-muted-foreground">All classes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classesData?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Teaching</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Grade Levels</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gradeLevels.length}</div>
            <p className="text-xs text-muted-foreground">Different grades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parent Contacts</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {studentsData?.students ? [...new Set(studentsData.students.map((s: any) => s.parentEmail).filter(Boolean))].length : 0}
            </div>
            <p className="text-xs text-muted-foreground">Unique parents</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search students by name or parent email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Class Filter */}
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {(classesData ?? []).map((classItem: any) => (
                  <SelectItem key={classItem.id} value={classItem.id?.toString() || ''}>
                    {classItem.title || 'Unnamed Class'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Grade Filter */}
            <Select value={filterGrade} onValueChange={setFilterGrade}>
              <SelectTrigger className="w-full sm:w-48">
                <GraduationCap className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grades</SelectItem>
                {gradeLevels.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Students ({filteredStudents.length})
          </CardTitle>
          <CardDescription>
            Showing {filteredStudents.length} of {studentsData?.totalStudents || 0} students
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredStudents.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Grade Level</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Parent Contact</TableHead>
                    <TableHead>Enrollment Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student: any) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="font-semibold">
                            {student.firstName} {student.lastName}
                          </div>
                          {student.dateOfBirth && (
                            <div className="text-sm text-muted-foreground">
                              Age: {Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {student.gradeLevel || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {student.className || 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            <a 
                              href={`mailto:${student.parentEmail}`}
                              className="text-blue-600 hover:underline"
                            >
                              {student.parentEmail}
                            </a>
                          </div>
                          {student.parentPhone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <a 
                                href={`tel:${student.parentPhone}`}
                                className="hover:underline"
                              >
                                {student.parentPhone}
                              </a>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {student.enrollmentDate ? formatDate(student.enrollmentDate) : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          student.status === 'enrolled' ? 'default' :
                          student.status === 'pending' ? 'secondary' : 'outline'
                        }>
                          {student.status || 'enrolled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Link href={`/educator/students/${student.id}`}>
                            <Button size="sm" variant="outline">
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex h-[300px] flex-col items-center justify-center rounded-md border border-dashed p-8">
              <Users className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">
                {searchTerm || filterClass !== "all" || filterGrade !== "all" 
                  ? "No students found" 
                  : "No Students Yet"
                }
              </h3>
              <p className="mb-4 mt-2 text-center text-sm text-muted-foreground">
                {searchTerm || filterClass !== "all" || filterGrade !== "all"
                  ? "Try adjusting your search or filters"
                  : "No students are enrolled in your classes yet."
                }
              </p>
              {searchTerm || filterClass !== "all" || filterGrade !== "all" ? (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchTerm("");
                    setFilterClass("all");
                    setFilterGrade("all");
                  }}
                >
                  Clear Filters
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}