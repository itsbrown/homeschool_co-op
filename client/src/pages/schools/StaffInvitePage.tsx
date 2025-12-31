import React from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2 } from "lucide-react";

interface StaffPosition {
  id: number;
  title: string;
  description?: string;
  isDefault?: boolean;
}

interface Location {
  id: number;
  name: string;
}

interface ClassItem {
  id: number;
  title: string;
  gradeLevel?: string;
}

// Form schema for staff invitation
const inviteFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.string().min(1, "Please select a role"),
  locationId: z.string().min(1, "Please select a location"),
  classId: z.string().min(1, "Please select a class"),
  message: z.string().optional(),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

export default function StaffInvitePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch staff positions for dropdown with automatic updates
  const { data: staffPositions = [] } = useQuery<StaffPosition[]>({
    queryKey: ['/api/school-admin/staff-positions'],
    refetchInterval: 5000,
  });

  // Fetch all locations for the current school (uses auth middleware to get schoolId)
  const { data: locations = [] } = useQuery({
    queryKey: ['/api/locations'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/locations', {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch locations');
      }
      return response.json();
    },
    refetchInterval: 5000,
  });

  // Fetch all classes for selection
  const { data: allClassesList = [] } = useQuery({
    queryKey: ['/api/school-admin/classes?limit=1000'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/school-admin/classes?limit=1000', {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch classes');
      }
      const data = await response.json();
      return data.items || data.classes || [];
    },
    retry: false,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Set up form with validation
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "Mentor",
      locationId: "",
      classId: "",
      message: "",
    },
  });

  // Create invite mutation
  const inviteStaffMutation = useMutation({
    mutationFn: async (data: InviteFormValues) => {
      console.log("Sending invitation to:", data);
      
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/school-admin/staff/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send invitation');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation sent",
        description: "Your invitation has been sent successfully.",
      });
      
      // Invalidate staff queries to refresh staff lists everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
      queryClient.invalidateQueries({ queryKey: ['/api/staff'] });
      
      navigate("/schools/staff");
    },
    onError: (error: any) => {
      console.error("Staff invitation error:", error);
      toast({
        title: "Failed to send invitation",
        description: error?.message || "There was an error sending the invitation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (data: InviteFormValues) => {
    inviteStaffMutation.mutate(data);
  };

  return (
    <SchoolAdminLayout pageTitle="Invite Staff Member">
      <div className="container py-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Invite Staff Member</CardTitle>
            <CardDescription>
              Send an invitation to a new staff member to join your school
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name*</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Jane" />
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
                        <FormLabel>Last Name*</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Smith" />
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
                      <FormLabel>Email Address*</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="jane.smith@example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role*</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {staffPositions.map((position) => (
                            <SelectItem key={position.id} value={position.title}>
                              {position.title}
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
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location*</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locations.map((location: any) => (
                            <SelectItem key={location.id} value={location.id.toString()}>
                              {location.name}
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
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Class*</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allClassesList.map((classItem: any) => (
                            <SelectItem key={classItem.id} value={classItem.id.toString()}>
                              {classItem.title || classItem.className}
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
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal Message</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Add a personal message to your invitation..." 
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional: Include a personal message in the invitation email
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <CardFooter className="flex justify-between px-0 pb-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/schools/staff")}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={inviteStaffMutation.isPending}
                  >
                    {inviteStaffMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Send Invitation
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}