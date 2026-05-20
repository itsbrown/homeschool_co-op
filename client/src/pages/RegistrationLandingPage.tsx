import React, { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Building, ArrowLeft, PlusCircle, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { registerParentWithChildren } from "@/lib/auth-register";
import type { RegistrationSignupChildInput } from "@shared/auth-register";

const signupChildSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  birthdate: z.string().trim().min(1, "Birthdate is required"),
  gradeLevel: z.string().min(1, "Grade level is required"),
  gender: z.string().optional(),
});

const signupChildGradeOptions = [
  "Littles",
  "Pre-K",
  "Kindergarten",
  "1st Grade",
  "2nd Grade",
  "3rd Grade",
  "4th Grade",
  "5th Grade",
  "6th Grade",
  "7th Grade",
  "8th Grade",
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
] as const;

// Parent + at least one child (school code flow)
const parentRegistrationSchema = z
  .object({
    parentFirstName: z.string().min(1, "First name is required"),
    parentLastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Valid email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your password"),
    phone: z.string().min(10, "Phone number is required"),
    location: z.string().min(1, "Location selection is required"),
    children: z.array(signupChildSchema).min(1).max(10),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ParentRegistrationForm = z.infer<typeof parentRegistrationSchema>;

const defaultChildValues = (): ParentRegistrationForm["children"][number] => ({
  firstName: "",
  lastName: "",
  birthdate: "",
  gradeLevel: "",
  gender: "",
});

interface School {
  id: number;
  name: string;
  type: string;
  registrationCode: string;
  description?: string;
  location?: string;
}

export default function RegistrationLandingPage() {
  const params = useParams<{ code?: string }>();
  const code = params?.code;
  const [, setLocation] = useLocation();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(!!code);
  const { toast } = useToast();

  const form = useForm<ParentRegistrationForm>({
    resolver: zodResolver(parentRegistrationSchema),
    defaultValues: {
      parentFirstName: "",
      parentLastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      location: "",
      children: [defaultChildValues()],
    },
  });

  const { fields: childFields, append: appendChild, remove: removeChild } = useFieldArray({
    control: form.control,
    name: "children",
  });
  // Fetch school locations (using public endpoint - no auth required for registration)
  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ['/api/locations/public', school?.id],
    queryFn: async () => {
      if (!school?.id) return null;
      const response = await apiRequest("GET", `/api/locations/public?schoolId=${school.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch locations');
      }
      const data = await response.json();
      return data;
    },
    enabled: !!school?.id
  });

  const locations = locationsData || [];

  // Fetch school data if accessed with a registration code
  useEffect(() => {
    if (code) {
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
    }
  }, [code, toast, setLocation, form]);

  // Update default location when locations are loaded
  useEffect(() => {
    if (locations.length > 0 && !form.getValues("location")) {
      form.setValue("location", locations[0].id.toString());
    }
  }, [locations, form]);

  const onSubmit = async (data: ParentRegistrationForm) => {
    try {
      const childrenPayload: RegistrationSignupChildInput[] = data.children.map(
        (c) => ({
          firstName: c.firstName.trim(),
          lastName: c.lastName.trim(),
          birthdate: c.birthdate,
          gradeLevel: c.gradeLevel,
          ...(c.gender && c.gender.trim() ? { gender: c.gender.trim() } : {}),
        })
      );

      if (!school?.id || !school.registrationCode) {
        throw new Error("School registration code is required.");
      }

      const result = await registerParentWithChildren({
        email: data.email,
        password: data.password,
        parentFirstName: data.parentFirstName,
        parentLastName: data.parentLastName,
        phone: data.phone,
        location: data.location,
        schoolId: school.id,
        registrationCode: school.registrationCode,
        children: childrenPayload,
      });

      const childCount = result.createdChildren?.length ?? 0;

      toast({
        title: "Account Created Successfully!",
        description: "Signing you in and redirecting to your dashboard...",
      });

      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseAnonKey) {
          const supabase = createClient(supabaseUrl, supabaseAnonKey);

          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({
              email: data.email,
              password: data.password,
            });

          if (signInData?.user && !signInError) {
            sessionStorage.setItem(
              "newParentRegistration",
              JSON.stringify({
                schoolCode: code,
                schoolName: school?.name,
                registrationCompleted: true,
                childrenRegisteredCount: childCount,
              }),
            );

            toast({
              title: "Welcome to American Seekers Academy!",
              description:
                childCount > 0
                  ? `Your profile and ${childCount} student profile${childCount === 1 ? "" : "s"} are saved. Heading to your dashboard…`
                  : "Registration successful! Redirecting to your dashboard...",
            });

            setTimeout(() => {
              setLocation("/dashboard");
            }, 1500);
          } else {
            throw new Error(signInError?.message || "Sign in failed");
          }
        } else {
          throw new Error("Authentication system not available");
        }
      } catch (authError) {
        console.error("Auto sign-in failed:", authError);
        toast({
          title: "Account Created Successfully!",
          description: "Please sign in with your new account to continue.",
        });
        setLocation("/login");
      }
    } catch (error) {
      console.error("Registration error:", error);
      const message =
        error instanceof Error ? error.message : "Something went wrong. Please try again.";

      if (
        message.includes("already exists") ||
        message.includes("already registered")
      ) {
        toast({
          title: "Account Already Exists",
          description: "An account with this email already exists. Redirecting to login...",
          variant: "destructive",
        });
        setTimeout(() => setLocation("/login"), 2000);
        return;
      }

      toast({
        title: "Registration Error",
        description: message,
        variant: "destructive",
      });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Back button for school-specific registration */}
        {school && (
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setLocation(`/school/${code}`)}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to School Info
            </Button>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          {school ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Building className="h-8 w-8 text-primary" />
                <h1 className="text-4xl font-bold text-gray-900">
                  Register for {school.name}
                </h1>
              </div>
              {school.description && (
                <p className="text-xl text-gray-600">
                  {school.description}
                </p>
              )}
              <Badge variant="secondary" className="text-lg px-4 py-1">
                Registration Code: {school.registrationCode}
              </Badge>
            </div>
          ) : (
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                Fall 2025 Registration
              </h1>
              <p className="text-xl text-gray-600 mb-2">
                American Seekers Academy - Brighton Location
              </p>
              <p className="text-lg text-gray-500">
                Register your child for our classical education program
              </p>
            </div>
          )}
        </div>

        

        <Card>
          <CardHeader>
            <CardTitle>Parent Registration</CardTitle>
            <CardDescription>
              Create your guardian account and add your student profiles in one step. Your preferred campus is used for placement and session enrollment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="parentFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane" {...field} />
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
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane.doe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter a secure password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Confirm your password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferred Location</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger style={{ fontSize: '16px' }}>
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {locationsLoading ? (
                              <SelectItem value="_loading" disabled>Loading locations…</SelectItem>
                            ) : locations.length > 0 ? (
                              locations.map((location: any) => (
                                <SelectItem key={location.id} value={location.id.toString()}>
                                  {location.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="1">Brighton</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 border-t pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Student profiles</h3>
                      <p className="text-sm text-muted-foreground">
                        Add each child you plan to enroll. You can register more students later from your dashboard.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={childFields.length >= 10}
                      onClick={() => appendChild(defaultChildValues())}
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Add another student
                    </Button>
                  </div>

                  {childFields.map((fieldRow, index) => (
                    <div
                      key={fieldRow.id}
                      className="rounded-lg border border-border bg-muted/30 p-4 space-y-4"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-medium text-sm text-foreground">
                          Student {index + 1}
                        </span>
                        {childFields.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => removeChild(index)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`children.${index}.firstName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First name</FormLabel>
                              <FormControl>
                                <Input placeholder="First name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`children.${index}.lastName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last name</FormLabel>
                              <FormControl>
                                <Input placeholder="Last name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`children.${index}.birthdate`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Birthdate</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormDescription className="text-xs">
                                Date of birth
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`children.${index}.gradeLevel`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Grade level</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || undefined}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select grade" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {signupChildGradeOptions.map((g) => (
                                    <SelectItem key={g} value={g}>
                                      {g}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name={`children.${index}.gender`}
                        render={({ field }) => (
                          <FormItem className="max-w-xs">
                            <FormLabel>Gender (optional)</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Prefer not to say" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>



                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">After you submit</h3>
                  <p className="text-blue-700 text-sm">
                    We&apos;ll take you straight to your parent dashboard where you can:
                  </p>
                  <ul className="text-blue-700 text-sm mt-2 space-y-1">
                    <li>• Add emergency contacts when you&apos;re ready</li>
                    <li>• Browse classes and session enrollment</li>
                    <li>• Manage cart, payments, and schedules</li>
                  </ul>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={form.formState.isSubmitting}
                >
                  Create account &amp; student profiles
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}