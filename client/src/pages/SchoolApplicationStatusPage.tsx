
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Eye, 
  ArrowLeft,
  School,
  Calendar,
  User,
  MapPin
} from "lucide-react";

const statusCheckSchema = z.object({
  email: z.string().email("Please enter a valid email address")
});

type StatusCheckForm = z.infer<typeof statusCheckSchema>;

interface ApplicationStatus {
  id: string;
  schoolName: string;
  schoolType: string;
  adminFirstName: string;
  adminLastName: string;
  status: 'pending' | 'under_review' | 'approved' | 'declined';
  submittedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
  city: string;
  state: string;
  currentStudentCount: number;
}

export default function SchoolApplicationStatusPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [applications, setApplications] = useState<ApplicationStatus[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const form = useForm<StatusCheckForm>({
    resolver: zodResolver(statusCheckSchema),
    defaultValues: {
      email: ""
    }
  });

  const checkStatusMutation = useMutation({
    mutationFn: async (data: StatusCheckForm) => {
      const response = await apiRequest("POST", "/api/school-applications/check-status", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to check status");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setApplications(data.applications || []);
      setHasSearched(true);
      if (data.applications.length === 0) {
        toast({
          title: "No Applications Found",
          description: "No applications found for this email address.",
          variant: "default",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Status Check Failed",
        description: error.message,
        variant: "destructive",
      });
      setHasSearched(true);
    }
  });

  const onSubmit = (data: StatusCheckForm) => {
    checkStatusMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'under_review':
        return <Badge variant="default" className="bg-blue-100 text-blue-800"><Eye className="h-3 w-3 mr-1" />Under Review</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'declined':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'pending':
        return "Your application is in queue for review. Our team will review it within 3-5 business days.";
      case 'under_review':
        return "Your application is currently being reviewed by our team. We may contact your references during this process.";
      case 'approved':
        return "Congratulations! Your application has been approved. You should receive setup instructions via email.";
      case 'declined':
        return "Your application was not approved at this time. You may reapply in the future if your circumstances change.";
      default:
        return "Status information is not available.";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Check Application Status</h1>
            <p className="text-gray-600 mt-2">Enter your email address to check the status of your school application</p>
          </div>
        </div>

        {/* Search Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Application Status Lookup
            </CardTitle>
            <CardDescription>
              Enter the email address you used when submitting your school application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="Enter your email address" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  disabled={checkStatusMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {checkStatusMutation.isPending ? "Checking..." : "Check Status"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Results */}
        {hasSearched && (
          <>
            {applications.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Search className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Applications Found</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    We couldn't find any applications associated with this email address.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => setLocation("/school-application")}>
                      Submit New Application
                    </Button>
                    <Button variant="outline" onClick={() => form.reset()}>
                      Try Different Email
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Your Applications</h2>
                {applications.map((app) => (
                  <Card key={app.id} className="overflow-hidden">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{app.schoolName}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <School className="h-4 w-4" />
                            {app.schoolType} • {app.city}, {app.state}
                          </CardDescription>
                        </div>
                        {getStatusBadge(app.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Application Info */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>Administrator: {app.adminFirstName} {app.adminLastName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>Location: {app.city}, {app.state}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>Submitted: {new Date(app.submittedAt).toLocaleDateString()}</span>
                          </div>
                          {app.reviewedAt && (
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>Reviewed: {new Date(app.reviewedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Message */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium mb-2">Status Information</h4>
                        <p className="text-sm text-gray-600">{getStatusMessage(app.status)}</p>
                        
                        {app.reviewNotes && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-sm font-medium">Review Notes:</p>
                            <p className="text-sm text-gray-600 mt-1">{app.reviewNotes}</p>
                          </div>
                        )}
                      </div>

                      {/* Next Steps */}
                      {app.status === 'pending' && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <h4 className="font-medium text-blue-900 mb-2">Next Steps</h4>
                          <ul className="text-sm text-blue-800 space-y-1">
                            <li>• Our team will review your application within 3-5 business days</li>
                            <li>• You'll receive an email notification with our decision</li>
                            <li>• We may contact your references for verification</li>
                          </ul>
                        </div>
                      )}

                      {app.status === 'approved' && (
                        <div className="bg-green-50 rounded-lg p-4">
                          <h4 className="font-medium text-green-900 mb-2">Congratulations!</h4>
                          <p className="text-sm text-green-800">
                            Your school has been approved to join the ASA Platform. You should receive 
                            setup instructions and login credentials via email within 24 hours.
                          </p>
                        </div>
                      )}

                      {app.status === 'declined' && (
                        <div className="bg-red-50 rounded-lg p-4">
                          <h4 className="font-medium text-red-900 mb-2">Application Not Approved</h4>
                          <p className="text-sm text-red-800">
                            Your application was not approved at this time. You may submit a new 
                            application in the future if your circumstances change.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Help Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Need Help?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p>If you have questions about your application or need assistance:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Email us at <strong>support@americanseekersacademy.com</strong></li>
                <li>Allow 3-5 business days for application review</li>
                <li>Check your spam folder for emails from our team</li>
                <li>Ensure your email address is correct in your application</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
