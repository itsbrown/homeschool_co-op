import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { apiRequest, parseApiErrorMessage } from "@/lib/queryClient";
import {
  GRADE_LEVEL_OPTIONS,
  gradeLevelFromBirthdate,
  gradeSlugToLabel,
  normalizeGradeLevel,
  toDateInputValue,
} from "@shared/grade-levels";

interface StudentData {
  id: number;
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
  locationId?: number | null;
  parentEmail?: string;
  parentPhone?: string;
  emergencyContact?: string | { name?: string; relationship?: string; phone?: string; email?: string };
  emergencyPhone?: string;
  medicalNotes?: string;
  specialNeeds?: string;
  allergies?: string;
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

function getEmergencyContactName(ec: StudentData['emergencyContact']): string {
  if (!ec) return '';
  if (typeof ec === 'string') return ec;
  return ec.name || '';
}

function getEmergencyContactPhone(ec: StudentData['emergencyContact']): string {
  if (!ec) return '';
  if (typeof ec === 'string') return '';
  return ec.phone || '';
}

function gradeLabelFromBirthdate(birthdate: string): string {
  const slug = gradeLevelFromBirthdate(birthdate);
  return slug ? gradeSlugToLabel(slug) : "";
}

export default function StudentRegistrationPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/schools/students/:id/edit");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendInvitation, setSendInvitation] = useState(true);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [gradeManuallyEdited, setGradeManuallyEdited] = useState(false);
  const [locationId, setLocationId] = useState<string>("none");
  
  const isEditMode = !!match && !!params?.id;
  const studentId = params?.id;

  const { data: studentData, isLoading } = useQuery<StudentData>({
    queryKey: ['/api/school-admin/students', studentId],
    enabled: isEditMode && !!studentId,
  });

  const { data: schoolData } = useQuery<SchoolData>({
    queryKey: ['/api/school-parents/school', user?.email],
    enabled: !!user?.email,
  });

  const schoolId = schoolData?.id;

  const { data: locations } = useQuery<LocationData[]>({
    queryKey: ['/api/locations', { schoolId }],
    enabled: !!schoolId,
  });

  useEffect(() => {
    if (studentData && isEditMode) {
      const dob = toDateInputValue(studentData.birthdate);
      setDateOfBirth(dob);
      const autoLabel = gradeLabelFromBirthdate(dob);
      const storedSlug = normalizeGradeLevel(studentData.gradeLevel);
      // Default to age − 5 when DOB is known; otherwise show stored grade.
      setGradeLevel(autoLabel || (storedSlug ? gradeSlugToLabel(storedSlug) : ""));
      setGradeManuallyEdited(false);
      setLocationId(studentData.locationId != null ? String(studentData.locationId) : "none");
    }
  }, [studentData, isEditMode]);

  const handleBirthdateChange = (value: string) => {
    setDateOfBirth(value);
    if (!gradeManuallyEdited) {
      setGradeLevel(gradeLabelFromBirthdate(value));
    }
  };

  const handleGradeChange = (value: string) => {
    setGradeLevel(value);
    setGradeManuallyEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const resolvedGrade =
        gradeLevel || gradeLabelFromBirthdate(dateOfBirth);
      if (!resolvedGrade) {
        toast({
          title: "Grade Level Required",
          description: "Enter a date of birth so grade can be calculated, or select a grade.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const submissionData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        dateOfBirth,
        gradeLevel: resolvedGrade,
        locationId: locationId !== "none" ? parseInt(locationId, 10) : null,
        parentEmail: formData.get('parentEmail'),
        parentPhone: formData.get('parentPhone'),
        emergencyContact: formData.get('emergencyContact'),
        emergencyPhone: formData.get('emergencyPhone'),
        medicalNotes: formData.get('medicalNotes'),
        specialNeeds: formData.get('specialNeeds'),
        allergies: formData.get('allergies'),
        sendInvitation: sendInvitation,
        ...(isEditMode && formData.get('secondaryParentEmail')
          ? { secondaryParentEmail: formData.get('secondaryParentEmail') }
          : {}),
      };

      const endpoint = isEditMode ? `/api/school-admin/students/${studentId}` : '/api/students/register';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await apiRequest(method, endpoint, submissionData);
      await response.json();

      await queryClient.invalidateQueries({ queryKey: ['/api/school-admin/students'] });
      if (isEditMode && studentId) {
        await queryClient.invalidateQueries({
          queryKey: ['/api/school-admin/students', studentId],
        });
      }

      toast({
        title: isEditMode ? "Student Updated" : "Student Registered Successfully",
        description: isEditMode
          ? "Student information has been saved."
          : sendInvitation
            ? "Student registered and invitation email sent to parent."
            : "Student registered and linked to parent account.",
      });

      setLocation("/schools/students");
    } catch (error) {
      toast({
        title: isEditMode ? "Update Failed" : "Registration Failed",
        description: parseApiErrorMessage(
          error,
          `There was an error ${isEditMode ? 'updating' : 'registering'} the student. Please try again.`,
        ),
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
                    value={dateOfBirth}
                    onChange={(e) => handleBirthdateChange(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gradeLevel">Grade Level *</Label>
                  <Select value={gradeLevel || undefined} onValueChange={handleGradeChange}>
                    <SelectTrigger data-testid="select-grade-level">
                      <SelectValue placeholder="Select grade level" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_LEVEL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.label}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Auto-set from age (age − 5). Change the date of birth to recalculate, or pick a grade to override.
                  </p>
                </div>
              </div>

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
                      <SelectItem value="none">None</SelectItem>
                      {locations.map((location) => (
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
                      style={{ fontSize: '16px' }}
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
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
                {isEditMode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="secondaryParentEmail">Secondary Parent/Guardian Email</Label>
                      <Input
                        id="secondaryParentEmail"
                        name="secondaryParentEmail"
                        type="email"
                        placeholder="second-parent@example.com"
                        style={{ fontSize: '16px' }}
                      />
                      <p className="text-sm text-muted-foreground">
                        Add another parent or guardian's email to give them access to this student's account. They must already have an account.
                      </p>
                    </div>
                  </div>
                )}
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
                      defaultValue={getEmergencyContactName(studentData?.emergencyContact)}
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyPhone">Emergency Phone</Label>
                    <Input
                      id="emergencyPhone"
                      name="emergencyPhone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      defaultValue={studentData?.emergencyPhone || getEmergencyContactPhone(studentData?.emergencyContact)}
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Additional Information</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="allergies">Allergies</Label>
                    <Textarea
                      id="allergies"
                      name="allergies"
                      placeholder="Peanuts, bee stings, dairy…"
                      rows={2}
                      defaultValue={studentData?.allergies || ""}
                      style={{ fontSize: "16px" }}
                      data-testid="textarea-student-allergies"
                    />
                  </div>
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
                <Button type="submit" disabled={isSubmitting} data-testid="button-save-student">
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
