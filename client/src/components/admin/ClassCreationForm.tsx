import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth0";
import { useQuery } from "@tanstack/react-query";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { ClassVariants } from "@/components/admin/ClassVariants";
import { ClassVariant, classScheduleSchema } from "@shared/schema";

// Define the form schema
const classFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  subject: z.string().min(1, "Subject is required"),
  category: z.enum(["academic", "arts", "music", "sports", "stem", "language", "coding", "cooking", "crafts", "other"]),
  gradeLevel: z.string().min(1, "Grade level is required"),
  ageRange: z.string().min(1, "Age range is required"),
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
  location: z.string().optional(),
  price: z.string().transform(val => {
    // Convert to float, and round to 2 decimal places to avoid precision issues
    const numValue = parseFloat(val);
    if (isNaN(numValue)) return 0;
    return Number((Math.round(numValue * 100) / 100).toFixed(2));
  }),
  capacity: z.string().transform(val => parseInt(val, 10)),
  isPublished: z.boolean().default(false),
  isAdminOnly: z.boolean().default(false),
  isOnline: z.boolean().default(false),
  hasMaterials: z.boolean().default(false),
  materials: z.string().optional(),
  instructorId: z.string().min(1, "Instructor is required"),
});

type ClassFormValues = z.infer<typeof classFormSchema>;

interface ClassCreationFormProps {
  onSuccess?: () => void;
  initialData?: any;
  classId?: number;
}

