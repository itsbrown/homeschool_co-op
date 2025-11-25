import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/config/stripe';
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CreditCard, DollarSign, Calendar, Check, Clock, FileText, Search } from "lucide-react";

interface Payment {
  id: string;
  date: string;
  amount: number;
  description: string;
  status: 'paid' | 'succeeded' | 'pending' | 'failed' | 'refunded' | 'canceled';
  method: string;
  programName: string;
  childName: string;
  receiptUrl?: string;
  dueDate?: string;
}

interface PaymentManagementProps {
  childId?: string; // Optional child ID to filter payments for a specific child
}

// Stripe payment form for scheduled payments
function ScheduledPaymentForm({ 
  onSuccess, 
  onError,
  onCancel,
  amount
}: { 
  onSuccess: () => void; 
  onError: (error: string) => void;
  onCancel: () => void;
  amount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) {
      onError('Payment system not ready. Please try again.');
      return;
    }

    if (!elementsReady) {
      onError('Please wait for the payment form to load.');
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + '/parent/payments'
        },
        redirect: 'if_required'
      });

      if (error) {
        onError(error.message || 'Payment failed');
        setIsProcessing(false);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess();
      } else if (paymentIntent && paymentIntent.status === 'requires_action') {
        onError('Additional verification required. Please try again.');
        setIsProcessing(false);
      } else {
        onError('Payment status unknown. Please check your payment history.');
        setIsProcessing(false);
      }
    } catch (err: any) {
      onError(err.message || 'An error occurred during payment');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement 
        onReady={() => setElementsReady(true)}
        onLoadError={() => setElementsReady(false)}
      />
      <div className="flex gap-2 pt-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || !elementsReady || isProcessing} 
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Dialog component for scheduled payment with Stripe Elements
interface ScheduledPaymentDialogProps {
  payment: {
    id: string | number;
    amount: number;
    description: string;
    programName?: string;
    childName?: string;
    dueDate?: string;
    installmentNumber?: number;
    totalInstallments?: number;
    paymentPlan?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}

function ScheduledPaymentDialog({ 
  payment, 
  isOpen, 
  onClose, 
  onSuccess,
  formatCurrency,
  formatDate
}: ScheduledPaymentDialogProps) {
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create payment intent when dialog opens
  useEffect(() => {
    if (isOpen && !clientSecret) {
      createPaymentIntent();
    }
  }, [isOpen]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setError(null);
    }
  }, [isOpen]);

  const createPaymentIntent = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('Please sign in to make a payment');
      }

      const response = await fetch('/api/scheduled-payments/pay', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: payment.id,
          amount: payment.amount,
          description: payment.description
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to initialize payment');
      }

      setClientSecret(data.clientSecret);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize payment');
      toast({
        title: "Payment Error",
        description: err.message || 'Failed to initialize payment',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = () => {
    toast({
      title: "Payment Successful",
      description: "Your payment has been processed successfully.",
    });
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] });
    queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments'] });
    onSuccess();
    onClose();
  };

  const handleError = (errorMessage: string) => {
    toast({
      title: "Payment Failed",
      description: errorMessage,
      variant: "destructive",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make Payment</DialogTitle>
          <DialogDescription>
            {payment.installmentNumber && payment.totalInstallments 
              ? `Complete your payment for ${payment.paymentPlan || 'scheduled'} payment ${payment.installmentNumber} of ${payment.totalInstallments}`
              : `Complete your payment for ${payment.description}`
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Payment Summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Payment Summary</h3>
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span>Program:</span>
                <span className="font-medium">{payment.programName || 'Class'}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Child:</span>
                <span className="font-medium">{payment.childName || 'Child'}</span>
              </div>
              {payment.dueDate && (
                <div className="flex justify-between mb-2">
                  <span>Due Date:</span>
                  <span className="font-medium">{formatDate(payment.dueDate)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span>Total:</span>
                <span className="font-bold">{formatCurrency(payment.amount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Initializing payment...</p>
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={createPaymentIntent} variant="outline">
                Try Again
              </Button>
            </div>
          ) : clientSecret ? (
            <Elements 
              stripe={stripePromise} 
              options={{ 
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#1e3a5f',
                  }
                }
              }}
            >
              <ScheduledPaymentForm 
                onSuccess={handleSuccess}
                onError={handleError}
                onCancel={onClose}
                amount={payment.amount}
              />
            </Elements>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PaymentManagement({ childId }: PaymentManagementProps) {
  const { toast } = useToast();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  
  // State for the Stripe payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentForDialog, setSelectedPaymentForDialog] = useState<any>(null);
  
  // Get payment data for the parent (and optionally filtered by child)
  const { data: payments, isLoading, refetch } = useQuery({
    queryKey: ["/api/payment-history", childId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/payment-history/history', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch payment history: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.payments : [];
    },
  });

  // Get outstanding balances from enrollments
  const { data: enrollments, isLoading: isLoadingEnrollments } = useQuery({
    queryKey: ["/api/enrollments", childId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/enrollments', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch enrollments: ${response.status}`);
      }

      return await response.json();
    },
  });

  // Get subscription schedules for upcoming payments tab (Stripe-managed)
  const { data: scheduledPayments, isLoading: isLoadingScheduled } = useQuery({
    queryKey: ["/api/stripe/subscription-schedules", childId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/stripe/subscription-schedules', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch subscription schedules: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !data.schedules) {
        return [];
      }

      // Transform Stripe schedules to match payment structure expected by UI
      return data.schedules
        .filter((schedule: any) => schedule.status === 'active')
        .map((schedule: any) => {
          // Get the current phase using the numeric index
          const currentPhaseIndex = schedule.currentPhaseIndex || 0;
          const currentPhase = schedule.phases?.[currentPhaseIndex];
          const nextPhase = schedule.phases?.[currentPhaseIndex + 1];
          
          // Calculate next payment date from next phase start or current phase end
          const dueDate = nextPhase?.start_date 
            ? new Date(nextPhase.start_date * 1000)
            : currentPhase?.end_date 
            ? new Date(currentPhase.end_date * 1000)
            : new Date();

          // Get amount from current phase items (in cents)
          const amount = currentPhase?.items?.[0]?.price_data?.unit_amount 
            || currentPhase?.items?.[0]?.price?.unit_amount 
            || 0;
          
          return {
            id: schedule.id,
            amount: amount,
            dueDate: dueDate,
            status: 'pending',
            childName: schedule.metadata?.childName || 'Child',
            className: schedule.metadata?.className || 'Class',
            description: schedule.metadata?.description || 'Upcoming payment',
            stripeScheduleId: schedule.id,
            installmentNumber: currentPhaseIndex + 1,
            totalInstallments: schedule.phases?.length || 0,
            source: 'stripe' as const
          };
        });
    },
  });

  // Get database-stored scheduled payments (class enrollments)
  const { data: dbScheduledPayments, isLoading: isLoadingDbScheduled } = useQuery({
    queryKey: ["/api/scheduled-payments/upcoming"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/scheduled-payments/upcoming', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch scheduled payments: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !data.payments) {
        return [];
      }

      // Transform database payments to match UI structure
      return data.payments.map((payment: any) => ({
        id: payment.id,
        amount: payment.amount,
        dueDate: new Date(payment.dueDate),
        status: payment.status,
        childName: payment.enrollment?.childName || 'Child',
        className: payment.enrollment?.className || 'Class',
        description: payment.description || `Payment for ${payment.enrollment?.className || 'class'}`,
        enrollmentId: payment.enrollmentId,
        installmentNumber: payment.installmentNumber,
        totalInstallments: payment.totalInstallments,
        paymentPlan: payment.paymentPlan,
        source: 'database' as const
      }));
    },
  });

  // Get Stripe payment history for user
  const { data: stripePayments, isLoading: isLoadingStripePayments } = useQuery({
    queryKey: ["/api/stripe/payment-history"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/stripe/payment-history', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Stripe payment history: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.payments : [];
    },
  });
  
  // Filter payments based on search and status
  const filteredPayments = React.useMemo(() => {
    if (!payments) return [];
    
    return payments.filter((payment: Payment) => {
      // Filter by search query
      const matchesSearch = 
        (payment.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (payment.programName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (payment.childName || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      // Filter by status - treat 'succeeded' and 'paid' as equivalent
      let matchesStatus = filterStatus === 'all';
      if (!matchesStatus) {
        if (filterStatus === 'paid') {
          // Show both 'paid' and 'succeeded' for the "Paid" filter
          matchesStatus = payment.status === 'paid' || payment.status === 'succeeded';
        } else if (filterStatus === 'succeeded') {
          // Also allow filtering by 'succeeded' specifically
          matchesStatus = payment.status === 'succeeded' || payment.status === 'paid';
        } else {
          matchesStatus = payment.status === filterStatus;
        }
      }
      
      return matchesSearch && matchesStatus;
    });
  }, [payments, searchQuery, filterStatus]);
  
  // Calculate outstanding balances from enrollments
  const outstandingBalances = React.useMemo(() => {
    if (!enrollments) return [];
    
    const enrollmentGroups = enrollments.reduce((acc: any, enrollment: any) => {
      const key = `${enrollment.classId}-${enrollment.childId}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(enrollment);
      return acc;
    }, {});

    const unpaidEnrollments = [];
    for (const [key, groupEnrollments] of Object.entries(enrollmentGroups)) {
      const enrollmentList = groupEnrollments as any[];
      const sortedEnrollments = enrollmentList.sort((a, b) => 
        new Date(b.enrollmentDate).getTime() - new Date(a.enrollmentDate).getTime()
      );

      const latestEnrollment = sortedEnrollments[0];
      const hasBalance = latestEnrollment.remainingBalance > 0;
      const hasFullyPaidEnrollment = sortedEnrollments.some((e: any) => 
        e.status === 'enrolled' && e.remainingBalance === 0
      );

      if (hasBalance || (!hasFullyPaidEnrollment && latestEnrollment.status === 'pending_payment' && latestEnrollment.remainingBalance > 0)) {
        unpaidEnrollments.push(latestEnrollment);
      }
    }
    
    return unpaidEnrollments;
  }, [enrollments]);

  // Group payments by status for the overview tab, including outstanding balances
  const paymentStats = React.useMemo(() => {
    const paymentData = payments || [];
    const outstandingData = outstandingBalances || [];
    
    const stats = paymentData.reduce((acc: any, payment: Payment) => {
      // Count by exact status for filtering
      acc[payment.status] = (acc[payment.status] || 0) + 1;
      acc.total += 1;
      
      // Accumulate totals for each payment type (treat 'succeeded' and 'paid' as successful)
      if (payment.status === 'paid' || payment.status === 'succeeded') {
        acc.totalPaid = (acc.totalPaid || 0) + payment.amount;
        acc.successfulCount = (acc.successfulCount || 0) + 1;
      } else if (payment.status === 'pending') {
        acc.totalPending = (acc.totalPending || 0) + payment.amount;
      }
      
      return acc;
    }, { paid: 0, succeeded: 0, pending: 0, failed: 0, refunded: 0, canceled: 0, total: 0, totalPaid: 0, totalPending: 0, totalOutstanding: 0, outstandingCount: 0, successfulCount: 0 });
    
    // Add outstanding balances
    stats.totalOutstanding = outstandingData.reduce((total: number, enrollment: any) => 
      total + (enrollment.remainingBalance || 0), 0
    );
    stats.outstandingCount = outstandingData.length;
    
    return stats;
  }, [payments, outstandingBalances]);
  
  // Format currency amount
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
      case 'succeeded':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Check className="mr-1 h-3 w-3" /> Paid
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="mr-1 h-3 w-3" /> Pending
          </Badge>
        );
      case 'failed':
      case 'canceled':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        );
      case 'refunded':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <DollarSign className="mr-1 h-3 w-3" /> Refunded
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  return (
    <div className="space-y-6">
      <Tabs defaultValue="all-payments" className="w-full">
        <TabsList className="w-full flex-col sm:flex-row justify-start h-auto">
          <TabsTrigger value="overview" className="w-full sm:w-auto sm:mr-2">Overview</TabsTrigger>
          <TabsTrigger value="all-payments" className="w-full sm:w-auto sm:mr-2">All Payments</TabsTrigger>
          <TabsTrigger value="stripe-payments" className="w-full sm:w-auto sm:mr-2">Stripe Payments</TabsTrigger>
          <TabsTrigger value="upcoming" className="w-full sm:w-auto">Upcoming Payments</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(paymentStats.totalPaid || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentStats.successfulCount || 0} successful payments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {isLoadingEnrollments ? "Loading..." : formatCurrency(paymentStats.totalOutstanding || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentStats.outstandingCount || 0} unpaid enrollments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(paymentStats.totalPending || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentStats.pending || 0} pending payments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? "Loading..." : paymentStats.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total payments
                </p>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your most recent payments</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading payment data...</p>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p>No payment records found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPayments.slice(0, 5).map((payment: Payment) => (
                    <div key={payment.id} className="flex justify-between items-center p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center 
                          ${payment.status === 'paid' || payment.status === 'succeeded' ? 'bg-green-100 text-green-700' : 
                            payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            payment.status === 'refunded' ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'}`}>
                          {payment.status === 'paid' || payment.status === 'succeeded' ? <Check className="h-5 w-5" /> : 
                           payment.status === 'pending' ? <Clock className="h-5 w-5" /> :
                           payment.status === 'refunded' ? <DollarSign className="h-5 w-5" /> :
                           <AlertCircle className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="font-medium">{payment.description}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(payment.date)} • {payment.childName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(payment.amount)}</p>
                        <p className="text-sm">{getStatusBadge(payment.status)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <a href="#all-payments">View All Payments</a>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* All Payments Tab */}
        <TabsContent value="all-payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>View and manage all your payments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search payments..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full md:w-36">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid / Succeeded</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading payment data...</p>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p>No payment records found</p>
                  {searchQuery && (
                    <p className="text-sm mt-2">Try adjusting your search or filters</p>
                  )}
                </div>
              ) : (
                <Table>
                  <TableCaption>A list of your payment history</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Child</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment: Payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.date)}</TableCell>
                        <TableCell className="font-medium">{payment.description}</TableCell>
                        <TableCell>{payment.childName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {payment.status === 'pending' && (
                              <Button 
                                size="sm" 
                                onClick={() => {
                                  setSelectedPaymentForDialog({
                                    id: payment.id,
                                    amount: payment.amount,
                                    description: payment.description,
                                    programName: payment.programName,
                                    childName: payment.childName,
                                    dueDate: payment.dueDate || payment.date
                                  });
                                  setPaymentDialogOpen(true);
                                }}
                                data-testid={`button-pay-now-${payment.id}`}
                              >
                                Pay Now
                              </Button>
                            )}
                            
                            {payment.status === 'paid' && payment.receiptUrl && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                                  <FileText className="mr-2 h-4 w-4" />
                                  Receipt
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stripe Payments Tab */}
        <TabsContent value="stripe-payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stripe Payment History</CardTitle>
              <CardDescription>View all payments processed through Stripe (membership subscriptions)</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingStripePayments ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading Stripe payment history...</p>
                </div>
              ) : stripePayments && stripePayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No Stripe payments found</p>
                  <p className="text-sm mt-2">Stripe payments will appear here once you have active subscriptions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Subscription ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stripePayments?.map((payment: any) => (
                      <TableRow key={payment.id} data-testid={`row-stripe-payment-${payment.id}`}>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                            {formatDate(payment.createdDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{payment.description || 'Stripe Payment'}</div>
                            {payment.paymentIntentId && (
                              <div className="text-xs text-muted-foreground mt-1">
                                ID: {payment.paymentIntentId}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground capitalize">
                            {payment.paymentMethod || 'Unknown'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{formatCurrency(payment.amount)}</span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(payment.status)}
                        </TableCell>
                        <TableCell>
                          {payment.subscriptionId ? (
                            <div className="text-xs text-muted-foreground font-mono">
                              {payment.subscriptionId}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Upcoming Payments Tab */}
        <TabsContent value="upcoming" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Payments</CardTitle>
              <CardDescription>Payments scheduled for the future</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || isLoadingScheduled || isLoadingDbScheduled ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading upcoming payments...</p>
                </div>
              ) : (
                (() => {
                  // Combine payment history items with due dates and scheduled payments
                  const pendingPayments = filteredPayments
                    .filter((p: Payment) => p.status === 'pending' && p.dueDate)
                    .map((p: Payment) => ({
                      ...p,
                      source: 'payment_history'
                    }));
                  
                  // Stripe-managed scheduled payments
                  const scheduledPaymentItems = (scheduledPayments || [])
                    .map((sp: any) => ({
                      id: sp.id,
                      description: sp.description || `${sp.className} - ${sp.childName}`,
                      amount: sp.amount,
                      dueDate: sp.dueDate,
                      status: 'pending',
                      childName: sp.childName,
                      programName: sp.className,
                      source: 'stripe_scheduled',
                      installmentNumber: sp.installmentNumber,
                      totalInstallments: sp.totalInstallments
                    }));
                  
                  // Database-stored scheduled payments (class enrollments)
                  const dbScheduledPaymentItems = (dbScheduledPayments || [])
                    .map((sp: any) => ({
                      id: sp.id,
                      description: sp.description || `${sp.className} - ${sp.childName}`,
                      amount: sp.amount,
                      dueDate: sp.dueDate,
                      status: sp.status || 'pending',
                      childName: sp.childName,
                      programName: sp.className,
                      source: 'database_scheduled',
                      installmentNumber: sp.installmentNumber,
                      totalInstallments: sp.totalInstallments,
                      paymentPlan: sp.paymentPlan
                    }));
                  
                  const allUpcomingPayments = [...pendingPayments, ...scheduledPaymentItems, ...dbScheduledPaymentItems]
                    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
                  
                  return allUpcomingPayments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p>No upcoming payments scheduled</p>
                      <p className="text-sm mt-1">All your payments are currently up to date</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {allUpcomingPayments.map((payment: any) => (
                        <div 
                          key={`${payment.source}-${payment.id}`} 
                          className={`flex justify-between items-center p-4 border rounded-lg ${
                            payment.source === 'database_scheduled' 
                              ? 'border-l-4 border-l-blue-500' 
                              : payment.source === 'stripe_scheduled'
                              ? 'border-l-4 border-l-purple-500'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                              payment.source === 'database_scheduled'
                                ? 'bg-blue-100 text-blue-700'
                                : payment.source === 'stripe_scheduled'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              <Calendar className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{payment.description}</h3>
                                {payment.source === 'database_scheduled' && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                    Class Enrollment
                                  </Badge>
                                )}
                                {payment.source === 'stripe_scheduled' && (
                                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                    Stripe Managed
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Due: {formatDate(payment.dueDate!)} • {payment.childName}
                                {payment.installmentNumber && payment.totalInstallments && (
                                  <span> • Installment {payment.installmentNumber} of {payment.totalInstallments}</span>
                                )}
                              </p>
                              {payment.paymentPlan && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Plan: {payment.paymentPlan}
                                </p>
                              )}
                            </div>
                          </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(payment.amount)}</p>
                          </div>
                          <Button 
                            size="sm"
                            onClick={() => {
                              setSelectedPaymentForDialog({
                                id: payment.id,
                                amount: payment.amount,
                                description: payment.description,
                                programName: payment.programName,
                                childName: payment.childName,
                                dueDate: payment.dueDate,
                                installmentNumber: payment.installmentNumber,
                                totalInstallments: payment.totalInstallments,
                                paymentPlan: payment.paymentPlan
                              });
                              setPaymentDialogOpen(true);
                            }}
                            data-testid={`button-pay-upcoming-${payment.id}`}
                          >
                            Pay Now
                          </Button>
                        </div>
                      </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Stripe Payment Dialog */}
      {selectedPaymentForDialog && (
        <ScheduledPaymentDialog
          payment={selectedPaymentForDialog}
          isOpen={paymentDialogOpen}
          onClose={() => {
            setPaymentDialogOpen(false);
            setSelectedPaymentForDialog(null);
          }}
          onSuccess={() => {
            refetch();
            refetchDbScheduledPayments();
          }}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}

