import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

export default function PaymentManagement({ childId }: PaymentManagementProps) {
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState("credit_card");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  
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
  
  // Handle making a payment
  const handlePayment = async (paymentId: string) => {
    try {
      const response = await apiRequest("POST", `/api/payments/${paymentId}/pay`, {
        method: paymentMethod
      });
      
      if (!response.ok) {
        throw new Error("Payment failed");
      }
      
      toast({
        title: "Payment Successful",
        description: "Your payment has been processed successfully.",
      });
      
      // Refresh the payment data
      refetch();
      
      // Close the payment dialog
      setSelectedPaymentId(null);
    } catch (error: any) {
      toast({
        title: "Payment Failed",
        description: error.message || "There was an error processing your payment.",
        variant: "destructive",
      });
    }
  };
  
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
                              <Dialog open={selectedPaymentId === payment.id} onOpenChange={(open) => {
                                if (!open) setSelectedPaymentId(null);
                              }}>
                                <DialogTrigger asChild>
                                  <Button 
                                    size="sm" 
                                    onClick={() => setSelectedPaymentId(payment.id)}
                                  >
                                    Pay Now
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Make Payment</DialogTitle>
                                    <DialogDescription>
                                      Complete your payment for {payment.description}
                                    </DialogDescription>
                                  </DialogHeader>
                                  
                                  <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                      <h3 className="text-sm font-medium">Payment Summary</h3>
                                      <div className="bg-muted p-4 rounded-lg">
                                        <div className="flex justify-between mb-2">
                                          <span>Program:</span>
                                          <span className="font-medium">{payment.programName}</span>
                                        </div>
                                        <div className="flex justify-between mb-2">
                                          <span>Child:</span>
                                          <span className="font-medium">{payment.childName}</span>
                                        </div>
                                        <div className="flex justify-between mb-2">
                                          <span>Date:</span>
                                          <span className="font-medium">{formatDate(payment.date)}</span>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-border">
                                          <span>Total:</span>
                                          <span className="font-bold">{formatCurrency(payment.amount)}</span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      <Label htmlFor="payment-method">Payment Method</Label>
                                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                        <SelectTrigger id="payment-method">
                                          <SelectValue placeholder="Select payment method" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="credit_card">Credit Card</SelectItem>
                                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                          <SelectItem value="paypal">PayPal</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    
                                    {paymentMethod === 'credit_card' && (
                                      <div className="space-y-4">
                                        <div className="space-y-2">
                                          <Label htmlFor="card-number">Card Number</Label>
                                          <Input id="card-number" placeholder="•••• •••• •••• ••••" />
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="space-y-2">
                                            <Label htmlFor="expiry">Expiry Date</Label>
                                            <Input id="expiry" placeholder="MM/YY" />
                                          </div>
                                          <div className="space-y-2">
                                            <Label htmlFor="cvc">CVC</Label>
                                            <Input id="cvc" placeholder="•••" />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setSelectedPaymentId(null)}>
                                      Cancel
                                    </Button>
                                    <Button onClick={() => handlePayment(payment.id)}>
                                      <CreditCard className="mr-2 h-4 w-4" />
                                      Pay {formatCurrency(payment.amount)}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
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
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm">Pay Now</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Make Payment</DialogTitle>
                                <DialogDescription>
                                  Complete your payment for {payment.description}
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <h3 className="text-sm font-medium">Payment Summary</h3>
                                  <div className="bg-muted p-4 rounded-lg">
                                    <div className="flex justify-between mb-2">
                                      <span>Program:</span>
                                      <span className="font-medium">{payment.programName}</span>
                                    </div>
                                    <div className="flex justify-between mb-2">
                                      <span>Child:</span>
                                      <span className="font-medium">{payment.childName}</span>
                                    </div>
                                    <div className="flex justify-between mb-2">
                                      <span>Due Date:</span>
                                      <span className="font-medium">{formatDate(payment.dueDate!)}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-border">
                                      <span>Total:</span>
                                      <span className="font-bold">{formatCurrency(payment.amount)}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label htmlFor="payment-method">Payment Method</Label>
                                  <Select defaultValue="credit_card" onValueChange={setPaymentMethod}>
                                    <SelectTrigger id="payment-method">
                                      <SelectValue placeholder="Select payment method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="credit_card">Credit Card</SelectItem>
                                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                      <SelectItem value="paypal">PayPal</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                {paymentMethod === 'credit_card' && (
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="card-number">Card Number</Label>
                                      <Input id="card-number" placeholder="•••• •••• •••• ••••" />
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <Label htmlFor="expiry">Expiry Date</Label>
                                        <Input id="expiry" placeholder="MM/YY" />
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor="cvc">CVC</Label>
                                        <Input id="cvc" placeholder="•••" />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setSelectedPaymentId(null)}>
                                  Cancel
                                </Button>
                                <Button onClick={() => handlePayment(payment.id)}>
                                  <CreditCard className="mr-2 h-4 w-4" />
                                  Pay {formatCurrency(payment.amount)}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
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
    </div>
  );
}

