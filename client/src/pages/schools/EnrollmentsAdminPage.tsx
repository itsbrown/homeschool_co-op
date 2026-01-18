import { useState, useEffect, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Calendar, 
  DollarSign, 
  Edit, 
  Loader2, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  RotateCcw,
  Users,
  ClipboardList,
  Search,
  MoreHorizontal,
  Mail,
  Eye,
  LayoutGrid,
  LayoutList,
  TrendingUp
} from "lucide-react";
import { formatCurrency } from "@/utils/currency";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefundDialog } from "@/components/payments/RefundDialog";
import { cn } from "@/lib/utils";

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
  parentEmail?: string;
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

type StatusFilter = 'all' | 'enrolled' | 'waitlist' | 'pending_payment' | 'cancelled';

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  trend,
  trendValue 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {trend && trendValue && (
          <p className={cn(
            "text-xs flex items-center mt-1",
            trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'
          )}>
            {trend === 'up' && <TrendingUp className="h-3 w-3 mr-1" />}
            {trendValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-[100px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[80px]" />
              <Skeleton className="h-3 w-[120px] mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[200px]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentProgressBar({ paid, total }: { paid: number; total: number }) {
  const percentage = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const isComplete = percentage >= 100;
  
  return (
    <div className="w-full min-w-[100px]">
      <Progress 
        value={percentage} 
        className={cn("h-2", isComplete ? "[&>div]:bg-green-500" : "")}
      />
      <p className="text-xs text-muted-foreground mt-1">
        {Math.round(percentage)}% paid
      </p>
    </div>
  );
}

export default function EnrollmentsAdminPage() {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [paymentPlanDetails, setPaymentPlanDetails] = useState<PaymentPlanDetails | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<string>("");
  const [adminComment, setAdminComment] = useState("");
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundEnrollment, setRefundEnrollment] = useState<Enrollment | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

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

  // Calculate metrics from enrollments (values are in cents, formatCurrency handles conversion)
  const metrics = useMemo(() => {
    const totalEnrolled = enrollments.filter(e => e.status === 'enrolled' || e.status === 'active').length;
    const totalWaitlist = enrollments.filter(e => e.status === 'waitlist').length;
    const totalPending = enrollments.filter(e => 
      e.status === 'pending_payment' || e.paymentStatus === 'pending' || e.paymentStatus === 'pending_payment'
    ).length;
    const totalRevenue = enrollments.reduce((sum, e) => sum + (e.totalPaid || 0), 0);
    const totalOutstanding = enrollments.reduce((sum, e) => sum + (e.remainingBalance || 0), 0);
    
    return {
      totalEnrolled,
      totalWaitlist,
      totalPending,
      totalRevenue,
      totalOutstanding,
      total: enrollments.length
    };
  }, [enrollments]);

  // Filter enrollments based on status and search
  const filteredEnrollments = useMemo(() => {
    return enrollments.filter(enrollment => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'enrolled' && enrollment.status !== 'enrolled' && enrollment.status !== 'active') {
          return false;
        }
        if (statusFilter === 'waitlist' && enrollment.status !== 'waitlist') {
          return false;
        }
        if (statusFilter === 'pending_payment' && 
            enrollment.status !== 'pending_payment' && 
            enrollment.paymentStatus !== 'pending' && 
            enrollment.paymentStatus !== 'pending_payment') {
          return false;
        }
        if (statusFilter === 'cancelled' && enrollment.status !== 'cancelled') {
          return false;
        }
      }
      
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          enrollment.childName?.toLowerCase().includes(search) ||
          enrollment.className?.toLowerCase().includes(search) ||
          enrollment.parentEmail?.toLowerCase().includes(search)
        );
      }
      
      return true;
    });
  }, [enrollments, statusFilter, searchTerm]);

  // Count by status for tabs
  const statusCounts = useMemo(() => ({
    all: enrollments.length,
    enrolled: enrollments.filter(e => e.status === 'enrolled' || e.status === 'active').length,
    waitlist: enrollments.filter(e => e.status === 'waitlist').length,
    pending_payment: enrollments.filter(e => 
      e.status === 'pending_payment' || e.paymentStatus === 'pending' || e.paymentStatus === 'pending_payment'
    ).length,
    cancelled: enrollments.filter(e => e.status === 'cancelled').length,
  }), [enrollments]);

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
      case "completed":
      case "enrolled":
        return "default";
      case "pending_payment":
      case "pending_admin_approval":
      case "pending":
        return "secondary";
      case "overdue":
        return "destructive";
      case "waitlist":
        return "outline";
      default:
        return "outline";
    }
  };

  const getStatusDisplayText = (enrollment: Enrollment) => {
    if (enrollment.status === 'waitlist') {
      return `Waitlist #${enrollment.waitlistPosition || '?'}`;
    }
    if (enrollment.status === 'pending_admin_approval') {
      return 'Pending Approval';
    }
    if (enrollment.status === 'enrolled' || enrollment.status === 'active') {
      return 'Enrolled';
    }
    return enrollment.paymentStatus || enrollment.status || 'Unknown';
  };

  const selectedPreviewData = paymentPlanDetails && selectedFrequency && paymentPlanDetails.frequencyPreviews[selectedFrequency];
  const selectedPreview = selectedPreviewData && 'valid' in selectedPreviewData && selectedPreviewData.valid ? selectedPreviewData.schedule : null;
  const hasError = selectedPreviewData && 'valid' in selectedPreviewData && !selectedPreviewData.valid;

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Enrollment Management">
        <div className="container mx-auto p-4">
          <LoadingState />
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Enrollment Management">
      <div className="container mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Enrollment Management</h1>
            <p className="text-muted-foreground">Manage student enrollments and payment plans</p>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Enrolled"
            value={metrics.totalEnrolled}
            subtitle={`of ${metrics.total} total enrollments`}
            icon={Users}
          />
          <MetricCard
            title="Waitlist"
            value={metrics.totalWaitlist}
            subtitle="students waiting"
            icon={ClipboardList}
          />
          <MetricCard
            title="Pending Payment"
            value={metrics.totalPending}
            subtitle="awaiting payment"
            icon={Clock}
          />
          <MetricCard
            title="Revenue Collected"
            value={formatCurrency(metrics.totalRevenue)}
            subtitle={`${formatCurrency(metrics.totalOutstanding)} outstanding`}
            icon={DollarSign}
          />
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Enrollments</CardTitle>
                <CardDescription>
                  {filteredEnrollments.length} of {enrollments.length} enrollments
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search student, class..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-[200px] sm:w-[250px]"
                  />
                </div>
                <div className="hidden sm:flex border rounded-md">
                  <Button
                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    className="rounded-r-none"
                  >
                    <LayoutList className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('cards')}
                    className="rounded-l-none"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          {/* Status Tabs */}
          <div className="px-6 pb-4">
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
                <TabsTrigger value="all" className="text-xs sm:text-sm">
                  All ({statusCounts.all})
                </TabsTrigger>
                <TabsTrigger value="enrolled" className="text-xs sm:text-sm">
                  Enrolled ({statusCounts.enrolled})
                </TabsTrigger>
                <TabsTrigger value="waitlist" className="text-xs sm:text-sm">
                  Waitlist ({statusCounts.waitlist})
                </TabsTrigger>
                <TabsTrigger value="pending_payment" className="text-xs sm:text-sm">
                  Pending ({statusCounts.pending_payment})
                </TabsTrigger>
                <TabsTrigger value="cancelled" className="text-xs sm:text-sm">
                  Cancelled ({statusCounts.cancelled})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <CardContent>
            {viewMode === 'table' ? (
              /* Table View */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead className="hidden md:table-cell">Class</TableHead>
                      <TableHead className="hidden lg:table-cell">Payment Plan</TableHead>
                      <TableHead>Payment Progress</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEnrollments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {searchTerm || statusFilter !== 'all' 
                            ? 'No enrollments match your filters'
                            : 'No enrollments found'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEnrollments.map((enrollment) => (
                        <TableRow key={enrollment.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{enrollment.childName}</div>
                              <div className="text-sm text-muted-foreground md:hidden">
                                {enrollment.className}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{enrollment.className}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {formatFrequency(enrollment.paymentFrequency)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <PaymentProgressBar 
                                paid={enrollment.totalPaid} 
                                total={enrollment.totalCost} 
                              />
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(enrollment.totalPaid)} / {formatCurrency(enrollment.totalCost)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(enrollment.status || enrollment.paymentStatus)}>
                              {getStatusDisplayText(enrollment)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {enrollment.status === 'waitlist' ? (
                                  <DropdownMenuItem onClick={() => handlePromoteFromWaitlist(enrollment)}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Promote from Waitlist
                                  </DropdownMenuItem>
                                ) : (
                                  <>
                                    <DropdownMenuItem onClick={() => handleEditClick(enrollment)}>
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit Payment Plan
                                    </DropdownMenuItem>
                                    {(enrollment.paymentStatus === 'pending_payment' || enrollment.paymentStatus === 'pending') && (
                                      <DropdownMenuItem onClick={() => handleMarkAsEnrolled(enrollment)}>
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Mark as Enrolled
                                      </DropdownMenuItem>
                                    )}
                                    {enrollment.status === 'pending_admin_approval' && (
                                      <DropdownMenuItem onClick={() => handleMarkAsEnrolled(enrollment)}>
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Approve Enrollment
                                      </DropdownMenuItem>
                                    )}
                                    {enrollment.totalPaid > 0 && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem 
                                          onClick={() => {
                                            setRefundEnrollment(enrollment);
                                            setRefundDialogOpen(true);
                                          }}
                                          className="text-red-600"
                                        >
                                          <RotateCcw className="h-4 w-4 mr-2" />
                                          Issue Refund
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              /* Card View - Mobile Friendly */
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredEnrollments.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-8">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'No enrollments match your filters'
                      : 'No enrollments found'}
                  </div>
                ) : (
                  filteredEnrollments.map((enrollment) => (
                    <Card key={enrollment.id} className="relative">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{enrollment.childName}</CardTitle>
                            <CardDescription>{enrollment.className}</CardDescription>
                          </div>
                          <Badge variant={getStatusBadgeVariant(enrollment.status || enrollment.paymentStatus)}>
                            {getStatusDisplayText(enrollment)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Payment Progress</div>
                          <PaymentProgressBar 
                            paid={enrollment.totalPaid} 
                            total={enrollment.totalCost} 
                          />
                          <div className="flex justify-between text-sm mt-1">
                            <span>{formatCurrency(enrollment.totalPaid)} paid</span>
                            <span>{formatCurrency(enrollment.remainingBalance)} remaining</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Plan:</span>
                          <span>{formatFrequency(enrollment.paymentFrequency)}</span>
                        </div>

                        <div className="flex gap-2 pt-2 border-t">
                          {enrollment.status === 'waitlist' ? (
                            <Button
                              variant="default"
                              size="sm"
                              className="flex-1"
                              onClick={() => handlePromoteFromWaitlist(enrollment)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Promote
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => handleEditClick(enrollment)}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Plan
                              </Button>
                              {enrollment.totalPaid > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setRefundEnrollment(enrollment);
                                    setRefundDialogOpen(true);
                                  }}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
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

        {/* Refund Dialog */}
        <RefundDialog
          enrollment={refundEnrollment}
          open={refundDialogOpen}
          onOpenChange={setRefundDialogOpen}
          onSuccess={() => {
            refetch();
            setRefundEnrollment(null);
          }}
        />
      </div>
    </SchoolAdminLayout>
  );
}
