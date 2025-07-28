import React, { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, MapPin, Clock, Users, DollarSign, Building, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Schema for parent registration - simplified to only parent info
const parentRegistrationSchema = z.object({
  parentFirstName: z.string().min(1, "First name is required"),
  parentLastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Phone number is required"),
  location: z.string().min(1, "Location selection is required"),
});

type ParentRegistrationForm = z.infer<typeof parentRegistrationSchema>;

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
      location: "Brighton"
    }
  });

  // Fetch school data if accessed with a registration code
  useEffect(() => {
    if (code) {
      const fetchSchool = async () => {
        try {
          const response = await apiRequest("GET", `/api/schools/by-code/${code}`);
          
          if (response.ok) {
            const schoolData = await response.json();
            setSchool(schoolData);
            // Update default location if school has one
            if (schoolData.location) {
              form.setValue("location", schoolData.location);
            }
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

  const onSubmit = async (data: ParentRegistrationForm) => {
    try {
      // Create parent account
      const response = await apiRequest("POST", "/api/auth/register", {
        ...data,
        role: 'parent',
        schoolId: school?.id || null,
        registrationCode: school?.registrationCode || null
      });

      if (response.ok) {
        const result = await response.json();
        
        toast({
          title: "Registration Successful!",
          description: "Welcome to American Seekers Academy. You can now add your children and enroll them in classes.",
        });

        // Store parent info for potential use
        sessionStorage.setItem('parentRegistrationData', JSON.stringify({
          ...data,
          school: school || null,
          registrationCode: school?.registrationCode || null,
          schoolId: school?.id || null
        }));

        // Redirect to dashboard where they can add children
        setLocation('/dashboard');
      } else {
        const error = await response.json();
        toast({
          title: "Registration Failed",
          description: error.message || "Please try again",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
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
              <p className="text-xl text-gray-600">
                Complete your registration for Fall 2025
              </p>
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
              Enter your information to create your account. You'll be able to add your children and enroll them in classes from your dashboard.
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

                <div className="grid md:grid-cols-2 gap-4">
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
                </div>

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Location</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Brighton">Brighton</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Next Steps</h3>
                  <p className="text-blue-700 text-sm">
                    After creating your account, you'll be taken to your dashboard where you can:
                  </p>
                  <ul className="text-blue-700 text-sm mt-2 space-y-1">
                    <li>• Add your children's information</li>
                    <li>• Browse available classes</li>
                    <li>• Enroll your children in programs</li>
                    <li>• Manage payments and schedules</li>
                  </ul>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                >
                  Create Account & Continue to Dashboard
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}