import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";

// Form validation schema
export const emergencyContactFormSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters" }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters" }),
  relationship: z.string().min(1, { message: "Relationship is required" }),
  phoneNumber: z.string().min(10, { message: "Please enter a valid phone number" }),
  email: z.string().email({ message: "Please enter a valid email" }).optional().nullable(),
  isAuthorizedPickup: z.boolean().default(false),
});

export type EmergencyContactFormValues = z.infer<typeof emergencyContactFormSchema>;

interface EmergencyContactFormProps {
  defaultValues?: EmergencyContactFormValues;
  onSuccess?: () => void;
  contactId?: number; // If provided, we're editing an existing contact
}

export function EmergencyContactForm({ defaultValues, onSuccess, contactId }: EmergencyContactFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<EmergencyContactFormValues>({
    resolver: zodResolver(emergencyContactFormSchema),
    defaultValues: defaultValues || {
      firstName: "",
      lastName: "",
      relationship: "",
      phoneNumber: "",
      email: "",
      isAuthorizedPickup: false,
    },
  });

  const onSubmit = async (data: EmergencyContactFormValues) => {
    setIsSubmitting(true);
    try {
      if (contactId) {
        // Update existing contact
        await apiRequest("PATCH", `/api/emergency-contacts/${contactId}`, data);
        toast({
          title: "Success",
          description: "Emergency contact updated successfully",
        });
      } else {
        // Create new contact
        await apiRequest("POST", "/api/emergency-contacts", data);
        toast({
          title: "Success",
          description: "Emergency contact added successfully",
        });
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/emergency-contacts"] });
      
      // Reset form if it's a new contact creation
      if (!contactId) {
        form.reset();
      }
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to save emergency contact:", error);
      toast({
        title: "Error",
        description: "Failed to save emergency contact information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{contactId ? "Edit Emergency Contact" : "Add Emergency Contact"}</CardTitle>
        <CardDescription>
          {contactId 
            ? "Update emergency contact information" 
            : "Add an emergency contact that we can reach if needed"}
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
                name="relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Parent, Guardian, Uncle, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Phone number" type="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Email address" 
                      type="email" 
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
              name="isAuthorizedPickup"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Authorized for Pickup</FormLabel>
                    <FormDescription>
                      Is this person authorized to pick up your child?
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

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? "Saving..." 
                : contactId 
                  ? "Update Emergency Contact" 
                  : "Add Emergency Contact"
              }
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}