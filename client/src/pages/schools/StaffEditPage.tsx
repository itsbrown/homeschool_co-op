import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Trash2, BookOpen, Plus, X, GraduationCap, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { apiRequest, parseApiErrorMessage } from "@/lib/queryClient";
import { formatClassSchedule } from "@/lib/utils";

// Phone validation: optional, but if provided must be 10-digit or 11-digit starting with 1
const phoneSchema = z.string().optional().nullable().refine(
  (val) => {
    if (!val) return true;
    const digits = val.replace(/\D/g, '');
    return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  },
  { message: 'Invalid US phone number. Must be a 10-digit number or 11-digit number starting with 1.' }
);

const staffEditSchema = z.object({
  name: z.string().optional(),
  email: z.union([z.string().email("Invalid email address"), z.literal("")]).optional(),
  phone: phoneSchema,
  role: z.string().optional(),
  locationId: z.union([z.string(), z.number()]).optional().nullable(),
});

type StaffFormValues = z.infer<typeof staffEditSchema>;

interface StaffMember {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  locationId: string | number | null;
  department?: string;
  subjects: string[];
  status: string;
  joinDate: string;
  avatar: string;
  firstName?: string;
  lastName?: string;
  userId?: number;
  classIds?: number[] | string[];
  hasPendingInvitation?: boolean;
}

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
  schedule?: string;
  location?: string;
  status?: string;
}

interface ClassesResponse {
  items: ClassItem[];
  total?: number;
}

export default function StaffEditPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffEditSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "",
      locationId: null,
    },
  });

  // Fetch staff member data
  const { data: staffMember, isLoading } = useQuery<StaffMember>({
    queryKey: ['/api/school-admin/staff', id],
    enabled: !!id,
  });

  // Fetch staff positions
  const { data: staffPositionsData } = useQuery<StaffPosition[]>({
    queryKey: ['/api/school-admin/staff-positions'],
  });
  const staffPositions = Array.isArray(staffPositionsData) ? staffPositionsData : [];

  // Fetch all locations
  const { data: locationsData } = useQuery<Location[]>({
    queryKey: ['/api/locations']
  });
  const locations = Array.isArray(locationsData) ? locationsData : [];

  // Fetch assigned classes for this staff member
  const { data: assignedClassesData, isLoading: classesLoading } = useQuery<ClassItem[]>({
    queryKey: ['/api/school-admin/staff', id, 'classes'],
    enabled: !!id,
  });
  const assignedClasses = Array.isArray(assignedClassesData) ? assignedClassesData : [];

  // Fetch all available classes for assignment
  const { data: allClassesData } = useQuery<ClassesResponse | ClassItem[]>({
    queryKey: ['/api/school-admin/classes']
  });
  
  // Extract items array from response (API returns { items: [], total, ... })
  const allClasses = Array.isArray(allClassesData)
    ? allClassesData
    : Array.isArray(allClassesData?.items)
      ? allClassesData.items
      : [];

  // Update form when data is loaded — only schema fields. Dumping the GET payload
  // used to include classIds as strings, which failed z.array(z.number()) with no
  // visible FormMessage (classIds is not a field on this form).
  useEffect(() => {
    if (staffMember) {
      form.reset({
        name: staffMember.name ?? "",
        email: staffMember.email ?? "",
        phone: staffMember.phone ?? "",
        role: staffMember.role ?? "",
        locationId: staffMember.locationId ?? null,
      });
    }
  }, [staffMember, form]);

  // Update staff member mutation
  const updateStaffMutation = useMutation({
    mutationFn: async (data: StaffFormValues) => {
      const res = await apiRequest("PUT", `/api/school-admin/staff/${id}`, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        locationId: data.locationId,
      });
      return res.json();
    },
    onSuccess: (response: { staff?: StaffMember }) => {
      const updatedStaff = response?.staff;
      
      toast({
        title: "Success",
        description: "Staff member updated successfully",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff'] });
      if (updatedStaff) {
        queryClient.setQueryData(['/api/school-admin/staff', id], updatedStaff);
      }
      navigate('/schools/staff');
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseApiErrorMessage(error, "Failed to update staff member"),
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

  const onSubmit = (data: StaffFormValues) => {
    updateStaffMutation.mutate(data);
  };

  const onInvalid = () => {
    toast({
      title: "Couldn't save",
      description: "Check the highlighted fields and try again.",
      variant: "destructive",
    });
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
  const assignedClassIds = assignedClasses.map((cls) => cls.id);
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
                <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
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
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                placeholder="Enter phone number"
                              />
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
                            <FormLabel>Location</FormLabel>
                            <Select
                              onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                              value={field.value != null && field.value !== "" ? String(field.value) : "none"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No campus</SelectItem>
                                {locations.map((location) => (
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

                      <div className="space-y-2">
                        <Label>Status</Label>
                        <div className="pt-1">
                          <Badge variant={staffMember?.status === "Pending" ? "secondary" : "default"}>
                            {staffMember?.status || "Active"}
                          </Badge>
                          {staffMember?.hasPendingInvitation ? (
                            <p className="text-sm text-muted-foreground mt-2">
                              Pending until they accept the invitation.
                            </p>
                          ) : null}
                        </div>
                      </div>
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
                        data-testid="button-save-staff-changes"
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
                          {unassignedClasses.map((cls) => (
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
                  {assignedClasses.map((cls) => (
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
                                  {formatClassSchedule(cls.schedule)}
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