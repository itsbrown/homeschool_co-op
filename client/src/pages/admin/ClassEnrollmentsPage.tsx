import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/ui/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth0";
import { ArrowLeft, UserPlus, UserMinus, Search, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ClassEnrollmentsPage() {
  const [, params] = useRoute("/admin/classes/:classId/enrollments");
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState(false);

  const classId = params?.classId ? parseInt(params.classId) : null;

  // Fetch class details
  const { data: classData, isLoading: isLoadingClass } = useQuery({
    queryKey: ['/api/admin-classes/classes', classId],
    queryFn: async () => {
      if (!classId) return null;
      const response = await fetch(`/api/admin-classes/classes/${classId}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error('Failed to fetch class');
      return response.json();
    },
    enabled: !!classId
  });

  // Fetch students for enrollment
  const { data: students = [], isLoading: isLoadingStudents } = useQuery({
    queryKey: ['/api/school-admin/students'],
    queryFn: async () => {
      const response = await fetch('/api/school-admin/students', {
        credentials: "include"
      });
      if (!response.ok) throw new Error('Failed to fetch students');
      return response.json();
    }
  });

  // Fetch current enrollments for this class
  const { data: enrollments = [], isLoading: isLoadingEnrollments, refetch: refetchEnrollments } = useQuery({
    queryKey: ['/api/enrollments/class', classId],
    queryFn: async () => {
      if (!classId) return [];
      const response = await fetch(`/api/enrollments/class/${classId}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error('Failed to fetch enrollments');
      return response.json();
    },
    enabled: !!classId
  });

  // Manual enrollment mutation
  const enrollStudentMutation = useMutation({
    mutationFn: async ({ studentId, classId }: { studentId: number; classId: number }) => {
      return apiRequest("POST", "/api/admin/manual-enrollment", {
        studentId,
        classId
      });
    },
    onSuccess: () => {
      toast({
        title: "Student Enrolled",
        description: "The student has been successfully enrolled in this class."
      });
      refetchEnrollments();
      setIsEnrollDialogOpen(false);
      setSelectedStudentId("");
    },
    onError: (error: any) => {
      toast({
        title: "Enrollment Failed",
        description: error.message || "Failed to enroll student",
        variant: "destructive"
      });
    }
  });

  // Unenroll mutation
  const unenrollMutation = useMutation({
    mutationFn: async (enrollmentId: number) => {
      return apiRequest("DELETE", `/api/enrollments/${enrollmentId}`);
    },
    onSuccess: () => {
      toast({
        title: "Student Unenrolled",
        description: "The student has been removed from this class."
      });
      refetchEnrollments();
    },
    onError: (error: any) => {
      toast({
        title: "Unenrollment Failed",
        description: error.message || "Failed to unenroll student",
        variant: "destructive"
      });
    }
  });

  const handleEnrollStudent = () => {
    if (!selectedStudentId || !classId) return;
    enrollStudentMutation.mutate({
      studentId: parseInt(selectedStudentId),
      classId
    });
  };

  const handleUnenrollStudent = (enrollmentId: number) => {
    unenrollMutation.mutate(enrollmentId);
  };

  // Filter available students (not already enrolled)
  const enrolledStudentIds = enrollments.map((e: any) => e.childId || e.studentId);
  const availableStudents = students.filter((student: any) => 
    !enrolledStudentIds.includes(student.id) &&
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "superAdmin") {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (!classId) {
    return <div>Invalid class ID</div>;
  }

  return (
    <AdminShell>
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setLocation("/admin/classes")}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Manage Enrollments</h1>
              {classData && (
                <p className="text-muted-foreground">{classData.title}</p>
              )}
            </div>
          </div>
          
          <Dialog open={isEnrollDialogOpen} onOpenChange={setIsEnrollDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Add Student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enroll Student</DialogTitle>
                <DialogDescription>
                  Select a student to manually enroll in this admin-only class.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search students..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStudents.map((student: any) => (
                      <SelectItem key={student.id} value={student.id.toString()}>
                        {student.name} (Grade: {student.grade})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEnrollDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleEnrollStudent}
                    disabled={!selectedStudentId || enrollStudentMutation.isPending}
                  >
                    {enrollStudentMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enrolling...
                      </>
                    ) : (
                      "Enroll Student"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Class Info Card */}
        {classData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {classData.title}
                <Badge variant="destructive">Admin Only</Badge>
              </CardTitle>
              <CardDescription>{classData.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Category:</span> {classData.category}
                </div>
                <div>
                  <span className="font-medium">Grade Level:</span> {classData.gradeLevel}
                </div>
                <div>
                  <span className="font-medium">Capacity:</span> {classData.capacity || 20}
                </div>
                <div>
                  <span className="font-medium">Enrolled:</span> {enrollments.length}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Enrollments */}
        <Card>
          <CardHeader>
            <CardTitle>Current Enrollments</CardTitle>
            <CardDescription>
              Students currently enrolled in this admin-only class
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingEnrollments ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading enrollments...</span>
              </div>
            ) : enrollments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No students are currently enrolled in this class.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Enrollment Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((enrollment: any) => {
                    const student = students.find((s: any) => s.id === (enrollment.childId || enrollment.studentId));
                    return (
                      <TableRow key={enrollment.id}>
                        <TableCell className="font-medium">
                          {student?.name || "Unknown Student"}
                        </TableCell>
                        <TableCell>{student?.grade || "N/A"}</TableCell>
                        <TableCell>
                          {new Date(enrollment.enrollmentDate || enrollment.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">{enrollment.status || "enrolled"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnenrollStudent(enrollment.id)}
                            disabled={unenrollMutation.isPending}
                          >
                            <UserMinus className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}