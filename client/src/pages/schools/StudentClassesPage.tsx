import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Calendar, MapPin, User, GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";

export default function StudentClassesPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  // Fetch student data
  const { data: student, isLoading: studentLoading, error: studentError } = useQuery({
    queryKey: [`/api/schools/students/${id}`],
    queryFn: async () => {
      const response = await fetch(`/api/schools/students/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    enabled: !!id,
  });

  // Fetch student enrollments
  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: [`/api/enrollments/child/${id}`],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/enrollments/child/${id}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error('Error fetching enrollments:', error);
        return [];
      }
    },
    enabled: !!id
  });

  const isLoading = studentLoading || enrollmentsLoading;

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Loading...">
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (studentError || !student) {
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

  const studentName = `${student.firstName} ${student.lastName}`;

  return (
    <SchoolAdminLayout pageTitle={`${studentName} - Class Management`}>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/schools/students")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Students
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Class Management</h1>
              <p className="text-muted-foreground">Managing classes for {studentName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setLocation(`/schools/students/${id}`)}
            >
              <User className="mr-2 h-4 w-4" />
              View Profile
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation(`/schools/students/${id}/edit`)}
            >
              Edit Student
            </Button>
          </div>
        </div>

        <Separator />

        {/* Student Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Student Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Name</label>
                <p className="font-medium">{studentName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Grade Level</label>
                <p className="font-medium">{student.gradeLevel}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <Badge variant="secondary">{student.status || 'Active'}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Enrollments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Current Class Enrollments
            </CardTitle>
            <CardDescription>
              Classes that {student.firstName} is currently enrolled in
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enrollments && enrollments.length > 0 ? (
              <div className="space-y-4">
                {enrollments.map((enrollment: any) => (
                  <div
                    key={enrollment.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold">{enrollment.className || enrollment.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {enrollment.schedule}
                            </span>
                            {enrollment.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {enrollment.location}
                              </span>
                            )}
                          </div>
                          {enrollment.instructorName && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Instructor: {enrollment.instructorName}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant={enrollment.status === 'enrolled' ? 'default' : 'secondary'}
                          >
                            {enrollment.status || 'Enrolled'}
                          </Badge>
                          {enrollment.enrollmentDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Enrolled: {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Current Enrollments</h3>
                <p className="text-muted-foreground mb-4">
                  {student.firstName} is not currently enrolled in any classes.
                </p>
                <Button onClick={() => setLocation("/schools/classes")}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Browse Available Classes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common actions for managing {student.firstName}'s enrollment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline"
                onClick={() => setLocation("/schools/classes")}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Browse Classes
              </Button>
              <Button 
                variant="outline"
                onClick={() => setLocation(`/schools/students/${id}`)}
              >
                <User className="mr-2 h-4 w-4" />
                View Student Profile
              </Button>
              <Button 
                variant="outline"
                onClick={() => setLocation(`/schools/students/${id}/edit`)}
              >
                Edit Student Information
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}