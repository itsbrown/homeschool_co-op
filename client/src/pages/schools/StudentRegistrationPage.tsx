import React, { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, UserPlus, Mail, Edit, MapPin } from "lucide-react";
import { useAuth } from "@/components/SupabaseProvider";
import { apiRequest } from "@/lib/queryClient";

interface StudentData {
  id: number;
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
  locationId?: number | null;
  parentEmail?: string;
  parentPhone?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  medicalNotes?: string;
  specialNeeds?: string;
}

interface SchoolData {
  id: number;
  name: string;
}

interface LocationData {
  id: number;
  name: string;
  city: string;
  state: string;
}

export default function StudentRegistrationPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/schools/students/:id/edit");
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendInvitation, setSendInvitation] = useState(true);
  const [gradeLevel, setGradeLevel] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  
  // Check if we're in edit mode
  const isEditMode = !!match && !!params?.id;
  const studentId = params?.id;

  // Fetch student data if in edit mode
  const { data: studentData, isLoading } = useQuery<StudentData>({
    queryKey: [`/api/school-admin/students/${studentId}`],
    enabled: isEditMode
  });

  // Fetch school info to get schoolId for locations
  const { data: schoolData } = useQuery<SchoolData>({
    queryKey: ['/api/school-parents/school', user?.email],
    enabled: !!user?.email,
  });

  const schoolId = schoolData?.id;

  // Fetch available locations for the school
  const { data: locations, isLoading: locationsLoading } = useQuery<LocationData[]>({
    queryKey: ['/api/locations', { schoolId }],
    enabled: !!schoolId,
  });

  // Populate form when student data is loaded
  useEffect(() => {
    if (studentData && isEditMode) {
      setGradeLevel(studentData.gradeLevel || "");
      setLocationId(studentData.locationId?.toString() || "");
    }
  }, [studentData, isEditMode]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const submissionData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        dateOfBirth: formData.get('dateOfBirth'),
        gradeLevel: gradeLevel, // Use state value instead of FormData
        // schoolId is derived server-side from authenticated admin's JWT token for security
        locationId: locationId ? parseInt(locationId) : null, // Server validates this belongs to your school
        parentEmail: formData.get('parentEmail'),
        parentPhone: formData.get('parentPhone'),
        emergencyContact: formData.get('emergencyContact'),
        emergencyPhone: formData.get('emergencyPhone'),
        medicalNotes: formData.get('medicalNotes'),
        specialNeeds: formData.get('specialNeeds'),
        sendInvitation: sendInvitation,
      };

      console.log('Form submission data:', submissionData);

      // Choose endpoint and method based on mode
      const endpoint = isEditMode ? `/api/school-admin/students/${studentId}` : '/api/students/register';
      const method = isEditMode ? 'PUT' : 'POST';

      // Use apiRequest for authenticated requests
      const response = await apiRequest(method, endpoint, submissionData);
      const result = await response.json();
      console.log('Registration success:', result);

      toast({
        title: "Student Registered Successfully",
        description: sendInvitation 
          ? "Student registered and invitation email sent to parent."
          : "Student registered and linked to parent account.",
      });

      setLocation("/schools/students");
    } catch (error) {
      toast({
        title: isEditMode ? "Update Failed" : "Registration Failed",
        description: `There was an error ${isEditMode ? 'updating' : 'registering'} the student. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isEditMode && isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Edit Student">
        <div className="h-screen flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle={isEditMode ? "Edit Student" : "Register Student"}>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/schools/students")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {isEditMode ? "Edit Student" : "Register New Student"}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode ? "Update student information" : "Add a new student to your school roster"}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isEditMode ? <Edit className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              Student Information
            </CardTitle>
            <CardDescription>
              {isEditMode ? "Update the student's information below" : "Please fill out all required information for the new student"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    required
                    placeholder="Enter first name"
                    defaultValue={studentData?.firstName || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    required
                    placeholder="Enter last name"
                    defaultValue={studentData?.lastName || ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                  <Input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    required
                    defaultValue={studentData?.birthdate || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gradeLevel">Grade Level *</Label>
                  <Select value={gradeLevel} onValueChange={setGradeLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pre-K">Pre-K</SelectItem>
                      <SelectItem value="K">Kindergarten</SelectItem>
                      <SelectItem value="1">1st Grade</SelectItem>
                      <SelectItem value="2">2nd Grade</SelectItem>
                      <SelectItem value="3">3rd Grade</SelectItem>
                      <SelectItem value="4">4th Grade</SelectItem>
                      <SelectItem value="5">5th Grade</SelectItem>
                      <SelectItem value="6">6th Grade</SelectItem>
                      <SelectItem value="7">7th Grade</SelectItem>
                      <SelectItem value="8">8th Grade</SelectItem>
                      <SelectItem value="9">9th Grade</SelectItem>
                      <SelectItem value="10">10th Grade</SelectItem>
                      <SelectItem value="11">11th Grade</SelectItem>
                      <SelectItem value="12">12th Grade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Location Selector */}
              {locations && locations.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="location" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Campus/Location
                  </Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger data-testid="select-location">
                      <SelectValue placeholder="Select a location (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {locations.map((location: any) => (
                        <SelectItem key={location.id} value={location.id.toString()}>
                          {location.name} - {location.city}, {location.state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Assign this student to a specific campus or location
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Parent/Guardian Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="parentEmail">Parent Email</Label>
                    <Input
                      id="parentEmail"
                      name="parentEmail"
                      type="email"
                      placeholder="parent@example.com"
                      defaultValue={studentData?.parentEmail || ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parentPhone">Parent Phone</Label>
                    <Input
                      id="parentPhone"
                      name="parentPhone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      defaultValue={studentData?.parentPhone || ""}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Emergency Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContact">Emergency Contact Name</Label>
                    <Input
                      id="emergencyContact"
                      name="emergencyContact"
                      placeholder="Enter emergency contact name"
                      defaultValue={studentData?.emergencyContact || ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyPhone">Emergency Phone</Label>
                    <Input
                      id="emergencyPhone"
                      name="emergencyPhone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      defaultValue={studentData?.emergencyPhone || ""}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Additional Information</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="medicalNotes">Medical Notes</Label>
                    <Textarea
                      id="medicalNotes"
                      name="medicalNotes"
                      placeholder="Any medical conditions, allergies, or medications..."
                      rows={3}
                      defaultValue={studentData?.medicalNotes || ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specialNeeds">Special Needs</Label>
                    <Textarea
                      id="specialNeeds"
                      name="specialNeeds"
                      placeholder="Learning accommodations, dietary restrictions, etc..."
                      rows={3}
                      defaultValue={studentData?.specialNeeds || ""}
                    />
                  </div>
                </div>
              </div>

              {!isEditMode && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="sendInvitation" 
                    checked={sendInvitation}
                    onCheckedChange={(checked) => setSendInvitation(checked === true)}
                  />
                  <Label htmlFor="sendInvitation" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Send invitation email to parent
                  </Label>
                </div>
              )}

              <div className="flex gap-4 justify-end">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setLocation("/schools/students")}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      {isEditMode ? "Updating..." : "Registering..."}
                    </>
                  ) : (
                    <>
                      {isEditMode ? <Edit className="w-4 h-4 mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                      {isEditMode ? "Update Student" : "Register Student"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}