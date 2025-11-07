import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Trash2, BookOpen, Plus, X, GraduationCap, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  locationId: string | null;
  department?: string;
  subjects: string[];
  status: string;
  joinDate: string;
  avatar: string;
  firstName?: string;
  lastName?: string;
  userId?: number;
  classIds?: number[];
}

export default function StaffEditPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  const form = useForm<StaffMember>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "",
      locationId: null,
      department: "",
      subjects: [],
      status: "Active",
      joinDate: "",
      avatar: "",
      classIds: [],
    },
  });

  // Fetch staff member data
  const { data: staffMember, isLoading } = useQuery({
    queryKey: ['/api/school-admin/staff', id],
    enabled: !!id,
  });

  // Fetch staff positions
  const { data: staffPositions } = useQuery({
    queryKey: ['/api/school-admin/staff-positions'],
  });

  // Fetch all locations
  const { data: locations = [] } = useQuery({
    queryKey: ['/api/locations']
  });

  // Fetch all classes for selection
  const { data: allClassesList = [] } = useQuery({
    queryKey: ['/api/school-admin/classes-list']
  });

  // Fetch assigned classes for this staff member
  const { data: assignedClasses = [], isLoading: classesLoading } = useQuery({
    queryKey: ['/api/school-admin/staff', id, 'classes'],
    enabled: !!id,
  });

  // Fetch all available classes for assignment
  const { data: allClassesData } = useQuery({
    queryKey: ['/api/school-admin/classes']
  });
  
  // Extract items array from response (API returns { items: [], total, ... })
  const allClasses = allClassesData?.items || [];

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
    onSuccess: (updatedStaff) => {
      toast({
        title: "Success",
        description: "Staff member updated successfully",
      });
      // Synchronously update the staff list cache
      queryClient.setQueryData(['/api/school-admin/staff'], (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((staff: any) => 
          staff.id === updatedStaff.id ? updatedStaff : staff
        );
      });
      // Also update the individual staff member cache
      queryClient.setQueryData(['/api/school-admin/staff', id], updatedStaff);
      // Navigate immediately - cache is already updated
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
      // Synchronously remove from staff list cache (convert id to number for comparison)
      const staffIdNum = parseInt(id as string, 10);
      queryClient.setQueryData(['/api/school-admin/staff'], (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.filter((staff: any) => staff.id !== staffIdNum);
      });
      // Navigate immediately - cache is already updated
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

  // Assign staff to class mutation
  const assignClassMutation = useMutation({
    mutationFn: async (classId: number) => {
      return await apiRequest("POST", `/api/school-admin/staff/${id}/assign-class`, { classId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Staff member assigned to class successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff', id, 'classes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/classes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/classes-list'] });
      setShowAssignDialog(false);
      setSelectedClassId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign staff to class",
        variant: "destructive",
      });
    },
  });

  // Unassign staff from class mutation
  const unassignClassMutation = useMutation({
    mutationFn: async (classId: number) => {
      return await apiRequest("DELETE", `/api/school-admin/staff/${id}/unassign-class/${classId}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Staff member unassigned from class successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff', id, 'classes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/classes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/classes-list'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unassign staff from class",
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

  const handleAssignClass = () => {
    if (selectedClassId) {
      assignClassMutation.mutate(selectedClassId);
    }
  };

  const handleUnassignClass = (classId: number, className: string) => {
    if (confirm(`Are you sure you want to unassign this staff member from "${className}"?`)) {
      unassignClassMutation.mutate(classId);
    }
  };

  // Get unassigned classes for assignment dialog
  const assignedClassIds = assignedClasses.map((cls: any) => cls.id);
  const unassignedClasses = allClasses.filter((cls: any) => !assignedClassIds.includes(cls.id));

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
                            <Select onValueChange={field.onChange} value={field.value || ""}>
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
                        name="locationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {locations?.map((location: any) => (
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

          {/* Class Assignment Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Class Assignments
                  </CardTitle>
                  <CardDescription>
                    Manage which classes this staff member is assigned to teach
                  </CardDescription>
                </div>
                <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={unassignedClasses.length === 0}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Assign to Class
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign to Class</DialogTitle>
                      <DialogDescription>
                        Select a class to assign {staffMember?.name} as the instructor.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Select 
                        value={selectedClassId?.toString() || ""} 
                        onValueChange={(value) => setSelectedClassId(parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a class" />
                        </SelectTrigger>
                        <SelectContent>
                          {unassignedClasses.map((cls: any) => (
                            <SelectItem key={cls.id} value={cls.id.toString()}>
                              {cls.title} - {cls.gradeLevel}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowAssignDialog(false);
                          setSelectedClassId(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAssignClass}
                        disabled={!selectedClassId || assignClassMutation.isPending}
                      >
                        {assignClassMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Assign
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {classesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading assigned classes...</span>
                </div>
              ) : assignedClasses.length > 0 ? (
                <div className="space-y-3">
                  {assignedClasses.map((cls: any) => (
                    <div 
                      key={cls.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <GraduationCap className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <h4 className="font-medium">{cls.title}</h4>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span>Grade: {cls.gradeLevel}</span>
                              {cls.schedule && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {cls.schedule}
                                </span>
                              )}
                              {cls.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {cls.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{cls.status || 'Active'}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnassignClass(cls.id, cls.title)}
                          disabled={unassignClassMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Classes Assigned</h3>
                  <p className="text-muted-foreground mb-4">
                    This staff member is not currently assigned to any classes.
                  </p>
                  {unassignedClasses.length > 0 && (
                    <Button 
                      variant="outline" 
                      onClick={() => setShowAssignDialog(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Assign to Class
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}