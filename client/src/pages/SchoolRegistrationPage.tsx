import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import AppShell from "@/components/layout/AppShell";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, Building, School } from "lucide-react";

// School registration form schema
const schoolFormSchema = z.object({
  name: z.string().min(2, { message: "School name must be at least 2 characters" }),
  type: z.enum(["school", "co-op", "homeschool_group", "other"]),
  address: z.string().optional().nullable(),
  city: z.string().min(1, { message: "City is required" }),
  state: z.string().min(1, { message: "State/Province is required" }),
  zipCode: z.string().min(1, { message: "Zip/Postal code is required" }),
  phoneNumber: z.string().optional().nullable(),
  email: z.string().email({ message: "Please enter a valid email address" }),
  website: z.string().url({ message: "Please enter a valid URL" }).optional().nullable(),
  description: z.string().optional().nullable(),
  foundedYear: z.number().int().positive().optional().nullable(),
  accreditation: z.string().optional().nullable(),
  enrollmentSize: z.number().int().positive().optional().nullable(),
});

type SchoolFormValues = z.infer<typeof schoolFormSchema>;

export default function SchoolRegistrationPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if user is not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      toast({
        title: "Authentication required",
        description: "Please log in to register a school.",
      });
      setTimeout(() => {
        setLocation("/login");
      }, 0);
    }
  }, [isLoading, user, toast, setLocation]);

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolFormSchema),
    defaultValues: {
      name: "American Seekers Academy",
      type: "co-op",
      address: "",
      city: "Rochester",
      state: "NY",
      zipCode: "14618",
      phoneNumber: "",
      email: "info@americanseekersacademy.org",
      website: "https://americanseekersacademy.org",
      description: "American Seekers Academy (ASA) is a private, drop-off homeschool cooperative designed by homeschooling parents to provide a classical education rooted in the Trivium and Quadrivium. Inspired by Hillsdale Academy, ASA offers a structured, 10-week program for grades K-12, emphasizing liberty, capitalism, and American values through vetted curricula from sources like Hillsdale College, Tuttle Twins, and PragerU Kids. Open to all faiths, it integrates the role of the Creator in America's founding without teaching religious doctrine. ASA fosters civic virtue, academic excellence, and personal responsibility, operating as a Private Membership Association to ensure parental rights and privacy. Classes are held Monday, Wednesday, and Friday, focusing on literacy, history, financial literacy, and the arts, cultivating confident, well-rounded students prepared for intellectual and personal growth.",
      foundedYear: 2025,
      accreditation: "Private Membership Association",
      enrollmentSize: 75,
    },
  });

  const onSubmit = async (data: SchoolFormValues) => {
    setIsSubmitting(true);
    try {
      // Submit school registration to API
      const response = await apiRequest("POST", "/api/schools", data);
      const result = await response.json();
      
      // Show success message
      toast({
        title: "Registration Submitted",
        description: "Your school registration has been submitted for review.",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/schools"] });
      
      // Redirect to confirmation page
      setLocation("/schools/register/confirm");
    } catch (error) {
      console.error("Error registering school:", error);
      toast({
        title: "Registration Failed",
        description: "There was a problem submitting your school registration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <BreadcrumbPage>Register School/Co-op</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <School className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Register Your School or Co-op</h1>
            <p className="text-muted-foreground">
              Join our platform to access educational resources and tools for your institution
            </p>
          </div>
        </div>

        <Card className="max-w-3xl mx-auto shadow-md">
          <CardHeader>
            <CardTitle>School/Co-op Information</CardTitle>
            <CardDescription>
              Please provide details about your educational institution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Institution Name */}
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Institution Name*</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your school/co-op name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Type */}
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Institution Type*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="school">School</SelectItem>
                            <SelectItem value="co-op">Co-op</SelectItem>
                            <SelectItem value="homeschool_group">Homeschool Group</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Founded Year */}
                  <FormField
                    control={form.control}
                    name="foundedYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year Founded</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g., 1990"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value === "" ? null : parseInt(e.target.value, 10);
                              field.onChange(value);
                            }}
                            value={field.value === null ? "" : field.value}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Address */}
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="Street address" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* City */}
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City*</FormLabel>
                        <FormControl>
                          <Input placeholder="City" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* State/Province */}
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State/Province*</FormLabel>
                        <FormControl>
                          <Input placeholder="State/Province" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Zip/Postal Code */}
                  <FormField
                    control={form.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Zip/Postal Code*</FormLabel>
                        <FormControl>
                          <Input placeholder="Zip/Postal code" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Phone Number */}
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Phone number" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Email */}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email*</FormLabel>
                        <FormControl>
                          <Input placeholder="Contact email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Website */}
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://yourschool.edu" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Accreditation */}
                  <FormField
                    control={form.control}
                    name="accreditation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accreditation</FormLabel>
                        <FormControl>
                          <Input placeholder="Accreditation bodies" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Enrollment Size */}
                  <FormField
                    control={form.control}
                    name="enrollmentSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enrollment Size</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Number of students"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value === "" ? null : parseInt(e.target.value, 10);
                              field.onChange(value);
                            }}
                            value={field.value === null ? "" : field.value}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Description */}
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Tell us about your school or co-op"
                              className="min-h-[120px]"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Include information about your educational approach, mission, or any special programs
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setLocation("/dashboard")}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Submitting..." : "Register School"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}