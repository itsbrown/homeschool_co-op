import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, parseApiErrorMessage } from "@/lib/queryClient";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Check, Copy, Loader2 } from "lucide-react";
import { isClassroomStaffPosition } from "@shared/staff-invitations";

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
  title?: string;
  className?: string;
  locationId?: number | null;
}

const ASSIGN_LATER = "later";

const inviteFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.string().min(1, "Please select a role"),
  locationId: z.string().min(1, "Please select a campus"),
  classId: z.string().min(1, "Choose a class or assign later"),
  message: z.string().optional(),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

type InviteSuccess = {
  inviteUrl: string;
  invitePath?: string;
  emailSent: boolean;
  name: string;
  expiresAt?: string;
};

export default function StaffInvitePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState<InviteSuccess | null>(null);

  const { data: staffPositions = [] } = useQuery<StaffPosition[]>({
    queryKey: ["/api/school-admin/staff-positions"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: classesPayload } = useQuery<{ items?: ClassItem[] }>({
    queryKey: ["/api/school-admin/classes?limit=1000"],
  });
  const allClassesList = classesPayload?.items ?? [];

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "Mentor",
      locationId: "",
      classId: "",
      message: "",
    },
  });

  const selectedLocationId = form.watch("locationId");
  const selectedRole = form.watch("role");
  const classroomRole = isClassroomStaffPosition(selectedRole || "Mentor");

  const campusClasses = useMemo(() => {
    if (!selectedLocationId) return [];
    const locId = Number(selectedLocationId);
    return allClassesList.filter(
      (c) => c.locationId == null || c.locationId === locId,
    );
  }, [allClassesList, selectedLocationId]);

  const inviteStaffMutation = useMutation({
    mutationFn: async (data: InviteFormValues) => {
      const response = await apiRequest("POST", "/api/school-admin/staff/invite", data, {
        passthroughStatuses: [409],
      });
      const json = await response.json();
      if (!response.ok) {
        const err = new Error(json.message || "Failed to send invitation") as Error & {
          code?: string;
          inviteUrl?: string;
        };
        err.code = json.code;
        err.inviteUrl = json.inviteUrl;
        throw err;
      }
      return json as {
        inviteUrl: string;
        invitePath?: string;
        emailSent: boolean;
        expiresAt?: string;
        message: string;
      };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setSuccess({
        inviteUrl: result.invitePath
          ? `${window.location.origin}${result.invitePath}`
          : result.inviteUrl,
        invitePath: result.invitePath,
        emailSent: result.emailSent,
        name: `${variables.firstName} ${variables.lastName}`.trim(),
        expiresAt: result.expiresAt,
      });
      toast({
        title: result.emailSent ? `Invitation sent to ${variables.firstName} ${variables.lastName}` : "Invitation created",
        description: result.emailSent
          ? "Copy the link as a backup if they do not see the email."
          : "Email did not send. Copy the invite link and share it directly.",
      });
    },
    onError: (error: Error & { code?: string; inviteUrl?: string }) => {
      toast({
        title: error.code === "PENDING_INVITE" ? "Already invited" : "Failed to send invitation",
        description: parseApiErrorMessage(error, error.message),
        variant: "destructive",
      });
    },
  });

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Invite link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  if (success) {
    return (
      <SchoolAdminLayout pageTitle="Invite Staff Member">
        <div className="container py-6">
          <Card className="max-w-2xl mx-auto" data-testid="card-invite-success">
            <CardHeader>
              <CardTitle>Invitation ready</CardTitle>
              <CardDescription>
                {success.emailSent
                  ? `We emailed ${success.name}. Copy the link in case they cannot find it.`
                  : `We could not send email. Copy this link and share it with ${success.name}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input readOnly value={success.inviteUrl} data-testid="input-invite-url" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyLink(success.inviteUrl)}
                  data-testid="button-copy-invite-link"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-2">Copy link</span>
                </Button>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={() => navigate("/schools/staff")} data-testid="button-back-to-staff">
                Back to Staff
              </Button>
            </CardFooter>
          </Card>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Invite Staff Member">
      <div className="container py-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Invite Staff Member</CardTitle>
            <CardDescription>
              Send an invitation. Mentors land on Today with the class you assign here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => inviteStaffMutation.mutate(data))} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name*</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Jane" data-testid="input-invite-first-name" />
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
                          <Input {...field} placeholder="Smith" data-testid="input-invite-last-name" />
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
                      <FormLabel>Email Address*</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="jane.smith@example.com" data-testid="input-invite-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role*</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-invite-role">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(staffPositions.length > 0
                            ? staffPositions
                            : [{ id: 0, title: "Mentor" }]
                          ).map((position) => (
                            <SelectItem key={position.id || position.title} value={position.title}>
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
                      <FormLabel>Campus*</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("classId", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-invite-campus">
                            <SelectValue placeholder="Select a campus" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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

                <FormField
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{classroomRole ? "Class" : "Class (optional)"}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!selectedLocationId}>
                        <FormControl>
                          <SelectTrigger data-testid="select-invite-class">
                            <SelectValue placeholder={selectedLocationId ? "Select a class" : "Choose a campus first"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ASSIGN_LATER}>Assign a class later</SelectItem>
                          {campusClasses.map((classItem) => (
                            <SelectItem key={classItem.id} value={classItem.id.toString()}>
                              {classItem.title || classItem.className}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {classroomRole
                          ? "This is what they will see on Today."
                          : "Office roles can skip a class assignment."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal Message (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Add a personal message to your invitation..." rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <CardFooter className="flex justify-between px-0 pb-0">
                  <Button type="button" variant="outline" onClick={() => navigate("/schools/staff")}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteStaffMutation.isPending} data-testid="button-send-invitation">
                    {inviteStaffMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Invitation
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
