import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Child interface (simplified)
interface Child {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
}

// Program interface (simplified)
interface Program {
  id: number;
  title: string;
  price: number;
  gradeLevels: string[];
  startDate: string;
  endDate: string;
}

// Form validation schema
export const programEnrollmentFormSchema = z.object({
  programId: z.string().refine(val => Number(val) > 0, { message: "Please select a program" }),
  childId: z.string().refine(val => Number(val) > 0, { message: "Please select a child" }),
  discountCode: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer", "cash", "scholarship"]),
});

export type ProgramEnrollmentFormValues = z.infer<typeof programEnrollmentFormSchema>;

interface ProgramEnrollmentFormProps {
  defaultValues?: Partial<ProgramEnrollmentFormValues>;
  onSuccess?: () => void;
  enrollmentId?: number; // If provided, we're editing an existing enrollment
  preselectedProgramId?: number;
  preselectedChildId?: number;
}

export function ProgramEnrollmentForm({ 
  defaultValues, 
  onSuccess, 
  enrollmentId,
  preselectedProgramId,
  preselectedChildId
}: ProgramEnrollmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get available programs and children
  const { data: programs, isLoading: isLoadingPrograms } = useQuery({
    queryKey: ["/api/programs"],
    select: (data: any) => Array.isArray(data) ? data.filter((program: Program) => 
      program && typeof program === 'object' && 'isPublished' in program && program.isPublished) : [],
  });

  const { data: children, isLoading: isLoadingChildren } = useQuery({
    queryKey: ["/api/parent/children"],
  });

  // Form setup
  const form = useForm<ProgramEnrollmentFormValues>({
    resolver: zodResolver(programEnrollmentFormSchema),
    defaultValues: defaultValues || {
      programId: preselectedProgramId?.toString() || "",
      childId: preselectedChildId?.toString() || "",
      discountCode: "",
      notes: "",
      paymentMethod: "credit_card",
    },
  });

  // Watch for selected program changes
  const watchProgramId = form.watch("programId");

  // Update selected program when program ID changes
  useEffect(() => {
    if (watchProgramId && programs) {
      const program = programs.find((p: Program) => p.id.toString() === watchProgramId);
      setSelectedProgram(program || null);
    } else {
      setSelectedProgram(null);
    }
  }, [watchProgramId, programs]);

  // Calculate total price (with possible discount logic in the future)
  const calculatePrice = () => {
    if (!selectedProgram) return 0;
    // Here you could add discount code logic later
    return selectedProgram.price;
  };

  const onSubmit = async (data: ProgramEnrollmentFormValues) => {
    setIsSubmitting(true);
    try {
      const submitData = {
        ...data,
        programId: parseInt(data.programId),
        childId: parseInt(data.childId),
        status: "pending",
        paymentStatus: "pending",
        totalPaid: calculatePrice() * 100, // Convert to cents
      };

      if (enrollmentId) {
        // Update existing enrollment
        await apiRequest("PATCH", `/api/program-enrollments/${enrollmentId}`, submitData);
        toast({
          title: "Success",
          description: "Enrollment updated successfully",
        });
      } else {
        // Create new enrollment
        await apiRequest("POST", "/api/program-enrollments", submitData);
        toast({
          title: "Success",
          description: "Program enrollment successful",
        });
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/program-enrollments"] });
      
      // Reset form if it's a new enrollment creation
      if (!enrollmentId) {
        form.reset();
      }
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to enroll in program:", error);
      toast({
        title: "Error",
        description: "Failed to submit enrollment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Show loading state if data is still loading
  if (isLoadingPrograms || isLoadingChildren) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading enrollment form</CardTitle>
          <CardDescription>Please wait while we load the necessary information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show message if no programs or children are available
  if (!programs?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Programs Available</CardTitle>
          <CardDescription>There are currently no programs available for enrollment</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!children || (Array.isArray(children) && children.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Children Registered</CardTitle>
          <CardDescription>You need to register a child before enrolling in a program</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => window.location.href = "/registration/children"}>
            Register a Child
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{enrollmentId ? "Edit Enrollment" : "Program Enrollment"}</CardTitle>
        <CardDescription>
          {enrollmentId 
            ? "Update enrollment information" 
            : "Enroll your child in an available program"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="childId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Child</FormLabel>
                    <Select 
                      disabled={!!preselectedChildId}
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a child" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(children) && children.map((child: Child) => (
                          <SelectItem key={child.id} value={child.id.toString()}>
                            {child.firstName} {child.lastName} ({child.gradeLevel})
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
                name="programId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program</FormLabel>
                    <Select 
                      disabled={!!preselectedProgramId}
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a program" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {programs.map((program: Program) => (
                          <SelectItem key={program.id} value={program.id.toString()}>
                            {program.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {selectedProgram && (
                        <div className="mt-2 text-xs space-y-1">
                          <p>Dates: {formatDate(selectedProgram.startDate)} - {formatDate(selectedProgram.endDate)}</p>
                          <p>Price: ${selectedProgram.price.toFixed(2)}</p>
                          <p>Grades: {selectedProgram.gradeLevels.join(", ")}</p>
                        </div>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="scholarship">Scholarship</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="discountCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Code (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter discount code if you have one" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional information we should know"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedProgram && (
              <div className="mt-4 p-4 border rounded-md bg-muted">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total:</span>
                  <span className="text-lg font-bold">${calculatePrice().toFixed(2)}</span>
                </div>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? "Processing..." 
                : enrollmentId 
                  ? "Update Enrollment" 
                  : "Complete Enrollment"
              }
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}