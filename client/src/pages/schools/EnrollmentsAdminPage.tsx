import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, DollarSign, Edit, Loader2, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { formatCurrency, centsToDollars } from "@/utils/currency";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Enrollment {
  id: number;
  className: string;
  childName: string;
  paymentPlan?: string;
  paymentFrequency?: string;
  totalCost: number;
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: string;
  status?: string;
  waitlistPosition?: number | null;
  programStartDate?: string;
  programEndDate?: string;
  metadata?: {
    paymentPlanHistory?: Array<{
      timestamp: string;
      adminEmail: string;
      oldFrequency: string;
      newFrequency: string;
      comment: string;
    }>;
    stripeUpdateResult?: {
      status: string;
      message?: string;
      scheduleId?: string;
    };
  };
}

interface PaymentPlanPreview {
  frequency: string;
  numberOfPayments: number;
  paymentAmount: number;
  finalPaymentAmount: number;
  paymentDates: string[];
  totalAmount: number;
}

interface FrequencyPreviewData {
  valid: boolean;
  schedule?: PaymentPlanPreview;
  errors?: string[];
}

interface PaymentPlanDetails {
  enrollment: Enrollment & { currentFrequency?: string };
  frequencyPreviews: Record<string, FrequencyPreviewData>;
  paymentPlanHistory: Array<{
    timestamp: string;
    adminEmail: string;
    oldFrequency: string;
    newFrequency: string;
    comment: string;
  }>;
}

