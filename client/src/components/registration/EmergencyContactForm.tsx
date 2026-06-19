import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";

export const emergencyContactFormSchema = z.object({
  firstName: z.string().trim().min(2, { message: "First name must be at least 2 characters" }),
  lastName: z.string().trim().min(2, { message: "Last name must be at least 2 characters" }),
  relationship: z.string().trim().min(1, { message: "Relationship is required" }),
  phoneNumber: z.string().trim().min(10, { message: "Please enter a valid phone number" }),
  email: z.string().trim().min(1, { message: "Email is required" }).email({ message: "Please enter a valid email" }),
  isAuthorizedPickup: z.boolean().default(false),
});

export type EmergencyContactFormValues = z.infer<typeof emergencyContactFormSchema>;

export type EmergencyContactRecord = EmergencyContactFormValues & { id: number };

interface EmergencyContactFormProps {
  defaultValues?: EmergencyContactFormValues;
  onSuccess?: () => void;
  contactId?: number;
  /** Plain form for dialogs; card wrapper for standalone pages */
  variant?: "plain" | "card";
}

export function EmergencyContactForm({
  defaultValues,
  onSuccess,
  contactId,
  variant = "plain",
}: EmergencyContactFormProps) {
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
        const response = await apiRequest("PATCH", `/api/emergency-contacts/${contactId}`, data);
        const updated = (await response.json()) as EmergencyContactRecord;
        queryClient.setQueryData<EmergencyContactRecord[]>(
          ["/api/emergency-contacts"],
          (existing) =>
            Array.isArray(existing)
              ? existing.map((contact) => (contact.id === contactId ? updated : contact))
              : [updated],
        );
      } else {
        const response = await apiRequest("POST", "/api/emergency-contacts", data);
        const created = (await response.json()) as EmergencyContactRecord;
        queryClient.setQueryData<EmergencyContactRecord[]>(
          ["/api/emergency-contacts"],
          (existing) => (Array.isArray(existing) ? [...existing, created] : [created]),
        );
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/emergency-contacts"] });

      if (!contactId) {
        form.reset();
      }

      onSuccess?.();
    } catch (error) {
      console.error("Failed to save emergency contact:", error);
      toast({
        title: "Could not save contact",
        description: "Please check the form and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formBody = (
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
                  <Input placeholder="e.g. Parent, Guardian, Aunt" {...field} />
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
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="Email address" type="email" {...field} />
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
                  Can this person pick up your child?
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : contactId ? "Save Changes" : "Save Contact"}
        </Button>
      </form>
    </Form>
  );

  if (variant === "card") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{contactId ? "Edit Emergency Contact" : "Add Emergency Contact"}</CardTitle>
          <CardDescription>
            {contactId
              ? "Update emergency contact information"
              : "Someone we can reach in an emergency"}
          </CardDescription>
        </CardHeader>
        <CardContent>{formBody}</CardContent>
      </Card>
    );
  }

  return formBody;
}
