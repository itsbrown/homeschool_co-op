import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, Users } from "lucide-react";

// Child registration form schema
const childFormSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters" }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters" }),
  birthDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Please enter a valid date"
  }),
  gradeLevel: z.string().min(1, { message: "Grade level is required" }),
  specialNeeds: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  healthNotes: z.string().optional().nullable(),
});

type ChildFormValues = z.infer<typeof childFormSchema>;

export default function ChildRegistrationPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use useEffect for auth redirects instead of doing it in render
  useEffect(() => {
    // If not authenticated, redirect to login
    if (!isLoading && !user) {
      setTimeout(() => {
        setLocation("/login");
      }, 0);
    }
    // Verify user is a parent
    else if (user && user.role !== "parent") {
      toast({
        title: "Access Denied",
        description: "Only parent accounts can register children.",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/dashboard");
      }, 0);
    }
  }, [isLoading, user, toast, setLocation]);

  const form = useForm<ChildFormValues>({
    resolver: zodResolver(childFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthdate: "",
      gradeLevel: "",
      school: "",
      specialNeeds: "",
      allergies: "",
      medicalInfo: "",
      learningStyle: null,
      interests: [],
      profileImage: null,
    },
  });

  const onSubmit = async (data: ChildFormValues) => {
    setIsSubmitting(true);
    try {
      // Store the form data in sessionStorage for confirmation page
      sessionStorage.setItem('childRegistrationData', JSON.stringify(data));
      
      // Navigate to confirmation page
      setLocation("/children/register/confirm");
    } catch (error) {
      console.error("Error processing form:", error);
      toast({
        title: "Error",
        description: "There was a problem with your submission. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const gradeLevels = [
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
  ];

  return (
    <AppShell>
      <div className="container mx-auto p-4 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Register Child</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Register a Child</h1>
            <p className="text-muted-foreground">
              Enter your child's information to register them for programs
            </p>
          </div>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Child Information</CardTitle>
            <CardDescription>
              Please provide accurate information about your child. This information will be used for registration and program enrollment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="First name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Birth Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="gradeLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade Level</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select grade level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {gradeLevels.map((grade) => (
                              <SelectItem key={grade} value={grade}>
                                {grade}
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
                  name="allergies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allergies</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List any allergies or sensitivities (if none, leave blank)"
                          className="resize-none"
                          {...field}
                          value={field.value || ""}
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
                          placeholder="Describe any special needs or required accommodations (if none, leave blank)"
                          className="resize-none"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="healthNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Health Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional health information we should know about (if none, leave blank)"
                          className="resize-none"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setLocation("/dashboard")}
            >
              Cancel
            </Button>
            <Button 
              onClick={form.handleSubmit(onSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Processing..." : "Continue to Review"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}