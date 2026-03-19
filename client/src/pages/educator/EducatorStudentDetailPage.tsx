import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  User,
  Calendar,
  GraduationCap,
  Mail,
  BookOpen,
  Cake,
  ClipboardList,
  CheckSquare,
  Printer,
  History
} from "lucide-react";
import { format } from "date-fns";
import { displayScoreWithMax } from "@/lib/assessmentUtils";
import ProgressReport from "@/components/student/ProgressReport";

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  parentEmail: string;
  birthdate?: string;
  classId: number;
  className: string;
  enrollmentDate: string;
  enrollmentStatus: string;
}

function calculateAge(birthdate: string): number {
  const today = new Date();
  const bday = new Date(birthdate);
  let age = today.getFullYear() - bday.getFullYear();
  if (today < new Date(today.getFullYear(), bday.getMonth(), bday.getDate())) {
    age--;
  }
  return age;
}

function formatBirthday(birthdate: string): string {
  return new Date(birthdate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

interface StudentAssessmentRow {
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
  notes?: string | null;
  assessmentDate: string;
}

interface StudentAttendanceRow {
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

export default function EducatorStudentDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const studentId = parseInt(params.id || '0');

  const { data: studentsResponse, isLoading } = useQuery<{ students: Student[] }>({
    queryKey: ["/api/educator/my-students"],
  });

  const student = studentsResponse?.students?.find(s => s.id === studentId);

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<StudentAssessmentRow[]>({
    queryKey: ['/api/assessments/students/child', studentId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/assessments/students/child/${studentId}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!studentId,
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery<StudentAttendanceRow[]>({
    queryKey: ['/api/educator/children', studentId, 'attendance'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/educator/children/${studentId}/attendance`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!studentId,
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
    queryKey: ['/api/enrollments', 'child', studentId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/enrollments?childId=${studentId}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!studentId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
        <User className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Student Not Found</h2>
        <p className="text-muted-foreground">This student may not be in one of your classes.</p>
        <Button onClick={() => navigate("/educator/students")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to My Students
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/educator/students")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to My Students
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-student-name">
              {student.firstName} {student.lastName}
            </h1>
            <p className="text-muted-foreground">Student Profile</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          data-testid="button-print-report"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print Report
        </Button>
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
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Student Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Grade Level
                  </span>
                  <Badge variant="outline" data-testid="badge-grade-level">
                    {student.gradeLevel || 'N/A'}
                  </Badge>
                </div>

                {student.birthdate && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Cake className="h-4 w-4" />
                        Birthday
                      </span>
                      <span data-testid="text-birthday">{formatBirthday(student.birthdate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Age</span>
                      <span data-testid="text-age">{calculateAge(student.birthdate)} years old</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Class Enrollment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Class</span>
                  <span className="font-medium" data-testid="text-class-name">{student.className}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Enrollment Date
                  </span>
                  <span data-testid="text-enrollment-date">
                    {student.enrollmentDate
                      ? new Date(student.enrollmentDate).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={student.enrollmentStatus === 'enrolled' ? 'default' : 'secondary'}
                    data-testid="badge-status"
                  >
                    {student.enrollmentStatus || 'enrolled'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Parent Contact
                </CardTitle>
                <CardDescription>
                  Contact information for the student's parent or guardian
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`mailto:${student.parentEmail}`}
                    className="text-blue-600 hover:underline"
                    data-testid="link-parent-email"
                  >
                    {student.parentEmail}
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assessments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Assessment History
              </CardTitle>
              <CardDescription>
                All recorded assessments for {student.firstName}
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
                          <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
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
                All attendance records for {student.firstName}
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
          className={student.className}
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
  );
}
