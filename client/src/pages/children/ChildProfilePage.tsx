import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, User, Calendar, GraduationCap, Mail, Phone, MapPin, Heart, AlertTriangle, BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ParentAppShell from '@/components/layout/ParentAppShell';

export default function ChildProfilePage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  // Fetch child data from school admin students endpoint
  const { data: child, isLoading } = useQuery({
    queryKey: ["/api/schools/students", id],
    queryFn: async () => {
      try {
        const response = await fetch("/api/schools/students");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const students = await response.json();
        const student = students.find((s: any) => s.id.toString() === id);
        
        if (!student) {
          throw new Error("Student not found");
        }
        
        // Transform student data to child format
        return {
          id: student.id,
          firstName: student.name.split(' ')[0],
          lastName: student.name.split(' ').slice(1).join(' '),
          name: student.name,
          gradeLevel: student.gradeLevel,
          age: student.age,
          email: student.email,
          status: student.status,
          enrollmentDate: student.enrollmentDate,
          // Add some additional mock profile data for display
          birthdate: "2015-06-15", // Mock data
          school: "American Seekers Academy",
          interests: ["Reading", "Science", "Art"],
          allergies: "None",
          medicalInfo: "No medical conditions",
          learningStyle: "Visual Learner"
        };
      } catch (error) {
        console.error("Error fetching student:", error);
        throw error;
      }
    },
    enabled: !!id,
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
                    <label className="text-sm font-medium text-muted-foreground">Learning Style</label>
                    <p className="font-medium">{child.learningStyle}</p>
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
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enrollment information will be displayed here.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ParentAppShell>
  );
}