export function ClassCreationForm({ onSuccess, initialData, classId }: ClassCreationFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Define type for educator
  interface Educator {
    id: number;
    name: string;
    username: string;
    role: string;
  }
  
  // Load staff members as potential instructors using React Query
  const { data: staffData = [], isLoading: isLoadingStaff } = useQuery({
    queryKey: ['/api/school-admin/staff'],
    select: (staffData: any[]) => {
      // Convert staff to educator format
      return staffData.map((staff: any) => ({
        id: staff.id,
        name: staff.name || `${staff.firstName} ${staff.lastName}`,
        username: staff.email,
        role: staff.role,
        email: staff.email
      }));
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Load locations using React Query
  const { data: locations = [], isLoading: isLoadingLocations } = useQuery({
    queryKey: ['/api/locations'],
    queryFn: () => fetch('/api/locations?schoolId=1', {
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
      }
    }).then(res => {
      if (!res.ok) throw new Error('Failed to fetch locations');
      return res.json();
    }),
    retry: 1,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  // Process initialData to ensure all fields are properly formatted for the form
  const processedInitialData = initialData ? {
    title: initialData.title || "",
    description: initialData.description || "",
    // When editing, use stored subject or fallback if not found
    subject: initialData.subject || "mathematics",
    category: initialData.category || "academic",
    // When editing, use stored gradeLevel or fallback if not found
    gradeLevel: initialData.gradeLevel || "elementary",
    // When editing, use stored ageRange or fallback if not found
    ageRange: initialData.ageRange || "6-10 years",
    startDate: initialData.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : "",
    endDate: initialData.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : "",
    // When editing, use stored variants or create default variant from legacy schedule
    variants: initialData.variants || initialData.schedule ? 
      ((initialData.variants || []).map((v: any) => ({
        ...v,
        price: v.price || 5000 // Add default price if missing
      })) || [{
        id: 'default-variant',
        name: 'Main Session',
        startTime: '9:00 AM',
        endTime: '12:00 PM',
        days: ['Monday', 'Wednesday'],
        price: 5000
      }]) : [{
        id: 'default-variant',
        name: 'Main Session', 
        startTime: '9:00 AM',
        endTime: '12:00 PM',
        days: ['Monday', 'Wednesday'],
        price: 5000
      }],
    location: initialData.location || "",
    // Fix price display - convert to string with proper formatting
    price: initialData.price ? (parseFloat(initialData.price.toString()) / 100).toFixed(2) : "0.00",
    capacity: (initialData.capacity || initialData.maxEnrollment || 20).toString(),
    isPublished: initialData.isPublished || initialData.status === "published" || false,
    isAdminOnly: initialData.isAdminOnly || false,
    isOnline: initialData.isOnline || initialData.location === "Online" || false,
    hasMaterials: initialData.hasMaterials || false,
    materials: initialData.materials || "",
    // Convert instructor ID to string - check for different potential formats
    instructorId: initialData.instructorId ? 
      initialData.instructorId.toString() : 
      initialData.instructor_id ? 
        initialData.instructor_id.toString() : "1",
  } : null;
  
  // Log the initialData for debugging when editing
  if (classId) {
    console.log("Raw initialData for class ID", classId, ":", JSON.stringify(initialData));
  }
  
  // Log processed data for debugging
  console.log("ProcessedInitialData:", processedInitialData);

  // Default values based on initialData or set defaults
  const defaultValues: Partial<ClassFormValues> = processedInitialData || {
    title: "",
    description: "",
    subject: "",
    category: "academic",
    gradeLevel: "",
    ageRange: "",
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
    location: "",
    price: "0",
    capacity: "20",
    isPublished: false,
    isOnline: false,
    hasMaterials: false,
    materials: "",
    instructorId: "1",
  };

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues,
  });

  // Watch for hasMaterials to conditionally show the materials field
  const hasMaterials = form.watch("hasMaterials");

  const handleSubmit = async (data: ClassFormValues) => {
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to create a class",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // The admin-classes router is mounted at /api/admin-classes
      const endpoint = classId ? `/api/admin-classes/classes/${classId}` : "/api/admin-classes/classes";
      const method = classId ? "PATCH" : "POST";
      
      // Find instructor name based on selected ID
      const selectedEducator = staffData.find((edu: any) => edu.id.toString() === data.instructorId);
      const instructorName = selectedEducator ? selectedEducator.name : (user.name || user.email || "Instructor");
      
      // Convert the input price to a number (as dollars, not cents)
      // The server will handle the conversion to cents
      const inputPrice = parseFloat(data.price.toString() || "0");
      
      console.log('Price submitted from form (in dollars):', inputPrice);
      
      // Create an object that matches the expected insertClassSchema
      const classData = {
        title: data.title,
        description: data.description,
        // Explicitly include custom fields regardless of whether they're in the schema
        subject: data.subject || "", 
        category: data.category,
        gradeLevel: data.gradeLevel || "",
        ageRange: data.ageRange || "",
        // Convert variants to schedule JSON structure
        schedule: {
          variants: data.variants || [],
          description: data.variants && data.variants.length > 1 ? 
            data.variants.map(v => `${v.name} (${v.startTime}-${v.endTime})`).join(' OR ') :
            data.variants?.[0] ? `${data.variants[0].startTime}-${data.variants[0].endTime}` : ''
        },
        // Send price in dollars - server will convert to cents
        price: inputPrice.toString(),
        capacity: parseInt(data.capacity.toString(), 10),
        location: data.location || "",
        // Keep the date format exactly as entered in the form to prevent timezone shifts
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        categoryName: "Spring 2025",
        isPublished: data.isPublished,
        isAdminOnly: data.isAdminOnly,
        hasMaterials: data.hasMaterials,
        materials: data.materials || "",
        isOnline: data.isOnline,
        instructorId: parseInt(data.instructorId),
        instructorName: instructorName
      };
      
      // Log the submitted data for debugging
      console.log("Submitting form data with custom fields:", classData);

      console.log("Submitting class data:", classData);
      
      const response = await apiRequest(method, endpoint, classData);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create class");
      }

      toast({
        title: initialData ? "Class Updated" : "Class Created",
        description: initialData
          ? "Your class has been updated successfully."
          : "Your new class has been created successfully.",
      });

      // Invalidate the classes query to refresh the list
      // Note: This is the correct path that matches our query key in AdminClassesPage.tsx
      await queryClient.invalidateQueries({ queryKey: ['/api/admin-classes/classes'] });
      
      // Also invalidate any other related keys to be safe
      await queryClient.invalidateQueries({ queryKey: ['/api/admin-classes'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/classes'] });
      
      console.log("Cache invalidated for classes queries");
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error creating class:", error);
      toast({
        title: "Error",
        description: error.message || "An error occurred while creating the class",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {/* Title */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Introduction to Mathematics" {...field} />
              </FormControl>
              <FormDescription>
                The title of your class as it will appear to students and parents
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Provide a detailed description of the class..."
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Explain what students will learn and any prerequisites
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Subject */}
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="mathematics">Mathematics</SelectItem>
                  <SelectItem value="science">Science</SelectItem>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="history">History</SelectItem>
                  <SelectItem value="art">Art</SelectItem>
                  <SelectItem value="music">Music</SelectItem>
                  <SelectItem value="physical_education">Physical Education</SelectItem>
                  <SelectItem value="computer_science">Computer Science</SelectItem>
                  <SelectItem value="foreign_language">Foreign Language</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The primary subject area of the class
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="academic">Academic</SelectItem>
                  <SelectItem value="arts">Arts</SelectItem>
                  <SelectItem value="music">Music</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                  <SelectItem value="stem">STEM</SelectItem>
                  <SelectItem value="language">Language</SelectItem>
                  <SelectItem value="coding">Coding</SelectItem>
                  <SelectItem value="cooking">Cooking</SelectItem>
                  <SelectItem value="crafts">Crafts</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The category this class belongs to
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Grade Level */}
        <FormField
          control={form.control}
          name="gradeLevel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Grade Level</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grade level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="pre-k-k">Pre K - K</SelectItem>
                  <SelectItem value="grades-1-2">Grades 1-2</SelectItem>
                  <SelectItem value="grades-3-5">Grades 3-5</SelectItem>
                  <SelectItem value="grades-6-8">Grades 6-8</SelectItem>
                  <SelectItem value="grades-9-12">Grades 9-12</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The appropriate grade level for this class
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Age Range */}
        <FormField
          control={form.control}
          name="ageRange"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Age Range</FormLabel>
              <FormControl>
                <Input placeholder="e.g. 8-10 years" {...field} />
              </FormControl>
              <FormDescription>
                The recommended age range for students
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Schedule */}
        <FormField
          control={form.control}
          name="variants"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Class Schedule</FormLabel>
              <FormControl>
                <ClassVariants
                  variants={field.value || []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>
                Set up one or more time options for this class. Multiple options allow flexible scheduling.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Start Date */}
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* End Date */}
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Price */}
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Price per student (0 for free)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Capacity */}
          <FormField
            control={form.control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacity</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Maximum number of students
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Location */}
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {locations.map((location: any) => (
                    <SelectItem key={location.id} value={location.name}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Select the campus location where the class will be held
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Instructor Selection */}
        <FormField
          control={form.control}
          name="instructorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructor</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an instructor" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="">No Instructor Assigned</SelectItem>
                  {isLoadingStaff ? (
                    <SelectItem value="" disabled>Loading staff...</SelectItem>
                  ) : (
                    staffData.map((educator) => (
                      <SelectItem key={educator.id} value={educator.id.toString()}>
                        {educator.name} ({educator.role})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                Assign an instructor to this class
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Is Online */}
        <FormField
          control={form.control}
          name="isOnline"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Online Class</FormLabel>
                <FormDescription>
                  Will this class be conducted online?
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

        {/* Has Materials */}
        <FormField
          control={form.control}
          name="hasMaterials"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Materials Required</FormLabel>
                <FormDescription>
                  Does this class require specific materials?
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

        {/* Materials (conditional) */}
        {hasMaterials && (
          <FormField
            control={form.control}
            name="materials"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Materials</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="List the required materials..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Specify any materials students will need for this class
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Is Published */}
        <FormField
          control={form.control}
          name="isPublished"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Publish Class</FormLabel>
                <FormDescription>
                  Make this class visible to parents and students
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

        {/* Is Admin Only */}
        <FormField
          control={form.control}
          name="isAdminOnly"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Admin Only Class</FormLabel>
                <FormDescription>
                  Only admins can see this class and manually assign students to it
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

        {/* Submit Button */}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {initialData ? "Updating..." : "Creating..."}
            </>
          ) : (
            <>{initialData ? "Update Class" : "Create Class"}</>
          )}
        </Button>
      </form>
    </Form>
  );
}