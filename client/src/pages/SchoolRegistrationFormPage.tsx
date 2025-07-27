
import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth0";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building, User, Baby } from "lucide-react";

const registrationSchema = z.object({
  // Parent Information
  parentFirstName: z.string().min(1, "First name is required"),
  parentLastName: z.string().min(1, "Last name is required"),
  parentEmail: z.string().email("Valid email is required"),
  parentPhone: z.string().min(10, "Phone number is required"),
  
  // Child Information
  childFirstName: z.string().min(1, "Child's first name is required"),
  childLastName: z.string().min(1, "Child's last name is required"),
  childBirthdate: z.string().min(1, "Birthdate is required"),
  childGradeLevel: z.string().min(1, "Grade level is required"),
  
  // Emergency Contact
  emergencyContactName: z.string().min(1, "Emergency contact name is required"),
  emergencyContactPhone: z.string().min(10, "Emergency contact phone is required"),
  emergencyContactRelation: z.string().min(1, "Relationship is required"),
  
  // Medical Information
  medicalNotes: z.string().optional(),
  specialNeeds: z.string().optional(),
  allergies: z.string().optional(),
  
  // Agreement
  agreesToTerms: z.boolean().refine(val => val === true, "You must agree to the terms and conditions"),
  agreesToEmails: z.boolean().optional()
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

interface School {
  id: number;
  name: string;
  type: string;
  registrationCode: string;
  description?: string;
}

export default function SchoolRegistrationFormPage() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      // Parent Information
      parentFirstName: "",
      parentLastName: "",
      parentEmail: "",
      parentPhone: "",
      
      // Child Information
      childFirstName: "",
      childLastName: "",
      childBirthdate: "",
      childGradeLevel: "",
      
      // Emergency Contact
      emergencyContactName: "",
      emergencyContactPhone: "",
      emergencyContactRelation: "",
      
      // Medical Information
      medicalNotes: "",
      specialNeeds: "",
      allergies: "",
      
      // Agreement
      agreesToTerms: false,
      agreesToEmails: false
    }
  });

  useEffect(() => {
    if (!code) {
      toast({
        title: "Invalid Link",
        description: "No registration code provided",
        variant: "destructive"
      });
      setLocation("/");
      return;
    }

    const fetchSchool = async () => {
      try {
        const response = await apiRequest("GET", `/api/schools/by-code/${code}`);
        
        if (response.ok) {
          const schoolData = await response.json();
          setSchool(schoolData);
        } else {
          toast({
            title: "School Not Found",
            description: "Invalid registration code",
            variant: "destructive"
          });
          setLocation("/");
        }
      } catch (err) {
        console.error("Error fetching school:", err);
        toast({
          title: "Error",
          description: "Failed to load school information",
          variant: "destructive"
        });
        setLocation("/");
      } finally {
        setLoading(false);
      }
    };

    fetchSchool();
  }, [code, toast, setLocation]);

  const onSubmit = async (data: RegistrationFormData) => {
    if (!school) return;

    setSubmitting(true);
    try {
      const registrationData = {
        schoolId: school.id,
        schoolRegistrationCode: school.registrationCode,
        parentFirstName: data.parentFirstName,
        parentLastName: data.parentLastName,
        parentEmail: data.parentEmail,
        parentPhone: data.parentPhone,
        childFirstName: data.childFirstName,
        childLastName: data.childLastName,
        childBirthdate: data.childBirthdate,
        childGradeLevel: data.childGradeLevel,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        emergencyContactRelation: data.emergencyContactRelation,
        medicalNotes: data.medicalNotes || "",
        specialNeeds: data.specialNeeds || "",
        allergies: data.allergies || "",
        agreesToEmails: data.agreesToEmails || false
      };

      const response = await apiRequest("POST", "/api/students/register", registrationData);

      if (response.ok) {
        toast({
          title: "Registration Successful!",
          description: `Your child has been registered with ${school.name}`,
        });
        
        setLocation(`/registration-success/${school.registrationCode}`);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Registration failed");
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading registration form...</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setLocation(`/school/${code}`)}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to School Info
            </Button>
            
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Building className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-xl">Register for {school.name}</CardTitle>
                    <CardDescription>
                      Complete this form to register your child
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit">
                  Registration Code: {school.registrationCode}
                </Badge>
              </CardHeader>
            </Card>
          </div>

          {/* Registration Form */}
          <Card>
            <CardContent className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  {/* Parent Information */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <User className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold">Parent/Guardian Information</h3>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="parentFirstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="parentLastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="parentEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address *</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="parentPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number *</FormLabel>
                            <FormControl>
                              <Input type="tel" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Child Information */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Baby className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold">Child Information</h3>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="childFirstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Child's First Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="childLastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Child's Last Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="childBirthdate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date of Birth *</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="childGradeLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Grade Level *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select grade level" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="pre-k">Pre-K</SelectItem>
                                <SelectItem value="kindergarten">Kindergarten</SelectItem>
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Emergency Contact</h3>
                    
                    <div className="grid md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="emergencyContactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="emergencyContactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Phone *</FormLabel>
                            <FormControl>
                              <Input type="tel" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="emergencyContactRelation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Relationship *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Grandparent, Aunt" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Medical Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Medical Information</h3>
                    
                    <FormField
                      control={form.control}
                      name="allergies"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Allergies</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="List any allergies (food, environmental, etc.)"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="specialNeeds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Special Needs or Accommodations</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe any special needs or accommodations required"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="medicalNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Medical Notes</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Any other medical information we should know"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Agreements */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Agreements</h3>
                    
                    <FormField
                      control={form.control}
                      name="agreesToTerms"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              I agree to the terms and conditions *
                            </FormLabel>
                            <FormDescription>
                              By checking this box, you agree to {school.name}'s policies and procedures.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="agreesToEmails"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              I would like to receive email updates
                            </FormLabel>
                            <FormDescription>
                              Optional: Receive newsletters and important updates from {school.name}.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end pt-6">
                    <Button 
                      type="submit" 
                      size="lg"
                      disabled={submitting}
                      className="px-8"
                    >
                      {submitting ? "Submitting..." : "Complete Registration"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
