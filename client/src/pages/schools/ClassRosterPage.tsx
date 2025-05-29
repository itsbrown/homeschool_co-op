import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, UserPlus, Mail, Phone, Calendar, GraduationCap } from "lucide-react";
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
  gradeLevel: string;
  enrollmentDate: string;
  status: string;
}

export default function ClassRosterPage() {
  const { id: classId } = useParams();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch class details
  const { data: classData, isLoading: classLoading } = useQuery({
    queryKey: ["/api/class-details", classId],
  });

  // Fetch class roster (students enrolled in this class)
  const { data: rosterData, isLoading: rosterLoading } = useQuery({
    queryKey: ["/api/school-admin/classes", classId, "roster"],
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

  // Sample roster data for now (replace with actual API data)
  const students: Student[] = rosterData?.students || [
    {
      id: 1,
      firstName: "Emma",
      lastName: "Johnson",
      email: "emma.johnson@email.com",
      phone: "(555) 123-4567",
      gradeLevel: "3rd Grade",
      enrollmentDate: "2025-01-15",
      status: "Active"
    },
    {
      id: 2,
      firstName: "Liam",
      lastName: "Smith",
      email: "liam.smith@email.com",
      phone: "(555) 234-5678",
      gradeLevel: "4th Grade",
      enrollmentDate: "2025-01-20",
      status: "Active"
    },
    {
      id: 3,
      firstName: "Sophia",
      lastName: "Brown",
      email: "sophia.brown@email.com",
      phone: "(555) 345-6789",
      gradeLevel: "3rd Grade",
      enrollmentDate: "2025-02-01",
      status: "Active"
    }
  ];

  // Filter students based on search query
  const filteredStudents = students.filter(student => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || 
           student.email?.toLowerCase().includes(query) ||
           student.gradeLevel.toLowerCase().includes(query);
  });

  const classTitle = classData?.title || "Class";

  return (
    <SchoolAdminLayout pageTitle={`${classTitle} - Roster`}>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold">{classTitle} - Roster</h1>
              <p className="text-muted-foreground">
                Manage students enrolled in this class
              </p>
            </div>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Student to Class
            </Button>
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
                      <strong>Schedule:</strong> {classData.schedule}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">
                      <strong>Instructor:</strong> {classData.instructorName}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">
                      <strong>Capacity:</strong> {students.length}/{classData.capacity || 'Unlimited'}
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
                  <CardTitle>Student Roster ({students.length} students)</CardTitle>
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
                            <div className="space-y-1">
                              {student.email && (
                                <div className="flex items-center space-x-1 text-sm">
                                  <Mail className="h-3 w-3" />
                                  <span>{student.email}</span>
                                </div>
                              )}
                              {student.phone && (
                                <div className="flex items-center space-x-1 text-sm">
                                  <Phone className="h-3 w-3" />
                                  <span>{student.phone}</span>
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
                            <Button variant="outline" size="sm">
                              View Profile
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
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