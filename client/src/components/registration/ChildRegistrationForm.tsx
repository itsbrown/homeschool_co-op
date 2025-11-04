import React, { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/components/SupabaseProvider";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

// Define the validation schema for child registration
const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  birthdate: z.string().min(1, "Birthdate is required"),
  gradeLevel: z.string().min(1, "Grade level is required"),
  gender: z.string().min(1, "Gender is required"),
  school: z.string().optional(),
  interests: z.array(z.string()).optional(),
  learningStyle: z.string().optional(),
  specialNeeds: z.string().optional(),
  allergies: z.string().optional(),
  emergencyContact: z.string().optional(),
  additionalLanguages: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ChildRegistrationFormProps {
  childId?: string;
  defaultValues?: Partial<FormValues>;
  onSuccess?: (childId: string) => void;
}

export default function ChildRegistrationForm({ 
  childId, 
  defaultValues = {}, 
  onSuccess 
}: ChildRegistrationFormProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Define the available interests
  const availableInterests = [
    { value: "science", label: "Science" },
    { value: "math", label: "Mathematics" },
    { value: "art", label: "Art & Creativity" },
    { value: "reading", label: "Reading & Literature" },
    { value: "music", label: "Music" },
    { value: "sports", label: "Sports & Physical Activities" },
    { value: "history", label: "History" },
    { value: "coding", label: "Coding & Technology" },
    { value: "nature", label: "Nature & Environment" },
    { value: "languages", label: "Foreign Languages" },
  ];

  // Set up the form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthdate: "",
      gradeLevel: "",
      gender: "",
      school: "",
      interests: [],
      learningStyle: "",
      specialNeeds: "",
      allergies: "",
      emergencyContact: "",
      additionalLanguages: "",
      notes: "",
      ...defaultValues
    },
  });

  // Fetch parent's school association and auto-populate school field
  useEffect(() => {
    const fetchParentSchool = async () => {
      if (user?.email && !defaultValues?.school) {
        try {
          // Get school association through school-parents API
          const response = await apiRequest('GET', `/api/school-parents/school/${user.email}`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.school?.name) {
              form.setValue('school', result.school.name);
              return;
            }
          }
          
          console.log('No school association found for user');
          // Leave school field empty if no association found
        } catch (error) {
          console.log('Error fetching school association:', error);
          // Leave school field empty on error
        }
      }
    };

    fetchParentSchool();
  }, [user?.email, defaultValues?.school, form]);

  // Retrieve school information from sessionStorage and set it in the form
  useEffect(() => {
    const schoolContext = sessionStorage.getItem('schoolRegistrationContext');
    if (schoolContext) {
      try {
        const { schoolName } = JSON.parse(schoolContext);
        if (schoolName && !form.getValues('school')) {
          form.setValue('school', schoolName);
        }
      } catch (error) {
        console.error('Error parsing school context:', error);
      }
    }
  }, [form]);

  // Reset form when defaultValues change (important for editing existing children)
  useEffect(() => {
    if (defaultValues && Object.keys(defaultValues).length > 0) {
      form.reset(defaultValues);
    }
  }, [defaultValues, form]);

  // Handle form submission
  const onSubmit = async (data: FormValues) => {
    try {
      const endpoint = childId 
        ? `/api/children/${childId}` 
        : "/api/parent/children";

      const method = childId ? "PATCH" : "POST";

      const response = await apiRequest(method, endpoint, data);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to register child");
      }

      const result = await response.json();

      // Store the registered child ID in session storage for future use
      sessionStorage.setItem('registeredChildId', JSON.stringify(result.id));

      // Invalidate the children query to ensure the UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });

      toast({
        title: childId ? "Child Updated" : "Child Registered",
        description: childId
          ? "Your child's information has been updated successfully"
          : "Your child has been registered successfully",
      });

      // If onSuccess callback is provided, call it with the child ID
      // Invalidate the children query to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
      
      // Also invalidate the specific child query if we're editing
      if (childId) {
        queryClient.invalidateQueries({ queryKey: ["/api/parent/children", childId] });
      }
      
      if (onSuccess) {
        onSuccess(result.id);
      } else {
        // Otherwise, redirect back to the children page to show the new child
        setLocation("/children");
      }
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>{childId ? "Update Child Information" : "Register Your Child"}</CardTitle>
        <CardDescription>
          {childId 
            ? "Update your child's information in our system" 
            : "Register your child to enroll in our programs"}
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
                    <FormLabel>First Name*</FormLabel>
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
                    <FormLabel>Last Name*</FormLabel>
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
                    <FormLabel>Birthdate*</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      Your child's date of birth
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade Level*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select grade level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Littles">Littles</SelectItem>
                        <SelectItem value="Pre-K">Pre-K</SelectItem>
                        <SelectItem value="Kindergarten">Kindergarten</SelectItem>
                        <SelectItem value="1st Grade">1st Grade</SelectItem>
                        <SelectItem value="2nd Grade">2nd Grade</SelectItem>
                        <SelectItem value="3rd Grade">3rd Grade</SelectItem>
                        <SelectItem value="4th Grade">4th Grade</SelectItem>
                        <SelectItem value="5th Grade">5th Grade</SelectItem>
                        <SelectItem value="6th Grade">6th Grade</SelectItem>
                        <SelectItem value="7th Grade">7th Grade</SelectItem>
                        <SelectItem value="8th Grade">8th Grade</SelectItem>
                        <SelectItem value="9th Grade">9th Grade</SelectItem>
                        <SelectItem value="10th Grade">10th Grade</SelectItem>
                        <SelectItem value="11th Grade">11th Grade</SelectItem>
                        <SelectItem value="12th Grade">12th Grade</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
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
                      <Input 
                        {...field} 
                        placeholder="School name" 
                        readOnly={!!form.getValues('school')}
                        className={form.getValues('school') ? "bg-gray-50" : ""}
                      />
                    </FormControl>
                    <FormDescription>
                      {form.getValues('school') ? 
                        "School automatically assigned from registration link" : 
                        "Optional: Enter your child's school name"
                      }
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="interests"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel>Areas of Interest</FormLabel>
                      <FormDescription>
                        Select any areas your child shows interest in
                      </FormDescription>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {availableInterests.map((interest) => (
                        <FormField
                          key={interest.value}
                          control={form.control}
                          name="interests"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={interest.value}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(interest.value)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value || [], interest.value])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== interest.value
                                            )
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {interest.label}
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="learningStyle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Learning Style</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select learning style" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="visual">Visual Learner</SelectItem>
                        <SelectItem value="auditory">Auditory Learner</SelectItem>
                        <SelectItem value="kinesthetic">Kinesthetic/Hands-on Learner</SelectItem>
                        <SelectItem value="reading-writing">Reading/Writing Preference</SelectItem>
                        <SelectItem value="mixed">Mixed Style</SelectItem>
                        <SelectItem value="unknown">Not Sure</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Helps us tailor learning experiences to your child's preferences
                    </FormDescription>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="specialNeeds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Special Needs/Accommodations</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any special needs, accommodations, or IEP information"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional - helps us provide appropriate support
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allergies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allergies</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any allergies or medical concerns we should be aware of"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any additional information you'd like to share about your child"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setLocation("/dashboard")}>
                Cancel
              </Button>
              <Button type="submit">
                {childId ? "Update Child" : "Register Child"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}