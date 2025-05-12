import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Redirect, useLocation, useRoute, Link } from "wouter";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MultiSelect } from "@/components/ui/multi-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

const interestOptions = [
  { label: "Science", value: "Science" },
  { label: "Math", value: "Math" },
  { label: "Reading", value: "Reading" },
  { label: "Writing", value: "Writing" },
  { label: "Art", value: "Art" },
  { label: "Music", value: "Music" },
  { label: "Sports", value: "Sports" },
  { label: "Technology", value: "Technology" },
  { label: "Nature", value: "Nature" },
  { label: "History", value: "History" },
  { label: "Geography", value: "Geography" },
  { label: "Cooking", value: "Cooking" },
];

const learningStyleOptions = [
  { label: "Visual", value: "Visual" },
  { label: "Auditory", value: "Auditory" },
  { label: "Kinesthetic", value: "Kinesthetic" },
  { label: "Reading/Writing", value: "Reading/Writing" },
  { label: "Multimodal", value: "Multimodal" },
];

const gradeLevelOptions = [
  "Pre-K", "Kindergarten", 
  "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade",
  "6th Grade", "7th Grade", "8th Grade",
  "9th Grade", "10th Grade", "11th Grade", "12th Grade"
];

const childProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  birthdate: z.string().min(1, "Birth date is required"),
  school: z.string().optional(),
  gradeLevel: z.string().min(1, "Grade level is required"),
  learningStyle: z.string().optional(),
  interests: z.array(z.string()).optional(),
  allergies: z.string().optional(),
  specialNeeds: z.string().optional(),
  medicalInfo: z.string().optional(),
});

type ChildProfileFormValues = z.infer<typeof childProfileSchema>;

export default function ChildProfileEditPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [match, params] = useRoute<{ id: string }>("/children/:id/edit");
  
  const childId = params?.id ? parseInt(params.id) : null;
  
  // Check if user is parent
  const isParent = user?.role === "parent";
  
  // If not authenticated or not parent, redirect to login
  if (!isLoading && (!isAuthenticated || !isParent)) {
    return <Redirect to="/login" />;
  }
  
  // Fetch child data
  const { data: child, isLoading: isLoadingChild } = useQuery({
    queryKey: [`/api/children/${childId}`],
    enabled: !!childId && isAuthenticated,
  });
  
  // Initialize form with validation
  const form = useForm<ChildProfileFormValues>({
    resolver: zodResolver(childProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthdate: "",
      school: "",
      gradeLevel: "",
      learningStyle: "",
      interests: [],
      allergies: "",
      specialNeeds: "",
      medicalInfo: "",
    },
  });
  
  // Update form values when child data is loaded
  useEffect(() => {
    if (child) {
      form.reset({
        firstName: child.firstName || "",
        lastName: child.lastName || "",
        birthdate: child.birthdate ? new Date(child.birthdate).toISOString().split("T")[0] : "",
        school: child.school || "",
        gradeLevel: child.gradeLevel || "",
        learningStyle: child.learningStyle || "",
        interests: child.interests || [],
        allergies: child.allergies || "",
        specialNeeds: child.specialNeeds || "",
        medicalInfo: child.medicalInfo || "",
      });
    }
  }, [child, form]);
  
  // Handle form submission
  const onSubmit = async (data: ChildProfileFormValues) => {
    try {
      if (!childId) {
        toast({
          title: "Error",
          description: "Child ID is missing",
          variant: "destructive",
        });
        return;
      }
      
      await apiRequest("PATCH", `/api/children/${childId}`, data);
      
      toast({
        title: "Success",
        description: "Child profile updated successfully",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [`/api/children/${childId}`],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/children"],
      });
      
      // Redirect to children page
      setLocation("/children");
    } catch (error) {
      console.error("Error updating child profile:", error);
      toast({
        title: "Error",
        description: "Failed to update child profile",
        variant: "destructive",
      });
    }
  };
  
  if (!match) {
    return <Redirect to="/children" />;
  }
  
  return (
    <DashboardShell>
      <div className="container py-10 max-w-5xl">
        <div className="flex items-center mb-8">
          <Button variant="ghost" size="sm" asChild className="mr-4">
            <Link href="/children">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Children
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Child Profile</h1>
            <p className="text-muted-foreground">
              Update your child's profile information
            </p>
          </div>
        </div>
        
        {isLoadingChild ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Child Profile Details</CardTitle>
              <CardDescription>
                Update your child's personal and educational information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    
                    <FormField
                      control={form.control}
                      name="birthdate"
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
                      name="school"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>School</FormLabel>
                          <FormControl>
                            <Input placeholder="School name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="gradeLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grade Level</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select grade level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {gradeLevelOptions.map((grade) => (
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
                    
                    <FormField
                      control={form.control}
                      name="learningStyle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Learning Style</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select learning style" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {learningStyleOptions.map((style) => (
                                <SelectItem key={style.value} value={style.value}>
                                  {style.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            How does your child prefer to learn?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="interests"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Interests</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={interestOptions}
                              selected={field.value || []}
                              onChange={field.onChange}
                              placeholder="Select interests"
                            />
                          </FormControl>
                          <FormDescription>
                            What subjects and activities does your child enjoy?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="allergies"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Allergies</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="List any allergies"
                              className="resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            List any allergies we should be aware of
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="specialNeeds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Special Needs</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Any special needs or accommodations"
                              className="resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Any special needs or accommodations we should provide
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="medicalInfo"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Additional Medical Information</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Any additional medical information"
                              className="resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Any other medical information we should know about
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="flex justify-end">
                    <Button type="submit">
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}