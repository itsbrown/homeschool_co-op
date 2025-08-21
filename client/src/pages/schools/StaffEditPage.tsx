import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { apiRequest } from "@/lib/queryClient";

interface StaffMember {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  subjects: string[];
  status: string;
  joinDate: string;
  avatar: string;
}

export default function StaffEditPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<StaffMember>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "",
      department: "",
      subjects: [],
      status: "Active",
      joinDate: "",
      avatar: "",
    },
  });

  // Fetch staff member data
  const { data: staffMember, isLoading } = useQuery({
    queryKey: ['/api/school-admin/staff', id],
    queryFn: async () => {
      const response = await fetch(`/api/school-admin/staff/${id}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch staff member');
      }
      
      return await response.json();
    },
    enabled: !!id,
  });

  // Fetch staff positions
  const { data: staffPositions } = useQuery({
    queryKey: ['/api/school-admin/staff-positions'],
    queryFn: async () => {
      const response = await fetch('/api/school-admin/staff-positions', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch staff positions');
      }
      
      return await response.json();
    },
  });

  // Update form when data is loaded
  useEffect(() => {
    if (staffMember) {
      form.reset(staffMember);
    }
  }, [staffMember, form]);

  // Update staff member mutation
  const updateStaffMutation = useMutation({
    mutationFn: async (data: StaffMember) => {
      return await apiRequest("PUT", `/api/school-admin/staff/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Staff member updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
      navigate('/schools/staff');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update staff member",
        variant: "destructive",
      });
    },
  });

  // Delete staff member mutation
  const deleteStaffMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/school-admin/staff/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Staff member removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
      navigate('/schools/staff');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove staff member",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StaffMember) => {
    updateStaffMutation.mutate(data);
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to remove this staff member? This action cannot be undone.")) {
      deleteStaffMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Edit Staff Member">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading staff member...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Edit Staff Member">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/schools/staff')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Staff
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Edit Staff Member</CardTitle>
              <CardDescription>
                Update the staff member's information and role details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Basic Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Basic Information</h3>
                      
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter full name" />
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
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="Enter email address" />
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
                              <Input {...field} placeholder="Enter phone number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Role Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Role Information</h3>
                      
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {staffPositions?.map((position: any) => (
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
                        name="department"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Department</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Mathematics">Mathematics</SelectItem>
                                <SelectItem value="English">English</SelectItem>
                                <SelectItem value="Science">Science</SelectItem>
                                <SelectItem value="History">History</SelectItem>
                                <SelectItem value="Arts">Arts</SelectItem>
                                <SelectItem value="Physical Education">Physical Education</SelectItem>
                                <SelectItem value="Administration">Administration</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Inactive">Inactive</SelectItem>
                                <SelectItem value="On Leave">On Leave</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-between pt-6">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleteStaffMutation.isPending}
                    >
                      {deleteStaffMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Remove Staff Member
                    </Button>

                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/schools/staff')}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={updateStaffMutation.isPending}
                      >
                        {updateStaffMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}