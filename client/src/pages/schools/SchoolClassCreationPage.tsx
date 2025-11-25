import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useSchoolAdmin } from "@/hooks/useSchoolAdmin";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, type Option } from "@/components/ui/multi-select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { Loader2 } from "lucide-react";
import { ClassVariants } from "@/components/admin/ClassVariants";
import { ClassInclusionsManager } from "@/components/admin/ClassInclusionsManager";

// Form schema for class creation
const classFormSchema = z.object({
  title: z.string().min(3, "Class title must be at least 3 characters long"),
  description: z.string().min(10, "Please provide a detailed description of at least 10 characters"),
  category: z.string().min(1, "Please select a category"),
  gradeLevels: z.array(z.string()).min(1, "Please select at least one grade level"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string().min(1, "Variant name is required"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    days: z.array(z.string()).min(1, "At least one day must be selected"),
    price: z.number().min(0, "Price must be a positive number")
  })).min(1, "At least one time option is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  locationId: z.coerce.number().int().min(1, "Location is required"),
  instructorName: z.string().min(1, "Instructor name is required"),
  status: z.string().min(1, "Please select a status"),
  isAdminOnly: z.boolean().default(false),
});

type ClassFormValues = z.infer<typeof classFormSchema>;

export default function SchoolClassCreationPage() {
  const [, navigate] = useLocation();
  const params = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditMode, setIsEditMode] = useState(false);
  const formInitialized = React.useRef(false);
  const [selectedInclusions, setSelectedInclusions] = useState<number[]>([]);
  
  // Get schoolId from authenticated user
  const { schoolId } = useSchoolAdmin();

  // Get class ID from URL if in edit mode
  const classId = params.id ? parseInt(params.id, 10) : undefined;
  
  // Set up form with validation
  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      gradeLevels: [],
      startDate: "",
      endDate: "",
      variants: [{
        id: 'default-variant',
        name: 'Main Session',
        startTime: '9:00 AM',
        endTime: '12:00 PM',
        days: ['Monday', 'Wednesday'],
        price: 5000
      }],
      capacity: 10,
      locationId: 0,
      instructorName: "",
      status: "upcoming",
      isAdminOnly: false,
    },
  });

  // Fetch class data if in edit mode using school-admin endpoint
  const { data: classData, isLoading: isLoadingClass } = useQuery({
    queryKey: ["/api/school-admin/classes", classId],
    enabled: !!classId, // Only run if classId exists
  });

  // Fetch available staff members for instructor selection
  const { data: staffMembers = [], isLoading: staffLoading } = useQuery({
    queryKey: ["/api/school-admin/staff"]
  });

  // Fetch locations for the school
  const { data: locationData = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/locations", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/locations?schoolId=${schoolId}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error('Failed to fetch locations');
      }
      return response.json();
    },
    enabled: !!schoolId
  });

  // Stabilize locations with useMemo to prevent infinite loops
  const locations = React.useMemo(() => locationData || [], [locationData]);

  // Fetch categories for the school
  const { data: categoriesData = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/school-admin/categories"],
    retry: false
  });

  // Stabilize categories and filter to only active ones
  // Note: Database returns snake_case (is_active), not camelCase (isActive)
  const categories = React.useMemo(() => 
    Array.isArray(categoriesData) 
      ? categoriesData.filter((cat: any) => cat.is_active !== false) 
      : [], 
    [categoriesData]
  );

  // Update form when class data is loaded
  useEffect(() => {
    if (classData && classId) {
      console.log('📝 SchoolClassCreationPage - classData received:', classData);
      console.log('📝 classData.variants:', classData.variants);
      
      // Wait for queries to finish loading before resetting form
      // This ensures dropdowns have loaded (even if empty) before matching values
      if (locationsLoading || staffLoading || categoriesLoading) {
        console.log('⏭️ Waiting for locations/staff/categories data to load...');
        return;
      }
      
      // Only allow first reset or when instructor data becomes available
      const shouldReset = !formInitialized.current || 
        (formInitialized.current && !form.getValues().instructorName && staffMembers.length > 0);
      
      if (!shouldReset) {
        console.log('⏭️ Skipping form reset - shouldReset is false');
        return;
      }
      
      if (!formInitialized.current) {
        setIsEditMode(true);
        formInitialized.current = true;
      }
      
      // Format dates properly for the form
      const startDate = classData.startDate ? 
        new Date(classData.startDate).toISOString().split('T')[0] : 
        "";
      const endDate = classData.endDate ? 
        new Date(classData.endDate).toISOString().split('T')[0] : 
        "";
      
      // Parse schedule to extract times
      // Example: "Monday, Wednesday, Friday 9am-2pm"
      let startTime = classData.startTime || "";
      let endTime = classData.endTime || "";
      
      if (classData.schedule && typeof classData.schedule === 'string' && !startTime && !endTime) {
        // Try to extract time from schedule string
        const timePattern = /(\d{1,2}(?::\d{2})?)([ap]m)?[-–](\d{1,2}(?::\d{2})?)([ap]m)/i;
        const match = classData.schedule.match(timePattern);
        
        if (match) {
          let start = match[1];
          let startPeriod = match[2] || '';
          let end = match[3];
          let endPeriod = match[4] || '';
          
          // Convert to 24-hour format for the time inputs
          if (startPeriod.toLowerCase() === 'pm' && !start.includes('12')) {
            const hour = parseInt(start.split(':')[0]);
            start = `${hour + 12}:${start.includes(':') ? start.split(':')[1] : '00'}`;
          } else if (startPeriod.toLowerCase() === 'am' && start.includes('12')) {
            start = start.replace('12', '00');
          } else if (!start.includes(':')) {
            start = start + ':00';
          }
          
          if (endPeriod.toLowerCase() === 'pm' && !end.includes('12')) {
            const hour = parseInt(end.split(':')[0]);
            end = `${hour + 12}:${end.includes(':') ? end.split(':')[1] : '00'}`;
          } else if (endPeriod.toLowerCase() === 'am' && end.includes('12')) {
            end = end.replace('12', '00');
          } else if (!end.includes(':')) {
            end = end + ':00';
          }
          
          startTime = start;
          endTime = end;
        }
      }
      
      // Find the instructor from staff members
      const instructor = staffMembers.find(
        staff => staff.instructorName === classData.instructorName || 
                staff.name === classData.instructorName ||
                staff.id === classData.instructorId
      );
      
      // Get the instructor name for the dropdown (dropdown uses name, not ID)
      const instructorValue = instructor 
        ? (instructor.name || `${instructor.firstName} ${instructor.lastName}`)
        : (classData.instructorName || "");
      
      // Get current grade levels to preserve them during instructor-only resets
      const currentGradeLevels = form.getValues().gradeLevels;
      const targetGradeLevels = currentGradeLevels && currentGradeLevels.length > 0
        ? currentGradeLevels
        : (Array.isArray(classData.gradeLevels) && classData.gradeLevels.length > 0
          ? classData.gradeLevels
          : (classData.gradeLevel ? [classData.gradeLevel] : []));
      
      // Handle backward compatibility: if locationId is missing, find it from location (string)
      let targetLocationId = classData.locationId || 0;
      if (!targetLocationId && classData.location && locations.length > 0) {
        const matchingLocation = locations.find((loc: any) => loc.name === classData.location);
        if (matchingLocation) {
          targetLocationId = matchingLocation.id;
          console.log(`🔄 Backward compatibility: Mapped location "${classData.location}" to locationId ${targetLocationId}`);
        }
      }
      
      form.reset({
        title: classData.title || "",
        description: classData.description || "",
        category: classData.category || "",
        gradeLevels: targetGradeLevels,
        startDate,
        endDate,
        variants: classData.variants || [{
          id: 'default-variant',
          name: 'Main Session',
          startTime: startTime || '9:00 AM',
          endTime: endTime || '12:00 PM',
          days: ['Monday', 'Wednesday'],
          price: classData.price || 5000
        }],
        capacity: classData.capacity || 10,
        locationId: targetLocationId,
        instructorName: instructorValue,
        status: classData.status || "upcoming",
        isAdminOnly: classData.isAdminOnly || false,
      });
      
      console.log('📍 Form reset with locationId:', targetLocationId, 'from classData.locationId:', classData.locationId, 'or location:', classData.location);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classData, classId, staffMembers, locations]);

  // Helper function to save class inclusions - returns count of failures
  const saveClassInclusions = async (parentClassId: number, inclusionIds: number[]): Promise<{ success: number; failed: number }> => {
    const token = localStorage.getItem("supabase_token");
    let successCount = 0;
    let failedCount = 0;
    
    for (const includedClassId of inclusionIds) {
      try {
        const response = await fetch("/api/class-inclusions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          credentials: "include",
          body: JSON.stringify({
            parentClassId,
            includedClassId,
          }),
        });
        
        if (response.ok) {
          successCount++;
        } else {
          failedCount++;
          console.error(`Failed to save inclusion for class ${includedClassId}: ${response.status}`);
        }
      } catch (error) {
        failedCount++;
        console.error(`Failed to save inclusion for class ${includedClassId}:`, error);
      }
    }
    
    return { success: successCount, failed: failedCount };
  };

  // Create class mutation
  const createClassMutation = useMutation({
    mutationFn: (data: ClassFormValues) => {
      return apiRequest("POST", "/school-admin/classes", data);
    },
    onSuccess: async (response: any) => {
      // Invalidate class caches immediately so the new class appears in lists
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes-list"] });
      
      // Save class inclusions if any were selected
      let inclusionResult = { success: 0, failed: 0 };
      if (selectedInclusions.length > 0 && response?.id) {
        inclusionResult = await saveClassInclusions(response.id, selectedInclusions);
        queryClient.invalidateQueries({ queryKey: ["/api/class-inclusions"] });
      }
      
      // Show appropriate message based on inclusion save results
      if (inclusionResult.failed > 0) {
        // Some inclusions failed - redirect to edit page so user can retry
        toast({
          title: "Class created - some inclusions failed",
          description: `Class created successfully, but ${inclusionResult.failed} of ${selectedInclusions.length} class inclusion(s) failed to save. Redirecting to edit page where you can add them again.`,
          variant: "destructive",
        });
        // Navigate to edit page for the newly created class so user can fix inclusions
        if (response?.id) {
          navigate(`/schools/classes/${response.id}/edit`);
        } else {
          navigate("/schools/classes");
        }
      } else {
        toast({
          title: "Class created successfully",
          description: selectedInclusions.length > 0 
            ? `Your new class has been added with ${inclusionResult.success} included class(es).`
            : "Your new class has been added to the system.",
        });
        navigate("/schools/classes");
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to create class",
        description: "There was an error creating your class. Please try again.",
        variant: "destructive",
      });
      console.error("Class creation error:", error);
    },
  });

  // Update class mutation
  const updateClassMutation = useMutation({
    mutationFn: (data: ClassFormValues) => {
      return apiRequest("PUT", `/school-admin/classes/${classId}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Class updated successfully",
        description: "Your class has been updated.",
      });
      // Invalidate all class-related caches to ensure UI updates everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes", classId] });
      navigate("/schools/classes");
    },
    onError: (error) => {
      toast({
        title: "Failed to update class",
        description: "There was an error updating your class. Please try again.",
        variant: "destructive",
      });
      console.error("Class update error:", error);
    },
  });

  // Handle form submission
  const onSubmit = (data: ClassFormValues) => {
    if (isEditMode && classId) {
      updateClassMutation.mutate(data);
    } else {
      createClassMutation.mutate(data);
    }
  };

  // Show loading state when fetching class data
  if (classId && isLoadingClass) {
    return (
      <SchoolAdminLayout pageTitle="Loading Class...">
        <div className="container py-6 h-[80vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading class data...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle={isEditMode ? "Edit Class" : "Create New Class"}>
      <div className="container py-6">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>{isEditMode ? "Edit Class" : "Create New Class"}</CardTitle>
            <CardDescription>
              {isEditMode 
                ? "Update the information for this class" 
                : "Add a new class to your school's offerings"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class Title*</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Introduction to American History"
                            data-testid="input-class-title" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          disabled={categoriesLoading}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder={categoriesLoading ? "Loading categories..." : "Select a category"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categoriesLoading ? (
                              <SelectItem value="loading" disabled>Loading categories...</SelectItem>
                            ) : categories.length === 0 ? (
                              <SelectItem value="no-categories" disabled>No categories available. Please add categories in Category Management.</SelectItem>
                            ) : (
                              categories.map((category: any) => (
                                <SelectItem 
                                  key={category.id} 
                                  value={category.name}
                                  data-testid={`option-category-${category.id}`}
                                >
                                  {category.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
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
                      <FormLabel>Description*</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Provide a detailed description of the class..." 
                          rows={5}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="gradeLevels"
                    render={({ field }) => {
                      const gradeOptions: Option[] = [
                        { label: "Littles", value: "littles" },
                        { label: "Pre K", value: "pre-k" },
                        { label: "Kindergarten", value: "kindergarten" },
                        { label: "1st Grade", value: "1st-grade" },
                        { label: "2nd Grade", value: "2nd-grade" },
                        { label: "3rd Grade", value: "3rd-grade" },
                        { label: "4th Grade", value: "4th-grade" },
                        { label: "5th Grade", value: "5th-grade" },
                        { label: "6th Grade", value: "6th-grade" },
                        { label: "7th Grade", value: "7th-grade" },
                        { label: "8th Grade", value: "8th-grade" },
                        { label: "9th Grade", value: "9th-grade" },
                        { label: "10th Grade", value: "10th-grade" },
                      ];
                      
                      return (
                        <FormItem>
                          <FormLabel>Grade Level*</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={gradeOptions}
                              selected={field.value || []}
                              onChange={field.onChange}
                              placeholder="Select grade levels"
                              className="w-full"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="upcoming">Upcoming</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isAdminOnly"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Admin Only Class</FormLabel>
                          <FormDescription>
                            When enabled, this class will only be visible to administrators and will not appear in public class listings for parents and students.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date*</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date*</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field}
                            data-testid="input-end-date" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Class Time Options / Variants */}
                <FormField
                  control={form.control}
                  name="variants"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ClassVariants
                          variants={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Add different scheduling options with individual pricing (e.g., "Half Day 9-12pm ($50) OR Full Day 9-3pm ($85)")
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacity*</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} min={1} />
                        </FormControl>
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
                          onValueChange={(value) => field.onChange(parseInt(value, 10))} 
                          value={field.value ? String(field.value) : ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a location" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {locations.map((location) => (
                              <SelectItem key={location.id} value={String(location.id)}>
                                {location.name}
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
                  name="instructorName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructor</FormLabel>
                      <div className="flex gap-2">
                        <Select 
                          value={field.value || ""} 
                          onValueChange={field.onChange}
                          disabled={staffLoading}
                        >
                          <FormControl>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder={staffLoading ? "Loading staff..." : "Select an instructor"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="no-instructor">No Instructor Assigned</SelectItem>
                            {staffMembers.map((staff: any, index: number) => {
                              const staffName = staff.name || `${staff.firstName} ${staff.lastName}`;
                              return (
                                <SelectItem 
                                  key={`staff-${staff.id}`} 
                                  value={staffName}
                                >
                                  {staffName}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {field.value && field.value !== "no-instructor" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => field.onChange("no-instructor")}
                            title="Clear instructor assignment"
                          >
                            ×
                          </Button>
                        )}
                      </div>
                      <FormDescription>
                        Choose from available staff members or leave unassigned
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Class Inclusions Section */}
                <ClassInclusionsManager
                  classId={classId}
                  selectedInclusions={selectedInclusions}
                  onInclusionsChange={setSelectedInclusions}
                  isEditMode={isEditMode}
                />

                <CardFooter className="flex justify-between px-0 pb-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/schools/classes")}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={isEditMode ? updateClassMutation.isPending : createClassMutation.isPending}
                  >
                    {(isEditMode ? updateClassMutation.isPending : createClassMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {isEditMode ? "Update Class" : "Create Class"}
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