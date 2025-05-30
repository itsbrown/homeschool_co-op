import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth0";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

// School data interface
interface SchoolData {
  id: number;
  name: string;
  type: string;
  address?: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email?: string;
  website?: string;
  logo?: string | null;
  description?: string;
  foundedYear?: number;
  accreditation?: string | null;
  enrollmentSize?: number;
  adminId: number;
  status: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string | Date;
}

// Form validation schema
const schoolFormSchema = z.object({
  name: z.string().min(3, "School name must be at least 3 characters"),
  type: z.string().min(2, "School type is required"),
  address: z.string().optional(),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  zipCode: z.string().min(5, "Valid ZIP code is required"),
  phoneNumber: z.string().optional(),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  description: z.string().optional(),
  foundedYear: z.coerce.number().min(1800, "Year must be valid").max(new Date().getFullYear(), "Year cannot be in the future").optional(),
  accreditation: z.string().optional(),
  enrollmentSize: z.coerce.number().min(0, "Enrollment must be a positive number").optional(),
});

export default function SchoolEditPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  // Fetch the school information for the logged-in school admin
  const { data: school, isLoading, error } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user,
    staleTime: 60000, // 1 minute stale time
  });

  // Setup form with validation
  const form = useForm<z.infer<typeof schoolFormSchema>>({
    resolver: zodResolver(schoolFormSchema),
    defaultValues: {
      name: school?.name || "",
      type: school?.type || "",
      address: school?.address || "",
      city: school?.city || "",
      state: school?.state || "",
      zipCode: school?.zipCode || "",
      phoneNumber: school?.phoneNumber || "",
      email: school?.email || "",
      website: school?.website || "",
      description: school?.description || "",
      foundedYear: school?.foundedYear || undefined,
      accreditation: school?.accreditation || "",
      enrollmentSize: school?.enrollmentSize || undefined,
    },
  });

  // Update form values when school data loads
  React.useEffect(() => {
    if (school) {
      form.reset({
        name: school.name,
        type: school.type,
        address: school.address || "",
        city: school.city,
        state: school.state,
        zipCode: school.zipCode,
        phoneNumber: school.phoneNumber || "",
        email: school.email || "",
        website: school.website || "",
        description: school.description || "",
        foundedYear: school.foundedYear,
        accreditation: school.accreditation || "",
        enrollmentSize: school.enrollmentSize,
      });
    }
  }, [school, form]);

  // Handle form submission to update school
  const updateSchoolMutation = useMutation({
    mutationFn: (data: z.infer<typeof schoolFormSchema>) => {
      return apiRequest("PATCH", `/api/school-admin/schools/${school?.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "School updated",
        description: "Your school information has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/my-school'] });
      setLocation("/schools/my-school");
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "There was an error updating your school information. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof schoolFormSchema>) => {
    updateSchoolMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Edit School">
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading school information...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !school) {
    return (
      <SchoolAdminLayout pageTitle="Edit School - Error">
        <div className="max-w-3xl mx-auto my-8">
          <Card>
            <CardHeader>
              <CardTitle>Error Loading School</CardTitle>
              <CardDescription>
                There was a problem loading your school information for editing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Please try again or contact an administrator for assistance.
              </p>
            </CardContent>
            <CardFooter>
              <Button onClick={() => setLocation("/schools/my-school")}>
                Return to School Profile
              </Button>
            </CardFooter>
          </Card>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Edit School">
      <div className="max-w-3xl mx-auto my-8">
        <Card>
          <CardHeader>
            <CardTitle>Edit School Information</CardTitle>
            <CardDescription>
              Update your school's profile information below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School Name*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School Type*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Provide a brief description of your school" 
                          rows={4}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-1">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City*</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                        <FormLabel>State*</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                        <FormLabel>ZIP Code*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="foundedYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Founded Year</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="enrollmentSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enrollment Size</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="accreditation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accreditation</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-4 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/schools/my-school")}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updateSchoolMutation.isPending}
                  >
                    {updateSchoolMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}