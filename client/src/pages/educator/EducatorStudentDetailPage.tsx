import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  User, 
  Calendar, 
  GraduationCap, 
  Mail, 
  BookOpen,
  Cake
} from "lucide-react";

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

export default function EducatorStudentDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const studentId = parseInt(params.id || '0');

  const { data: studentsResponse, isLoading } = useQuery<{ students: Student[] }>({
    queryKey: ["/api/educator/my-students"],
  });

  const student = studentsResponse?.students?.find(s => s.id === studentId);

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
    </div>
  );
}
