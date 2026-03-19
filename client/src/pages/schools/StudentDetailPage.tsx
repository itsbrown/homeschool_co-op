import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, User, Mail, Phone, MapPin, Calendar, AlertTriangle,
  Heart, GraduationCap, Edit, ClipboardList, CheckSquare, Printer, History
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { format } from "date-fns";
import { displayScoreWithMax } from "@/lib/assessmentUtils";
import ProgressReport from "@/components/student/ProgressReport";

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
  parentId: number;
  specialNeeds: string;
  allergies: string;
  interests: string[] | null;
  medicalNotes: string;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
    email: string;
  };
  parentEmail: string;
  parentPhone: string;
  address: string;
  enrollmentDate: string;
  status: string;
}

interface AssessmentRecord {
  id: number;
  assessmentTypeId: number;
  assessmentType: {
    id: number;
    name: string;
    category: string;
    scoreFormat: string;
    maxScore: number | null;
    levelOptions: string[] | null;
  } | null;
  curriculumBook: { id: number; name: string } | null;
  score: string;
  lesson?: number | null;
  lexileScore?: number | null;
  source?: string | null;
  notes?: string | null;
  assessmentDate: string;
}

interface AttendanceRecord {
  id: number;
  status: string;
  sessionDate: string;
  className?: string | null;
  tardyMinutes?: number | null;
  earlyDepartureMinutes?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  notes?: string | null;
}

const ATTENDANCE_BADGES: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  absent: 'bg-red-100 text-red-800',
  late: 'bg-yellow-100 text-yellow-800',
  excused: 'bg-blue-100 text-blue-800',
  early_departure: 'bg-orange-100 text-orange-800',
};

