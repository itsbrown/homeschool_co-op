import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { Loader2 } from "lucide-react";

// Form schema for class creation
const classFormSchema = z.object({
  title: z.string().min(3, "Class title must be at least 3 characters long"),
  description: z.string().min(10, "Please provide a detailed description of at least 10 characters"),
  category: z.string().min(1, "Please select a category"),
  gradeLevel: z.string().min(1, "Please select a grade level"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  schedule: z.string().min(1, "Schedule information is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  location: z.string().min(1, "Location is required"),
  instructorName: z.string().min(1, "Instructor name is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
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
  const [locations, setLocations] = useState<{id: number, name: string}[]>([]);

  // Get class ID from URL if in edit mode
  const classId = params.id ? parseInt(params.id, 10) : undefined;
  
  // Set up form with validation
  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      gradeLevel: "",
      startDate: "",
      endDate: "",
      schedule: "",
      startTime: "",
      endTime: "",
      capacity: 10,
      location: "",
      instructorName: "",
      price: 0,
      status: "upcoming",
      isAdminOnly: false,
    },
  });

  // Fetch class data if in edit mode using direct endpoint
  const { data: classData, isLoading: isLoadingClass } = useQuery({
    queryKey: ["/api/class-details", classId],
    queryFn: async () => {
      const response = await fetch(`/api/class-details/${classId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch class: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!classId, // Only run if classId exists
  });

  // Fetch available staff members for instructor selection
  const { data: staffMembers = [], isLoading: staffLoading } = useQuery({
    queryKey: ["/school-admin/staff"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/school-admin/staff");
      const data = await response.json();
      return data;
    },
  });

  // Fetch locations for the school
  const { data: locationData = [] } = useQuery({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const response = await fetch('/api/locations?schoolId=1', {
        credentials: 'include'
      });
      if (!response.ok) {
        console.log('Failed to fetch locations');
        return [{ id: 1, name: 'Brighton' }]; // Fallback
      }
      const data = await response.json();
      return data;
    },
  });

  // Update locations state when data is fetched
  useEffect(() => {
    if (locationData) {
      setLocations(locationData);
    }
  }, [locationData]);

  // Update form when class data is loaded
  useEffect(() => {
    if (classData && classId) {
      setIsEditMode(true);
      
      // Format dates properly for the form
      const startDate = classData.startDate ? 
        new Date(classData.startDate).toISOString().split('T')[0] : 
        "";
      const endDate = classData.endDate ? 
        new Date(classData.endDate).toISOString().split('T')[0] : 
        "";
      
      form.reset({
        title: classData.title || "",
        description: classData.description || "",
        category: classData.category || "",
        gradeLevel: classData.gradeLevel || "",
        startDate,
        endDate,
        schedule: classData.schedule || "",
        startTime: classData.startTime || "",
        endTime: classData.endTime || "",
        capacity: classData.capacity || 10,
        location: classData.location || "",
        instructorName: classData.instructorName || "",
        price: classData.price || 0,
        status: classData.status || "upcoming",
        isAdminOnly: classData.isAdminOnly || false,
      });
    }
  }, [classData, classId, form]);

  // Create class mutation
  const createClassMutation = useMutation({
    mutationFn: (data: ClassFormValues) => {
      return apiRequest("POST", "/school-admin/classes", data);
    },
    onSuccess: () => {
      toast({
        title: "Class created successfully",
        description: "Your new class has been added to the system.",
      });
      queryClient.invalidateQueries({ queryKey: ["/school-admin/classes"] });
      navigate("/schools/classes");
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
      return apiRequest("PUT", `/class-details/${classId}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Class updated successfully",
        description: "Your class has been updated.",
      });
      // Invalidate both the class list and the individual class data
      queryClient.invalidateQueries({ queryKey: ["/school-admin/classes"] });
      queryClient.invalidateQueries({ queryKey: ["/class-details", classId] });
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
                          <Input {...field} placeholder="Introduction to American History" />
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
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Early Childhood">Early Childhood</SelectItem>
                            <SelectItem value="Pre-Kindergarten">Pre-Kindergarten</SelectItem>
                            <SelectItem value="Kindergarten">Kindergarten</SelectItem>
                            <SelectItem value="Lower Elementary">Lower Elementary</SelectItem>
                            <SelectItem value="Upper Elementary">Upper Elementary</SelectItem>
                            <SelectItem value="Middle School">Middle School</SelectItem>
                            <SelectItem value="High School">High School</SelectItem>
                            <SelectItem value="Extracurricular">Extracurricular</SelectItem>
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
                    name="gradeLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade Level*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select grade level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="littles">Littles</SelectItem>
                            <SelectItem value="pre-k">Pre K</SelectItem>
                            <SelectItem value="kindergarten">Kindergarten</SelectItem>
                            <SelectItem value="1st-grade">1st Grade</SelectItem>
                            <SelectItem value="2nd-grade">2nd Grade</SelectItem>
                            <SelectItem value="3rd-grade">3rd Grade</SelectItem>
                            <SelectItem value="4th-grade">4th Grade</SelectItem>
                            <SelectItem value="5th-grade">5th Grade</SelectItem>
                            <SelectItem value="6th-grade">6th Grade</SelectItem>
                            <SelectItem value="7th-grade">7th Grade</SelectItem>
                            <SelectItem value="8th-grade">8th Grade</SelectItem>
                            <SelectItem value="9th-grade">9th Grade</SelectItem>
                            <SelectItem value="10th-grade">10th Grade</SelectItem>
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
                        <FormLabel>Status*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
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
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="schedule"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Schedule*</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Mondays and Wednesdays, 3:00 PM - 4:30 PM" />
                      </FormControl>
                      <FormDescription>
                        Specify the days and times when this class will meet
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <TimePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Select start time"
                          />
                        </FormControl>
                        <FormDescription>
                          What time does the class start?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <TimePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Select end time"
                          />
                        </FormControl>
                        <FormDescription>
                          What time does the class end?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-6 sm:grid-cols-3">
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
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price ($)*</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} min={0} step=".01" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a location" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {locations.map((location) => (
                              <SelectItem key={location.id} value={location.name}>
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