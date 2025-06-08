import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, User, Calendar, GraduationCap, Mail, Phone, MapPin, Heart, AlertTriangle, BookOpen, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ParentAppShell from '@/components/layout/ParentAppShell';
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export default function ChildProfilePage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [confirmDialog, setConfirmDialog] = useState({ open: false, enrollmentId: null, className: "" });

  // Fetch detailed child data using proper authentication
  const { data: child, isLoading } = useQuery({
    queryKey: [`/api/school-admin/students/${id}`],
    queryFn: async () => {
      try {
        const token = localStorage.getItem('supabase_token');
        const response = await fetch(`/api/school-admin/students/${id}`, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const studentData = await response.json();
        
        // Calculate age from birthdate
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
        
        // Return authentic student data from database
        return {
          id: studentData.id,
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          name: `${studentData.firstName} ${studentData.lastName}`,
          gradeLevel: studentData.gradeLevel,
          birthdate: studentData.birthdate,
          age: calculateAge(studentData.birthdate),
          school: "American Seekers Academy",
          interests: studentData.interests || [],
          allergies: studentData.allergies || "None specified",
          medicalInfo: studentData.medicalNotes || "No medical notes",
          specialNeeds: studentData.specialNeeds || "None specified",
          parentEmail: studentData.parentEmail,
          parentPhone: studentData.parentPhone,
          emergencyContact: studentData.emergencyContact,
          enrollmentDate: studentData.enrollmentDate,
          status: studentData.status || "Active"
        };
      } catch (error) {
        console.error("Error fetching student:", error);
        throw error;
      }
    },
    enabled: !!id,
  });

  // Fetch enrollment data for this child
  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: [`/api/enrollments/child/${id}`],
    queryFn: async () => {
      try {
        const token = localStorage.getItem('supabase_token');
        const response = await fetch(`/api/enrollments/child/${id}`, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          }
        });
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

  // Unenrollment mutation
  const unenrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: number) => {
      return apiRequest('DELETE', `/api/enrollments/${enrollmentId}`);
    },
    onSuccess: () => {
      toast({
        title: "Unenrollment Successful",
        description: "The child has been successfully removed from the class.",
      });
      setConfirmDialog({ open: false, enrollmentId: null, className: "" });
      // Invalidate enrollment queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: [`/api/enrollments/child/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
    },
    onError: (error: any) => {
      toast({
        title: "Unenrollment Failed",
        description: error.message || "There was an error removing the child from the class.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  if (!child) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Student Not Found</h2>
            <p className="text-muted-foreground mb-4">The requested student profile could not be found.</p>
            <Button onClick={() => setLocation("/children")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Children
            </Button>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation("/children/view")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Children
          </Button>
        </div>

        {/* Profile Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src="" alt={child.name} />
                <AvatarFallback className="text-lg">
                  {child.firstName[0]}{child.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">{child.name}</h1>
                  <Badge variant="secondary">
                    {child.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Grade {child.gradeLevel}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Age {child.age}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {child.school}
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Detailed Information */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            <TabsTrigger value="health">Health & Safety</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                    <p className="font-medium">{child.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                    <p className="font-medium">{child.birthdate}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Grade Level</label>
                    <p className="font-medium">Grade {child.gradeLevel}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Enrollment Date</label>
                    <p className="font-medium">{child.enrollmentDate}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    Interests & Learning
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Grade Level</label>
                    <p className="font-medium">{child.gradeLevel}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Interests</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {child.interests.map((interest: string, index: number) => (
                        <Badge key={index} variant="outline">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="academic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Academic Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Academic records and progress reports will be displayed here.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Health & Safety Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Allergies</label>
                  <p className="font-medium">{child.allergies || "None reported"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Medical Information</label>
                  <p className="font-medium">{child.medicalInfo || "No medical conditions reported"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Special Needs</label>
                  <p className="font-medium">{child.specialNeeds || "None specified"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Emergency Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {child.emergencyContact ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Contact Name</label>
                      <p className="font-medium">{child.emergencyContact.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Relationship</label>
                      <p className="font-medium">{child.emergencyContact.relationship}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                      <p className="font-medium">{child.emergencyContact.phone}</p>
                    </div>
                    {child.emergencyContact.email && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p className="font-medium">{child.emergencyContact.email}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No emergency contact information available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Parent Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {child.parentEmail && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Parent Email</label>
                    <p className="font-medium">{child.parentEmail}</p>
                  </div>
                )}
                {child.parentPhone && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Parent Phone</label>
                    <p className="font-medium">{child.parentPhone}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enrollments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Current Enrollments</CardTitle>
                <CardDescription>Classes and programs this student is enrolled in</CardDescription>
              </CardHeader>
              <CardContent>
                {enrollmentsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading enrollments...</p>
                  </div>
                ) : enrollments && enrollments.length > 0 ? (
                  <div className="space-y-4">
                    {enrollments.map((enrollment: any) => (
                      <div key={enrollment.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{enrollment.className}</h3>
                            <p className="text-sm text-muted-foreground">
                              Enrolled on {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="default">{enrollment.status}</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmDialog({ 
                                open: true, 
                                enrollmentId: enrollment.id, 
                                className: enrollment.className 
                              })}
                              className="text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No current enrollments found.</p>
                    <p className="text-sm mt-2">Browse available programs to enroll in classes.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Dialog for Unenrollment */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Unenrollment</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this child from "{confirmDialog.className}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, enrollmentId: null, className: "" })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDialog.enrollmentId) {
                  unenrollmentMutation.mutate(confirmDialog.enrollmentId);
                }
              }}
              disabled={unenrollmentMutation.isPending}
            >
              {unenrollmentMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ParentAppShell>
  );
}