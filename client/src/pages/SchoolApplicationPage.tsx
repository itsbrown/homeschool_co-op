
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  School, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar,
  Users,
  FileText,
  CheckCircle,
  ArrowLeft
} from "lucide-react";

const schoolApplicationSchema = z.object({
  // School Information
  schoolName: z.string().min(1, "School name is required"),
  schoolType: z.enum(["public", "private", "charter", "homeschool_coop", "other"]),
  schoolTypeOther: z.string().optional(),
  
  // Contact Information
  adminFirstName: z.string().min(1, "First name is required"),
  adminLastName: z.string().min(1, "Last name is required"),
  adminEmail: z.string().email("Valid email is required"),
  adminPhone: z.string().min(1, "Phone number is required"),
  
  // School Details
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "ZIP code is required"),
  website: z.string().url().optional().or(z.literal("")),
  
  // School Stats
  currentStudentCount: z.coerce.number().min(0),
  gradelevelsServed: z.array(z.string()).min(1, "At least one grade level required"),
  establishedYear: z.coerce.number().min(1800).max(new Date().getFullYear()),
  
  // Platform Interest
  reasonForJoining: z.string().min(50, "Please provide at least 50 characters explaining why you want to join"),
  currentChallenges: z.string().min(30, "Please describe your current educational challenges"),
  expectedStudentGrowth: z.coerce.number().min(0),
  
  // References
  reference1Name: z.string().min(1, "Reference name is required"),
  reference1Email: z.string().email("Valid reference email is required"),
  reference1Relationship: z.string().min(1, "Relationship to reference is required"),
  reference2Name: z.string().optional(),
  reference2Email: z.string().email().optional().or(z.literal("")),
  reference2Relationship: z.string().optional(),
  
  // Agreement
  agreesToTerms: z.boolean().refine(val => val === true, "You must agree to the terms"),
  agreesToDataSharing: z.boolean().refine(val => val === true, "You must agree to data sharing policy")
});

type SchoolApplicationForm = z.infer<typeof schoolApplicationSchema>;

const gradeOptions = [
  "Pre-K", "Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", 
  "5th Grade", "6th Grade", "7th Grade", "8th Grade", "9th Grade", "10th Grade", 
  "11th Grade", "12th Grade", "Adult Education"
];

const schoolTypeOptions = [
  { value: "public", label: "Public School" },
  { value: "private", label: "Private School" },
  { value: "charter", label: "Charter School" },
  { value: "homeschool_coop", label: "Homeschool Cooperative" },
  { value: "other", label: "Other" }
];

