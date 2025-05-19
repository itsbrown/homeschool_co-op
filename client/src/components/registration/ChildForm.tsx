import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";

// This form handles both creation and editing of child profiles
export const childFormSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters" }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters" }),
  birthdate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Please enter a valid date"
  }),
  gradeLevel: z.string().min(1, { message: "Grade level is required" }),
  school: z.string().optional().nullable(),
  specialNeeds: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  medicalInfo: z.string().optional().nullable(),
  profileImage: z.string().optional().nullable(),
});

export type ChildFormValues = z.infer<typeof childFormSchema>;

interface ChildFormProps {
  defaultValues?: ChildFormValues;
  onSuccess?: () => void;
  childId?: number; // If provided, we're editing an existing child
}

export function ChildForm({ defaultValues, onSuccess, childId }: ChildFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ChildFormValues>({
    resolver: zodResolver(childFormSchema),
    defaultValues: defaultValues || {
      firstName: "",
      lastName: "",
      birthdate: "",
      gradeLevel: "",
      school: "",
      specialNeeds: "",
      allergies: "",
      medicalInfo: "",
      learningStyle: null,
      interests: null,
      profileImage: null,
    },
  });

  const onSubmit = async (data: ChildFormValues) => {
    setIsSubmitting(true);
    try {
      // Add missing fields with null values
      const completeData = {
        ...data,
        interests: null,
        learningStyle: null
      };
      
      if (childId) {
        // Update existing child
        await apiRequest("PATCH", `/api/children/${childId}`, completeData);
        toast({
          title: "Success",
          description: "Child information updated successfully",
        });
      } else {
        // Create new child
        await apiRequest("POST", "/api/children", completeData);
        toast({
          title: "Success",
          description: "Child added successfully",
        });
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });
      
      // Reset form if it's a new child creation
      if (!childId) {
        form.reset();
      }
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to save child:", error);
      toast({
        title: "Error",
        description: "Failed to save child information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const gradeLevels = [
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{childId ? "Edit Child Information" : "Add a Child"}</CardTitle>
        <CardDescription>
          {childId 
            ? "Update your child's information below" 
            : "Register your child to enroll in programs and activities"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade Level</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select grade level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {gradeLevels.map((grade) => (
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
                name="school"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School</FormLabel>
                    <FormControl>
                      <Input placeholder="School name" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="allergies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allergies</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="List any allergies or sensitivities (if none, leave blank)"
                      className="resize-none"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="specialNeeds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special Needs or Accommodations</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe any special needs or required accommodations (if none, leave blank)"
                      className="resize-none"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="medicalInfo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medical Information</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional health information we should know about (if none, leave blank)"
                      className="resize-none"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : childId ? "Update Child" : "Add Child"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}