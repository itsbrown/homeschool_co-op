import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "../../hooks/use-toast";
import { apiRequest } from "../../lib/queryClient";
import { formatDate } from "../../lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Switch } from "../ui/switch";
import { 
  CalendarIcon, 
  DollarSign, 
  RefreshCw,
  Sparkles,
  Calculator,
  Clock,
  Users
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Slider } from "../ui/slider";

// Form schema for class creation
const classFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1, "Category is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  price: z.number().min(0, "Price must be a positive number"),
  suggestedPrice: z.number().optional(),
  gradeLevels: z.array(z.string()).min(1, "At least one grade level is required"),
  capacity: z.number().min(1, "Capacity must be at least 1"),
  durationWeeks: z.number().min(1, "Duration must be at least 1 week"),
  sessionsPerWeek: z.number().min(1, "Must have at least 1 session per week"),
  sessionLengthMinutes: z.number().min(30, "Sessions must be at least 30 minutes"),
  location: z.string().min(1, "Location is required"),
  instructorName: z.string().min(1, "Instructor name is required"),
  isPublished: z.boolean().default(false),
});

type ClassFormValues = z.infer<typeof classFormSchema>;

// Default form values
const defaultValues: Partial<ClassFormValues> = {
  title: "",
  description: "",
  category: "",
  startDate: "",
  endDate: "",
  price: 0,
  suggestedPrice: 0,
  gradeLevels: [],
  capacity: 10,
  durationWeeks: 4,
  sessionsPerWeek: 1,
  sessionLengthMinutes: 60,
  location: "",
  instructorName: "",
  isPublished: false,
};

// List of available grade levels
const GRADE_LEVELS = [
  "Pre-K",
  "Kindergarten",
  "1st Grade",
  "2nd Grade",
  "3rd Grade",
  "4th Grade",
  "5th Grade",
  "6th Grade",
  "7th Grade",
  "8th Grade",
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
];

// List of class categories
const CLASS_CATEGORIES = [
  "academic",
  "arts",
  "music",
  "sports",
  "stem",
  "language",
  "coding",
  "cooking",
  "crafts"
];

interface ClassCreationFormProps {
  onSuccess?: () => void;
  classId?: number;
}