export default function SchoolApplicationPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentSection, setCurrentSection] = useState(0);
  
  const form = useForm<SchoolApplicationForm>({
    resolver: zodResolver(schoolApplicationSchema),
    defaultValues: {
      schoolName: "",
      schoolType: "private",
      schoolTypeOther: "",
      adminFirstName: "",
      adminLastName: "",
      adminEmail: "",
      adminPhone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      website: "",
      currentStudentCount: 0,
      gradelevelsServed: [],
      establishedYear: new Date().getFullYear(),
      reasonForJoining: "",
      currentChallenges: "",
      expectedStudentGrowth: 0,
      reference1Name: "",
      reference1Email: "",
      reference1Relationship: "",
      reference2Name: "",
      reference2Email: "",
      reference2Relationship: "",
      agreesToTerms: false,
      agreesToDataSharing: false
    }
  });

  const submitApplication = useMutation({
    mutationFn: async (data: SchoolApplicationForm) => {
      const response = await apiRequest("POST", "/api/school-applications", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to submit application");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Application Submitted Successfully!",
        description: `Your application ID is ${data.applicationId}. You'll receive an email confirmation shortly.`,
      });
      setLocation("/school-application-success");
    },
    onError: (error: Error) => {
      toast({
        title: "Application Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: SchoolApplicationForm) => {
    submitApplication.mutate(data);
  };

  const sections = [
    {
      title: "School Information",
      icon: <School className="h-5 w-5" />,
      fields: ["schoolName", "schoolType", "schoolTypeOther"]
    },
    {
      title: "Administrator Contact",
      icon: <User className="h-5 w-5" />,
      fields: ["adminFirstName", "adminLastName", "adminEmail", "adminPhone"]
    },
    {
      title: "School Location",
      icon: <MapPin className="h-5 w-5" />,
      fields: ["address", "city", "state", "zipCode", "website"]
    },
    {
      title: "School Details",
      icon: <Users className="h-5 w-5" />,
      fields: ["currentStudentCount", "gradelevelsServed", "establishedYear"]
    },
    {
      title: "Platform Interest",
      icon: <FileText className="h-5 w-5" />,
      fields: ["reasonForJoining", "currentChallenges", "expectedStudentGrowth"]
    },
    {
      title: "References & Agreement",
      icon: <CheckCircle className="h-5 w-5" />,
      fields: ["reference1Name", "reference1Email", "reference1Relationship", "reference2Name", "reference2Email", "reference2Relationship", "agreesToTerms", "agreesToDataSharing"]
    }
  ];

  const nextSection = () => {
    if (currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    }
  };

  const prevSection = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const watchedSchoolType = form.watch("schoolType");
  const watchedGradeLevels = form.watch("gradelevelsServed");

  const toggleGradeLevel = (grade: string) => {
    const current = watchedGradeLevels || [];
    const updated = current.includes(grade) 
      ? current.filter(g => g !== grade)
      : [...current, grade];
    form.setValue("gradelevelsServed", updated);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">School Application</h1>
            <p className="text-gray-600 mt-2">Join the ASA Platform and transform your educational experience</p>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            {sections.map((section, index) => (
              <div key={index} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  index <= currentSection 
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  {index < currentSection ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    section.icon
                  )}
                </div>
                {index < sections.length - 1 && (
                  <div className={`h-0.5 w-20 ${
                    index < currentSection ? 'bg-blue-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-center">
            <span className="text-sm text-gray-600">
              Step {currentSection + 1} of {sections.length}: {sections[currentSection].title}
            </span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {sections[currentSection].icon}
                  {sections[currentSection].title}
                </CardTitle>
                <CardDescription>
                  Please provide accurate information for your school application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* School Information Section */}
                {currentSection === 0 && (
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="schoolName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>School Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your school's full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="schoolType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>School Type *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select school type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {schoolTypeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {watchedSchoolType === "other" && (
                      <FormField
                        control={form.control}
                        name="schoolTypeOther"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Please specify school type</FormLabel>
                            <FormControl>
                              <Input placeholder="Describe your school type" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}

                {/* Administrator Contact Section */}
                {currentSection === 1 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="adminFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Your first name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="adminLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Your last name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="adminEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="your.email@school.edu" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="adminPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number *</FormLabel>
                          <FormControl>
                            <Input placeholder="(555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* School Location Section */}
                {currentSection === 2 && (
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address *</FormLabel>
                          <FormControl>
                            <Input placeholder="123 School Street" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City *</FormLabel>
                            <FormControl>
                              <Input placeholder="City" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State *</FormLabel>
                            <FormControl>
                              <Input placeholder="State" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code *</FormLabel>
                            <FormControl>
                              <Input placeholder="12345" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>School Website (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://www.yourschool.edu" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* School Details Section */}
                {currentSection === 3 && (
                  <div className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="currentStudentCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Current Student Count *</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" placeholder="0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="establishedYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Year Established *</FormLabel>
                            <FormControl>
                              <Input type="number" min="1800" max={new Date().getFullYear()} placeholder="2020" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="gradelevelsServed"
                      render={() => (
                        <FormItem>
                          <FormLabel>Grade Levels Served *</FormLabel>
                          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                            {gradeOptions.map((grade) => (
                              <div key={grade} className="flex items-center space-x-2">
                                <Checkbox
                                  id={grade}
                                  checked={watchedGradeLevels?.includes(grade)}
                                  onCheckedChange={() => toggleGradeLevel(grade)}
                                />
                                <Label htmlFor={grade} className="text-sm">{grade}</Label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Platform Interest Section */}
                {currentSection === 4 && (
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="reasonForJoining"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Why do you want to join the ASA Platform? *</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Please explain your motivation for joining our platform and how you believe it will benefit your school (minimum 50 characters)..."
                              className="min-h-[100px]"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="currentChallenges"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>What are your current educational challenges? *</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe the main challenges your school faces (minimum 30 characters)..."
                              className="min-h-[80px]"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="expectedStudentGrowth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Student Growth (Next 2 Years) *</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" placeholder="Number of additional students expected" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* References & Agreement Section */}
                {currentSection === 5 && (
                  <div className="grid gap-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Professional References</h3>
                      <div className="grid gap-4">
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium mb-3">Reference 1 (Required)</h4>
                          <div className="grid gap-3">
                            <FormField
                              control={form.control}
                              name="reference1Name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Full Name *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Reference's full name" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="reference1Email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email Address *</FormLabel>
                                  <FormControl>
                                    <Input type="email" placeholder="reference@email.com" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="reference1Relationship"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Relationship *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Superintendent, Principal, Board Member" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium mb-3">Reference 2 (Optional)</h4>
                          <div className="grid gap-3">
                            <FormField
                              control={form.control}
                              name="reference2Name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Full Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Reference's full name" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="reference2Email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email Address</FormLabel>
                                  <FormControl>
                                    <Input type="email" placeholder="reference@email.com" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="reference2Relationship"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Relationship</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Teacher, Parent, Community Leader" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-4">Terms and Agreements</h3>
                      <div className="space-y-4">
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
                                  I agree to the Terms and Conditions *
                                </FormLabel>
                                <p className="text-sm text-muted-foreground">
                                  I understand and agree to abide by the ASA Platform's terms of service, code of conduct, and educational standards.
                                </p>
                              </div>
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="agreesToDataSharing"
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
                                  I agree to the Data Sharing Policy *
                                </FormLabel>
                                <p className="text-sm text-muted-foreground">
                                  I consent to sharing necessary educational data to improve platform services while maintaining student privacy and security.
                                </p>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex justify-between">
              <Button 
                type="button" 
                variant="outline" 
                onClick={prevSection}
                disabled={currentSection === 0}
              >
                Previous
              </Button>
              
              {currentSection < sections.length - 1 ? (
                <Button type="button" onClick={nextSection}>
                  Next
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  disabled={submitApplication.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submitApplication.isPending ? "Submitting..." : "Submit Application"}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
