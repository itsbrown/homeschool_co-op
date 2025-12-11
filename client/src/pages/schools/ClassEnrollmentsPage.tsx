import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth0";
import { ArrowLeft, UserPlus, UserMinus, Search, Loader2, Clock, Calendar } from "lucide-react";
import { formatCurrency } from "@/utils/currency";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

export default function SchoolAdminClassEnrollmentsPage() {
  const [, params] = useRoute("/schools/classes/:id/enrollments");
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState(false);

  const classId = params?.id ? parseInt(params.id) : null;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('supabase_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  };

  const { data: classData, isLoading: isLoadingClass } = useQuery({
    queryKey: ['/api/class-details', classId],
    queryFn: async () => {
      if (!classId) return null;
      const response = await fetch(`/api/class-details/${classId}`, {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (!response.ok) throw new Error('Failed to fetch class');
      return response.json();
    },
    enabled: !!classId
  });

  const { data: students = [], isLoading: isLoadingStudents } = useQuery({
    queryKey: ['/api/school-admin/students'],
    queryFn: async () => {
      const response = await fetch('/api/school-admin/students', {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (!response.ok) throw new Error('Failed to fetch students');
      return response.json();
    }
  });

  const { data: rosterData, isLoading: isLoadingEnrollments, refetch: refetchEnrollments } = useQuery({
    queryKey: ['/api/school-admin/classes', classId, 'roster'],
    queryFn: async () => {
      if (!classId) return { students: [] };
      const response = await fetch(`/api/school-admin/classes/${classId}/roster`, {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (!response.ok) throw new Error('Failed to fetch enrollments');
      return response.json();
    },
    enabled: !!classId
  });
  
  // Transform roster data to match enrollments format
  // Note: enrollmentId is required for unenrollment to work
  const enrollments = (rosterData?.students || []).map((student: any) => ({
    id: student.enrollmentId,
    childId: student.id,
    studentId: student.id,
    status: student.status || 'enrolled',
    enrollmentDate: student.enrollmentDate,
    createdAt: student.enrollmentDate,
    studentName: `${student.firstName} ${student.lastName}`,
    grade: student.gradeLevel
  }));

  const enrollStudentMutation = useMutation({
    mutationFn: async ({ studentId, classId, variantId }: { studentId: number; classId: number; variantId?: string }) => {
      return apiRequest("POST", "/api/admin/manual-enrollment", {
        studentId,
        classId,
        variantId
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
      setSelectedVariantId("");
    },
    onError: (error: any) => {
      toast({
        title: "Enrollment Failed",
        description: error.message || "Failed to enroll student",
        variant: "destructive"
      });
    }
  });

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

  // Extract variants from class data
  // The /api/class-details endpoint returns variants at top level (classData.variants)
  // Also check schedule.variants as fallback for other endpoints
  const getClassVariants = () => {
    // First check if variants are at top level (from /api/class-details)
    if (classData?.variants && Array.isArray(classData.variants)) {
      return classData.variants;
    }
    // Fallback: parse from schedule field
    if (classData?.schedule) {
      const parsed = typeof classData.schedule === 'string' 
        ? JSON.parse(classData.schedule) 
        : classData.schedule;
      return parsed?.variants || [];
    }
    return [];
  };
  const classVariants = classData ? getClassVariants() : [];
  const hasMultipleVariants = classVariants.length > 1;
  
  const handleEnrollStudent = () => {
    if (!selectedStudentId || !classId) return;
    // Require variant selection if multiple variants exist
    if (hasMultipleVariants && !selectedVariantId) {
      toast({
        title: "Select Time Option",
        description: "Please select a time option for this class.",
        variant: "destructive"
      });
      return;
    }
    enrollStudentMutation.mutate({
      studentId: parseInt(selectedStudentId),
      classId,
      variantId: selectedVariantId || (classVariants[0]?.id)
    });
  };

  const handleUnenrollStudent = (enrollmentId: number) => {
    unenrollMutation.mutate(enrollmentId);
  };

  // Convert all enrolled IDs to numbers for consistent comparison
  const enrolledStudentIds = enrollments.map((e: any) => {
    const id = e.childId || e.studentId;
    return typeof id === 'string' ? parseInt(id, 10) : id;
  });
  const availableStudents = students.filter((student: any) => {
    const studentId = typeof student.id === 'string' ? parseInt(student.id, 10) : student.id;
    return !enrolledStudentIds.includes(studentId) &&
      student.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "superAdmin" && user.role !== "schoolAdmin") {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (!classId) {
    return <div>Invalid class ID</div>;
  }

  return (
    <SchoolAdminLayout pageTitle="Manage Enrollments">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => window.history.back()}
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
                  Select a student to manually enroll in this class.
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
                
                <div>
                  <Label className="text-sm font-medium">Select Student</Label>
                  <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                    <SelectTrigger data-testid="select-student">
                      <SelectValue placeholder="Select a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStudents.map((student: any) => (
                        <SelectItem key={student.id} value={student.id.toString()} data-testid={`student-option-${student.id}`}>
                          {student.name} (Grade: {student.grade})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Show variant selection if class has multiple time options */}
                {classVariants.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Select Time Option {hasMultipleVariants && <span className="text-destructive">*</span>}
                    </Label>
                    <RadioGroup 
                      value={selectedVariantId} 
                      onValueChange={setSelectedVariantId}
                      className="space-y-2"
                    >
                      {classVariants.map((variant: any) => (
                        <div
                          key={variant.id}
                          className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedVariantId === variant.id 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:bg-muted/50'
                          }`}
                          onClick={() => setSelectedVariantId(variant.id)}
                          data-testid={`variant-option-${variant.id}`}
                        >
                          <RadioGroupItem value={variant.id} id={variant.id} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{variant.name}</span>
                              <Badge variant="secondary">{formatCurrency(variant.price)}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {variant.startTime} - {variant.endTime}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {variant.days?.join(', ') || 'TBD'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}
                
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

        {classData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {classData.title}
                {classData.isAdminOnly && <Badge variant="destructive">Admin Only</Badge>}
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

        <Card>
          <CardHeader>
            <CardTitle>Current Enrollments</CardTitle>
            <CardDescription>
              Students currently enrolled in this class
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
                          {enrollment.studentName || student?.name || "Unknown Student"}
                        </TableCell>
                        <TableCell>{enrollment.grade || student?.grade || "N/A"}</TableCell>
                        <TableCell>
                          {enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate).toLocaleDateString() : "N/A"}
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
    </SchoolAdminLayout>
  );
}
