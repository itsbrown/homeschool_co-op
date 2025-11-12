import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, AlertTriangle, Heart, GraduationCap, Edit } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";

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

export default function StudentDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  // Fetch student data
  const { data: student, isLoading, error } = useQuery({
    queryKey: [`/api/school-admin/students/${id}`],
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
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
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
          <Button onClick={() => setLocation(`/schools/students/${id}/edit`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit Student
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
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

          {/* Contact Information */}
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

          {/* Emergency Contact */}
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

          {/* Health & Special Needs */}
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

        {/* Interests */}
        {student.interests && student.interests.length > 0 && (
          <Card>
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
      </div>
    </SchoolAdminLayout>
  );
}