export function ClassCreationForm({ onSuccess, classId }: ClassCreationFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [selectedGradeLevels, setSelectedGradeLevels] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing class data if editing (classId provided)
  const { data: classData, isLoading: isLoadingClass } = useQuery({
    queryKey: ['/api/admin/classes', classId],
    enabled: !!classId,
  });

  // Initialize form with react-hook-form and zod validation
  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: classData || defaultValues,
  });

  // Update form values when classData changes (editing)
  useEffect(() => {
    if (classData) {
      form.reset(classData);
      setSelectedGradeLevels(classData.gradeLevels || []);
    }
  }, [classData, form]);

  // Handle form submission
  const onSubmit = async (data: ClassFormValues) => {
    setIsLoading(true);
    try {
      // Format the data
      const formattedData = {
        ...data,
        gradeLevels: selectedGradeLevels,
      };

      // API request (create or update)
      if (classId) {
        await apiRequest("PATCH", `/api/admin/classes/${classId}`, formattedData);
        toast({
          title: "Class updated",
          description: "The class has been updated successfully.",
        });
      } else {
        await apiRequest("POST", "/api/admin/classes", formattedData);
        toast({
          title: "Class created",
          description: "The class has been created successfully.",
        });
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/admin/classes'] });
      
      // Reset form if creating a new class
      if (!classId) {
        form.reset(defaultValues);
        setSelectedGradeLevels([]);
      }
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to save class:", error);
      toast({
        title: "Failed to save",
        description: "There was an error saving the class. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle grade level selection
  const toggleGradeLevel = (level: string) => {
    setSelectedGradeLevels((prev) => {
      if (prev.includes(level)) {
        return prev.filter((l) => l !== level);
      } else {
        return [...prev, level];
      }
    });
  };

  // Get AI-suggested price
  const getPriceSuggestion = async () => {
    setIsPricingLoading(true);

    try {
      const formData = form.getValues();
      
      // Include selected grade levels
      const data = {
        ...formData,
        gradeLevels: selectedGradeLevels,
      };

      // Call AI pricing API
      const response = await apiRequest("POST", "/api/ai/suggest-price", data);
      const result = await response.json();

      if (result && result.suggestedPrice) {
        form.setValue("suggestedPrice", result.suggestedPrice);
        form.setValue("price", result.suggestedPrice);
        
        toast({
          title: "Price suggestion received",
          description: `Suggested price: $${result.suggestedPrice.toFixed(2)}`,
        });
      }
    } catch (error) {
      console.error("Failed to get price suggestion:", error);
      toast({
        title: "Failed to get price suggestion",
        description: "There was an error getting the price suggestion. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPricingLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Enter the basic details for this class</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Introduction to Watercolor Painting" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe what students will learn in this class" 
                        className="min-h-[120px]" 
                        {...field} 
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
                    <FormLabel>Category</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CLASS_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category.charAt(0).toUpperCase() + category.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Schedule Information */}
          <Card>
            <CardHeader>
              <CardTitle>Schedule & Capacity</CardTitle>
              <CardDescription>Set the timing and capacity details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <div className="flex">
                          <Input type="date" {...field} />
                          <CalendarIcon className="ml-2 h-4 w-4 opacity-70 self-center" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <div className="flex">
                          <Input type="date" {...field} />
                          <CalendarIcon className="ml-2 h-4 w-4 opacity-70 self-center" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="durationWeeks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (weeks)</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <Input 
                          type="number" 
                          min={1} 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                        <Clock className="ml-2 h-4 w-4 opacity-70" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-4 md:flex-row">
                <FormField
                  control={form.control}
                  name="sessionsPerWeek"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Sessions Per Week</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={1} 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sessionLengthMinutes"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Session Length (minutes)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={30} 
                          step={15} 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class Capacity</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <Input 
                          type="number" 
                          min={1} 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                        <Users className="ml-2 h-4 w-4 opacity-70" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Location & Instructor */}
          <Card>
            <CardHeader>
              <CardTitle>Location & Instructor</CardTitle>
              <CardDescription>Specify where the class will be held and who will teach it</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Main Campus, Room 101" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Jane Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Grade Levels & Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Grade Levels & Pricing</CardTitle>
              <CardDescription>Select applicable grade levels and set the price</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <FormLabel>Grade Levels</FormLabel>
                <div className="flex flex-wrap gap-2 mt-2">
                  {GRADE_LEVELS.map((level) => (
                    <Badge
                      key={level}
                      variant={selectedGradeLevels.includes(level) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleGradeLevel(level)}
                    >
                      {level}
                    </Badge>
                  ))}
                </div>
                {form.formState.errors.gradeLevels && (
                  <p className="text-sm font-medium text-destructive mt-2">
                    {form.formState.errors.gradeLevels.message}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <FormLabel>Pricing</FormLabel>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={getPriceSuggestion}
                    disabled={isPricingLoading || 
                      !form.getValues().category || 
                      selectedGradeLevels.length === 0 ||
                      !form.getValues().durationWeeks}
                    className="flex items-center gap-2"
                  >
                    {isPricingLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Get AI Suggestion
                  </Button>
                </div>

                {form.watch("suggestedPrice") > 0 && (
                  <div className="bg-muted/50 p-3 rounded-md mb-4 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-primary" />
                    <p className="text-sm">
                      AI Suggested Price: <span className="font-medium">${form.watch("suggestedPrice").toFixed(2)}</span>
                    </p>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center">
                        <DollarSign className="h-4 w-4 mr-2" />
                        <FormControl>
                          <Input 
                            type="number" 
                            min={0} 
                            step={0.01} 
                            {...field} 
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between pt-4 border-t">
                    <div className="space-y-0.5">
                      <FormLabel>Publish Class</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Make this class visible to parents
                      </p>
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
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => onSuccess && onSuccess()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : (classId ? "Update Class" : "Create Class")}
          </Button>
        </div>
      </form>
    </Form>
  );
}