export default function EnrollmentsAdminPage() {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [paymentPlanDetails, setPaymentPlanDetails] = useState<PaymentPlanDetails | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<string>("");
  const [adminComment, setAdminComment] = useState("");

  // Fetch all enrollments for the school
  const { data: enrollments = [], isLoading, refetch } = useQuery<Enrollment[]>({
    queryKey: ["/api/school-admin/enrollments"],
  });

  // Fetch payment plan details for selected enrollment
  const { data: planDetails, isLoading: loadingPlanDetails } = useQuery<PaymentPlanDetails>({
    queryKey: ["/api/admin/enrollments", selectedEnrollment?.id, "payment-plan"],
    enabled: !!selectedEnrollment,
  });

  // Handle plan details update
  useEffect(() => {
    if (planDetails) {
      setPaymentPlanDetails(planDetails);
      setSelectedFrequency(planDetails.enrollment.currentFrequency || planDetails.enrollment.paymentFrequency || "one_time");
    }
  }, [planDetails]);

  // Update payment plan mutation
  const updatePaymentPlan = useMutation({
    mutationFn: async ({
      enrollmentId,
      paymentFrequency,
      adminComment,
    }: {
      enrollmentId: number;
      paymentFrequency: string;
      adminComment: string;
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/enrollments/${enrollmentId}/payment-plan`,
        { paymentFrequency, adminComment }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || "Failed to update payment plan");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Plan Updated",
        description: `Successfully updated to ${data.newSchedule.frequency} payment plan`,
      });
      
      // Show Stripe review warning if needed
      if (data.stripeUpdate?.status === "manual_review_required") {
        toast({
          title: "Stripe Review Required",
          description: `Stripe subscription schedule ${data.stripeUpdate.scheduleId} requires manual review`,
          variant: "default",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrollments", selectedEnrollment?.id] });
      setEditDialogOpen(false);
      setSelectedEnrollment(null);
      setAdminComment("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Payment Plan",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setEditDialogOpen(true);
  };

  const handlePromoteFromWaitlist = async (enrollment: Enrollment) => {
    try {
      const response = await apiRequest(
        "PUT",
        `/api/program-enrollments/${enrollment.id}`,
        { status: 'pending_payment', waitlistPosition: null }
      );
      
      if (!response.ok) {
        throw new Error("Failed to promote from waitlist");
      }
      
      toast({
        title: "Student Promoted",
        description: `${enrollment.childName} has been promoted from the waitlist for ${enrollment.className}. They can now proceed with payment.`,
      });
      
      // Refresh the enrollments list
      refetch();
    } catch (error) {
      console.error("Failed to promote from waitlist:", error);
      toast({
        title: "Error",
        description: "Failed to promote student from waitlist. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsEnrolled = async (enrollment: Enrollment) => {
    try {
      const response = await apiRequest(
        "PUT",
        `/api/program-enrollments/${enrollment.id}`,
        { 
          status: 'enrolled',
          totalPaid: enrollment.totalCost,
          remainingBalance: 0,
          paymentStatus: 'completed'
        }
      );
      
      if (!response.ok) {
        throw new Error("Failed to update enrollment status");
      }
      
      toast({
        title: "Enrollment Activated",
        description: `${enrollment.childName} is now enrolled in ${enrollment.className}.`,
      });
      
      // Refresh the enrollments list
      refetch();
    } catch (error) {
      console.error("Failed to mark as enrolled:", error);
      toast({
        title: "Error",
        description: "Failed to update enrollment status. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSavePaymentPlan = () => {
    if (!selectedEnrollment || !selectedFrequency) return;
    
    if (!adminComment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a reason for changing the payment plan",
        variant: "destructive",
      });
      return;
    }

    updatePaymentPlan.mutate({
      enrollmentId: selectedEnrollment.id,
      paymentFrequency: selectedFrequency,
      adminComment: adminComment.trim(),
    });
  };

  const formatFrequency = (freq: string | undefined) => {
    if (!freq) return "One-time";
    const map: Record<string, string> = {
      weekly: "Weekly",
      biweekly: "Bi-weekly",
      monthly: "Monthly",
      one_time: "One-time",
    };
    return map[freq] || freq;
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "paid":
      case "active":
        return "default";
      case "pending_payment":
        return "secondary";
      case "overdue":
        return "destructive";
      default:
        return "outline";
    }
  };

  const selectedPreviewData = paymentPlanDetails && selectedFrequency && paymentPlanDetails.frequencyPreviews[selectedFrequency];
  const selectedPreview = selectedPreviewData && 'valid' in selectedPreviewData && selectedPreviewData.valid ? selectedPreviewData.schedule : null;
  const hasError = selectedPreviewData && 'valid' in selectedPreviewData && !selectedPreviewData.valid;

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Enrollment Management">
        <div className="flex justify-center items-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Enrollment Management">
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Enrollment Management</h1>
            <p className="text-muted-foreground">Manage student enrollments and payment plans</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active Enrollments</CardTitle>
            <CardDescription>
              View and edit payment plans for student enrollments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Payment Plan</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No enrollments found
                    </TableCell>
                  </TableRow>
                ) : (
                  enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell className="font-medium">{enrollment.childName}</TableCell>
                      <TableCell>{enrollment.className}</TableCell>
                      <TableCell>{formatFrequency(enrollment.paymentFrequency)}</TableCell>
                      <TableCell>{formatCurrency(enrollment.totalCost)}</TableCell>
                      <TableCell>{formatCurrency(enrollment.totalPaid)}</TableCell>
                      <TableCell>{formatCurrency(enrollment.remainingBalance)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {enrollment.status === 'waitlist' ? (
                            <>
                              <Badge variant="secondary">
                                Waitlist
                              </Badge>
                              {enrollment.waitlistPosition && (
                                <span className="text-xs text-muted-foreground">
                                  Position #{enrollment.waitlistPosition}
                                </span>
                              )}
                            </>
                          ) : (
                            <Badge variant={getStatusBadgeVariant(enrollment.paymentStatus)}>
                              {enrollment.paymentStatus}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {enrollment.status === 'waitlist' ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePromoteFromWaitlist(enrollment)}
                              data-testid={`button-promote-${enrollment.id}`}
                            >
                              Promote
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditClick(enrollment)}
                                data-testid={`button-edit-payment-plan-${enrollment.id}`}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Plan
                              </Button>
                              {(enrollment.paymentStatus === 'pending_payment' || enrollment.paymentStatus === 'pending') && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleMarkAsEnrolled(enrollment)}
                                  data-testid={`button-mark-enrolled-${enrollment.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Mark Enrolled
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Payment Plan Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Payment Plan</DialogTitle>
              <DialogDescription>
                Update the payment frequency for {selectedEnrollment?.childName}'s enrollment
                in {selectedEnrollment?.className}
              </DialogDescription>
            </DialogHeader>

            {loadingPlanDetails ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : paymentPlanDetails ? (
              <div className="space-y-6">
                {/* Current Plan */}
                <div>
                  <h3 className="font-semibold mb-2">Current Payment Plan</h3>
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span>Frequency:</span>
                      <span className="font-medium">
                        {formatFrequency(paymentPlanDetails.enrollment.currentFrequency || paymentPlanDetails.enrollment.paymentFrequency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Cost:</span>
                      <span className="font-medium">{formatCurrency(paymentPlanDetails.enrollment.totalCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Paid:</span>
                      <span className="font-medium">{formatCurrency(paymentPlanDetails.enrollment.totalPaid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Remaining Balance:</span>
                      <span className="font-medium">{formatCurrency(paymentPlanDetails.enrollment.remainingBalance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Program Dates:</span>
                      <span className="font-medium">
                        {formatDate(paymentPlanDetails.enrollment.programStartDate)} - {formatDate(paymentPlanDetails.enrollment.programEndDate)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* New Frequency Selector */}
                <div className="space-y-2">
                  <Label htmlFor="payment-frequency">New Payment Frequency</Label>
                  <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
                    <SelectTrigger id="payment-frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_time">One-time Payment</SelectItem>
                      <SelectItem value="weekly">Weekly Installments</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly Installments</SelectItem>
                      <SelectItem value="monthly">Monthly Installments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview of New Plan */}
                {selectedPreviewData && (
                  <div>
                    <h3 className="font-semibold mb-2">Preview: {formatFrequency(selectedFrequency)} Plan</h3>
                    {hasError ? (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {(selectedPreviewData as any).errors?.join(', ') || 'Invalid payment plan configuration'}
                        </AlertDescription>
                      </Alert>
                    ) : selectedPreview ? (
                      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <span>Number of Payments:</span>
                          <span className="font-medium">{selectedPreview.numberOfPayments}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Payment Amount:</span>
                          <span className="font-medium">
                            {formatCurrency(selectedPreview.paymentAmount)}
                          </span>
                        </div>
                        {selectedPreview.finalPaymentAmount !== selectedPreview.paymentAmount && (
                          <div className="flex justify-between">
                            <span>Final Payment:</span>
                            <span className="font-medium">
                              {formatCurrency(selectedPreview.finalPaymentAmount)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>First Payment Date:</span>
                          <span className="font-medium">
                            {formatDate(selectedPreview.paymentDates[0])}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Last Payment Date:</span>
                          <span className="font-medium">
                            {formatDate(selectedPreview.paymentDates[selectedPreview.paymentDates.length - 1])}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Admin Comment */}
                <div className="space-y-2">
                  <Label htmlFor="admin-comment">Reason for Change (Required)</Label>
                  <Textarea
                    id="admin-comment"
                    placeholder="Explain why you're changing the payment plan..."
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    rows={3}
                    data-testid="textarea-admin-comment"
                  />
                </div>

                {/* Payment Plan History */}
                {paymentPlanDetails.paymentPlanHistory && paymentPlanDetails.paymentPlanHistory.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Change History
                    </h3>
                    <div className="space-y-2">
                      {paymentPlanDetails.paymentPlanHistory.map((entry, index) => (
                        <div key={index} className="bg-muted p-3 rounded text-sm">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium">
                              {formatFrequency(entry.oldFrequency)} → {formatFrequency(entry.newFrequency)}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-muted-foreground">
                            By: {entry.adminEmail}
                          </div>
                          {entry.comment && (
                            <div className="mt-1 italic">"{entry.comment}"</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stripe Status Warning */}
                {paymentPlanDetails.enrollment.metadata?.stripeUpdateResult?.status === "manual_review_required" && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Stripe Review Required:</strong> This enrollment has a Stripe subscription
                      schedule ({paymentPlanDetails.enrollment.metadata.stripeUpdateResult.scheduleId}) that
                      requires manual review and update.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setSelectedEnrollment(null);
                  setAdminComment("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSavePaymentPlan}
                disabled={updatePaymentPlan.isPending || hasError || !adminComment.trim()}
                data-testid="button-save-payment-plan"
              >
                {updatePaymentPlan.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SchoolAdminLayout>
  );
}