export default function StudentDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: student, isLoading, error } = useQuery<Student>({
    queryKey: [`/api/school-admin/students/${id}`],
    enabled: !!id,
  });

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<AssessmentRecord[]>({
    queryKey: ['/api/assessments/students/child', id],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/assessments/students/child/${id}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ['/api/school-admin/attendance/records', id],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/school-admin/attendance/records?childId=${id}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  interface EnrollmentHistoryRecord {
    id: number;
    classId: number;
    className?: string;
    status: string;
    enrollmentDate?: string;
    startDate?: string;
    endDate?: string;
  }

  const { data: enrollmentHistory = [] } = useQuery<EnrollmentHistoryRecord[]>({
    queryKey: ['/api/enrollments', 'child', id],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/enrollments?childId=${id}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Loading Student...">
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !student) {
    return (
      <SchoolAdminLayout pageTitle="Student Not Found">
        <div className="container mx-auto p-4 text-center">
          <h1 className="text-2xl font-bold mb-4">Student Not Found</h1>
          <p className="text-muted-foreground mb-4">The requested student could not be found.</p>
          <Button onClick={() => setLocation("/schools/students")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Students
          </Button>
        </div>
      </SchoolAdminLayout>
    );
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "Not specified";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateAge = (birthdate: string) => {
    if (!birthdate) return "Unknown";
    const today = new Date();
    const birth = new Date(birthdate);
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      return age - 1;
    }
    return age;
  };

  return (
    <SchoolAdminLayout pageTitle={`${student.firstName} ${student.lastName}`}>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/schools/students")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Students
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{student.firstName} {student.lastName}</h1>
              <p className="text-muted-foreground">Student Details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => window.print()}
              data-testid="button-print-report"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print Report
            </Button>
            <Button onClick={() => setLocation(`/schools/students/${id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Student
            </Button>
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info" data-testid="tab-info">
              <User className="h-4 w-4 mr-1" />
              Info
            </TabsTrigger>
            <TabsTrigger value="assessments" data-testid="tab-assessments">
              <ClipboardList className="h-4 w-4 mr-1" />
              Assessments
              {assessments.length > 0 && (
                <Badge variant="secondary" className="ml-1">{assessments.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="attendance" data-testid="tab-attendance">
              <CheckSquare className="h-4 w-4 mr-1" />
              Attendance
              {attendance.length > 0 && (
                <Badge variant="secondary" className="ml-1">{attendance.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="enrollments" data-testid="tab-enrollments">
              <History className="h-4 w-4 mr-1" />
              Enrollment History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">First Name</label>
                      <p className="font-medium">{student.firstName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Last Name</label>
                      <p className="font-medium">{student.lastName}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Birthdate</label>
                      <p className="font-medium">{formatDate(student.birthdate)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Age</label>
                      <p className="font-medium">{calculateAge(student.birthdate)} years old</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Grade Level</label>
                      <Badge variant="secondary">{student.gradeLevel}</Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Status</label>
                      <Badge variant={student.status === 'Active' ? 'default' : 'secondary'}>
                        {student.status || 'Active'}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Enrollment Date</label>
                    <p className="font-medium">{formatDate(student.enrollmentDate)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Parent Email</label>
                    <p className="font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {student.parentEmail || "Not provided"}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Parent Phone</label>
                    <p className="font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {student.parentPhone || "Not provided"}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Address</label>
                    <p className="font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {student.address || "Not provided"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Emergency Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {student.emergencyContact ? (
                    <>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Name</label>
                        <p className="font-medium">{student.emergencyContact.name}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Relationship</label>
                        <p className="font-medium">{student.emergencyContact.relationship}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Phone</label>
                          <p className="font-medium flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {student.emergencyContact.phone}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Email</label>
                          <p className="font-medium flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {student.emergencyContact.email}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No emergency contact information available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    Health & Special Needs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Special Needs</label>
                    <p className="font-medium">{student.specialNeeds || "None specified"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Allergies</label>
                    <p className="font-medium">{student.allergies || "None specified"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Medical Notes</label>
                    <p className="font-medium">{student.medicalNotes || "None specified"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {student.interests && student.interests.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Interests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {student.interests.map((interest, index) => (
                      <Badge key={index} variant="outline">{interest}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="assessments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Assessment History
                </CardTitle>
                <CardDescription>
                  All recorded assessments for {student.firstName} {student.lastName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assessmentsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-3/4" />
                  </div>
                ) : assessments.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No assessments recorded yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Book / Lesson</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Lexile</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assessments.map((a) => (
                          <TableRow key={a.id} data-testid={`assessment-row-${a.id}`}>
                            <TableCell className="whitespace-nowrap">
                              {a.assessmentDate
                                ? format(new Date(a.assessmentDate), 'MMM d, yyyy')
                                : '—'}
                            </TableCell>
                            <TableCell>{a.assessmentType?.name || `Type #${a.assessmentTypeId}`}</TableCell>
                            <TableCell>
                              {a.curriculumBook?.name
                                ? `${a.curriculumBook.name}${a.lesson ? `, Lesson ${a.lesson}` : ''}`
                                : a.lesson ? `Lesson ${a.lesson}` : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                {displayScoreWithMax(
                                  a.score,
                                  a.assessmentType?.scoreFormat || 'numeric',
                                  a.assessmentType?.levelOptions,
                                  a.assessmentType?.maxScore
                                )}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {a.lexileScore != null ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                                  {a.lexileScore}L
                                </Badge>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {a.source === 'in_app' ? 'In-App' : 'Manual'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                              {a.notes || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Attendance History
                </CardTitle>
                <CardDescription>
                  All attendance records for {student.firstName} {student.lastName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attendanceLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-3/4" />
                  </div>
                ) : attendance.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No attendance records found.</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-5 gap-2 mb-4">
                      {(['present', 'absent', 'late', 'excused', 'early_departure'] as const).map(status => {
                        const count = attendance.filter(r => r.status === status).length;
                        const colors: Record<string, string> = {
                          present: 'text-green-700 bg-green-50 border-green-200',
                          absent: 'text-red-700 bg-red-50 border-red-200',
                          late: 'text-yellow-700 bg-yellow-50 border-yellow-200',
                          excused: 'text-blue-700 bg-blue-50 border-blue-200',
                          early_departure: 'text-orange-700 bg-orange-50 border-orange-200',
                        };
                        return (
                          <div key={status} className={`border rounded p-2 text-center ${colors[status]}`}>
                            <div className="text-xl font-bold">{count}</div>
                            <div className="text-xs capitalize">{status.replace('_', ' ')}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Minutes</TableHead>
                            <TableHead>Check-In</TableHead>
                            <TableHead>Check-Out</TableHead>
                            <TableHead>Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {attendance.map((record) => {
                            let minutesNote = '';
                            if (record.status === 'late' && record.tardyMinutes) {
                              minutesNote = `${record.tardyMinutes} min late`;
                            } else if (record.status === 'early_departure' && record.earlyDepartureMinutes) {
                              minutesNote = `Left ${record.earlyDepartureMinutes} min early`;
                            }
                            return (
                            <TableRow key={record.id} data-testid={`attendance-row-${record.id}`}>
                              <TableCell className="whitespace-nowrap">
                                {record.sessionDate
                                  ? format(new Date(record.sessionDate), 'MMM d, yyyy')
                                  : '—'}
                              </TableCell>
                              <TableCell>{record.className || '—'}</TableCell>
                              <TableCell>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    ATTENDANCE_BADGES[record.status] || 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {(record.status || '').replace(/_/g, ' ')}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {minutesNote || '—'}
                              </TableCell>
                              <TableCell>{record.checkInTime || '—'}</TableCell>
                              <TableCell>{record.checkOutTime || '—'}</TableCell>
                              <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                                {record.notes || '—'}
                              </TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enrollments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Enrollment History
                </CardTitle>
                <CardDescription>
                  All class enrollments for {student.firstName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enrollmentHistory.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No enrollment history found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Class</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrollmentHistory.map((enrollment) => (
                          <TableRow key={enrollment.id}>
                            <TableCell className="font-medium">
                              {enrollment.className || `Class #${enrollment.classId}`}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  enrollment.status === 'enrolled' ? 'bg-green-100 text-green-800' :
                                  enrollment.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                  enrollment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }
                              >
                                {enrollment.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {enrollment.startDate
                                ? format(new Date(enrollment.startDate), 'MMM d, yyyy')
                                : enrollment.enrollmentDate
                                ? format(new Date(enrollment.enrollmentDate), 'MMM d, yyyy')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {enrollment.endDate
                                ? format(new Date(enrollment.endDate), 'MMM d, yyyy')
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Printable Progress Report — hidden on screen, visible when printing */}
        <div className="hidden print:block">
          <ProgressReport
            studentName={`${student.firstName} ${student.lastName}`}
            gradeLevel={student.gradeLevel}
            assessments={assessments.map(a => ({
              id: a.id,
              assessmentTypeName: a.assessmentType?.name ?? '',
              assessmentTypeCategory: a.assessmentType?.category ?? '',
              score: a.score,
              scoreFormat: a.assessmentType?.scoreFormat ?? null,
              maxScore: a.assessmentType?.maxScore ?? null,
              levelOptions: a.assessmentType?.levelOptions ?? null,
              assessmentDate: a.assessmentDate,
              lexileScore: a.lexileScore,
              curriculumBookName: a.curriculumBook?.name ?? null,
              notes: a.notes,
            }))}
            attendance={attendance}
          />
        </div>
      </div>
    </SchoolAdminLayout>
  );
}
