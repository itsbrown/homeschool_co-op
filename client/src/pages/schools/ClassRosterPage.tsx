import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, UserPlus, Mail, Phone, Calendar, GraduationCap, Download } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  gradeLevel: string;
  enrollmentDate: string;
  status: string;
}

interface ClassDetails {
  id: number;
  title: string;
  gradeLevel: string;
  schedule: string | { variants?: Array<{ days?: string[]; startTime?: string; endTime?: string; }> };
  instructorName: string;
  capacity: number;
  enrollmentCount: number;
}

interface RosterData {
  students: Student[];
  totalStudents: number;
}

export default function ClassRosterPage() {
  const { id: classId } = useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Fetch class details
  const { data: classData, isLoading: classLoading } = useQuery<ClassDetails>({
    queryKey: ["/api/school-admin/classes", classId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/school-admin/classes/${classId}`);
      return response.json();
    },
    enabled: !!classId,
  });

  // Fetch class roster (students enrolled in this class)
  const { data: rosterData, isLoading: rosterLoading, refetch: refetchRoster } = useQuery<RosterData>({
    queryKey: ["/api/school-admin/classes", classId, "roster"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/school-admin/classes/${classId}/roster`);
      return response.json();
    },
    enabled: !!classId,
  });

  const isLoading = classLoading || rosterLoading;

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Class Roster">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading roster...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  // Get students from roster data or use fallback
  const students: Student[] = rosterData?.students || [];

  // Filter students based on search query
  const filteredStudents = students.filter(student => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || 
           student.email?.toLowerCase().includes(query) ||
           student.gradeLevel.toLowerCase().includes(query);
  });

  const classTitle = classData?.title || "Class";
  const totalEnrolled = rosterData?.totalStudents || students.length;

  const exportToCSV = () => {
    if (!students.length) {
      toast({
        title: "No data to export",
        description: "There are no students enrolled in this class.",
        variant: "destructive"
      });
      return;
    }

    const headers = [
      "Student First Name",
      "Student Last Name",
      "Grade Level",
      "Parent/Guardian Name",
      "Parent Email",
      "Parent Phone",
      "Enrollment Date",
      "Status"
    ];

    const rows = filteredStudents.map(student => [
      student.firstName,
      student.lastName,
      student.gradeLevel,
      student.parentName || '',
      student.parentEmail || student.email || '',
      student.parentPhone || student.phone || '',
      new Date(student.enrollmentDate).toLocaleDateString(),
      student.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${classTitle.replace(/[^a-z0-9]/gi, '_')}_roster_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export successful",
      description: `Exported ${filteredStudents.length} students to CSV.`
    });
  };

  return (
    <SchoolAdminLayout pageTitle={`${classTitle} - Roster`}>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold">{classTitle}</h1>
              <p className="text-lg text-muted-foreground mb-1">
                Class Roster
              </p>
              <p className="text-sm text-muted-foreground">
                {totalEnrolled} {totalEnrolled === 1 ? 'student' : 'students'} enrolled
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportToCSV} disabled={!students.length}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button onClick={() => setLocation(`/schools/classes/${classId}/enrollments`)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Student to Class
              </Button>
            </div>
          </div>

          {/* Class Info Card */}
          {classData && (
            <Card>
              <CardHeader>
                <CardTitle>Class Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center space-x-2">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <strong>Grade Level:</strong> {classData.gradeLevel}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <strong>Schedule:</strong> {
                        typeof classData.schedule === 'string' 
                          ? classData.schedule 
                          : (classData.schedule?.variants?.[0]?.days?.join(', ') || 'Not set')
                      }
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">
                      <strong>Instructor:</strong> {classData.instructorName}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">
                      <strong>Capacity:</strong> {totalEnrolled}/{classData?.capacity || 'Unlimited'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Roster Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                <div>
                  <CardTitle>Student Roster ({totalEnrolled} students)</CardTitle>
                  <CardDescription>
                    Students currently enrolled in this class
                  </CardDescription>
                </div>
                <div className="w-full sm:w-72">
                  <Input
                    placeholder="Search students..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Grade Level</TableHead>
                      <TableHead>Parent/Guardian</TableHead>
                      <TableHead>Contact Info</TableHead>
                      <TableHead>Enrollment Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">
                            {student.firstName} {student.lastName}
                          </TableCell>
                          <TableCell>{student.gradeLevel}</TableCell>
                          <TableCell>
                            {student.parentName || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {(student.parentEmail || student.email) && (
                                <div className="flex items-center space-x-1 text-sm">
                                  <Mail className="h-3 w-3" />
                                  <span>{student.parentEmail || student.email}</span>
                                </div>
                              )}
                              {(student.parentPhone || student.phone) && (
                                <div className="flex items-center space-x-1 text-sm">
                                  <Phone className="h-3 w-3" />
                                  <span>{student.parentPhone || student.phone}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(student.enrollmentDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={
                                student.status === "Active" 
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : "bg-gray-100 text-gray-800 border-gray-200"
                              }
                            >
                              {student.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setLocation(`/schools/students/${student.id}`)}
                            >
                              View Profile
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                          {searchQuery ? "No students found matching your search." : "No students enrolled in this class yet."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}