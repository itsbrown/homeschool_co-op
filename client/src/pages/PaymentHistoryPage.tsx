import { useAuth } from "@/components/SupabaseProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { History, Loader2, RefreshCw, DollarSign } from "lucide-react";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { formatCurrency, centsToDollars } from "@/utils/currency";

interface PaymentHistoryItem {
  id: number;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'completed';
  createdAt: string;
  description: string | null;
  stripePaymentIntentId: string;
  enrollmentIds: number[];
  paymentPlan: string | null;
  nextPaymentDate: string | null;
  enrollmentDetails: Array<{
    childName: string;
    className: string;
    price: number;
    amountPaid: number;
  }>;
  parentEmail?: string;
  childName?: string;
  className?: string;
  metadata?: any;
}

export default function PaymentHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; payment: PaymentHistoryItem | null }>({ open: false, payment: null });
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // Check if user is a school admin
  const { data: userRole } = useQuery({
    queryKey: ['/api/users/role', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/users/role/${encodeURIComponent(user?.email || '')}`);
      const data = await response.json();
      return data.role;
    },
  });
  
  const isAdmin = userRole && ['school_admin', 'schoolAdmin', 'superAdmin', 'admin'].includes(userRole);
  
  const { data: paymentHistory, isLoading: isLoadingHistory } = useQuery<PaymentHistoryItem[]>({
    queryKey: ['/api/payment-history'],
    enabled: !!user?.email,
    queryFn: async () => {
      // Use admin endpoint if user is admin, otherwise use user-specific endpoint
      const endpoint = isAdmin ? '/api/payment-history/all' : '/api/payment-history/history';
      const response = await apiRequest('GET', endpoint);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch payment history: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.payments : [];
    },
  });

  // Refund mutation
  const refundMutation = useMutation({
    mutationFn: async ({ paymentId, amount, reason }: { paymentId: number; amount?: number; reason: string }) => {
      const response = await apiRequest('POST', `/api/payment-history/refund/${paymentId}`, {
        refundAmount: amount,
        reason
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process refund');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      const refundTypeMessage = data.refund.refundType === 'stripe' 
        ? '✅ Stripe refund processed - funds will be returned to customer\'s payment method' 
        : 'ℹ️ Internal refund recorded (manual payment - no Stripe charge)';
      
      toast({
        title: "Refund Processed",
        description: (
          <div>
            <p>Successfully refunded ${data.refund.amount.toFixed(2)} to {data.refund.parentEmail}</p>
            <p className="text-sm mt-1">{refundTypeMessage}</p>
          </div>
        ),
      });
      
      // Refresh payment history
      queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] });
      
      // Close dialog and reset form
      setRefundDialog({ open: false, payment: null });
      setRefundAmount('');
      setRefundReason('');
    },
    onError: (error: Error) => {
      toast({
        title: "Refund Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRefund = () => {
    if (!refundDialog.payment) return;
    
    const amount = refundAmount ? parseFloat(refundAmount) : undefined;
    
    refundMutation.mutate({
      paymentId: refundDialog.payment.id,
      amount,
      reason: refundReason || 'Administrative refund'
    });
  };

  const openRefundDialog = (payment: PaymentHistoryItem) => {
    setRefundDialog({ open: true, payment });
    setRefundAmount(centsToDollars(Math.abs(payment.amount)).toString()); // Pre-fill with full amount
    setRefundReason('');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'canceled':
        return <Badge variant="outline">Canceled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const canRefund = (payment: PaymentHistoryItem) => {
    return isAdmin && 
           payment.amount > 0 && // Only positive amounts (not already refunds)
           ['completed', 'succeeded'].includes(payment.status);
  };

  if (isLoadingHistory) {
    return (
      <ParentAppShell>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Payment History</h1>
            <p className="text-muted-foreground">
              View all your payment transactions and receipts
            </p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Loading payment history...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </ParentAppShell>
    );
  }

  if (!paymentHistory || paymentHistory.length === 0) {
    return (
      <ParentAppShell>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Payment History</h1>
            <p className="text-muted-foreground">
              View all your payment transactions and receipts
            </p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Payment History
              </CardTitle>
              <CardDescription>Your payment transaction history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <History className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No payment history found</p>
                <p className="text-sm text-gray-500 mt-2">
                  Your completed payments will appear here
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Payment History</h1>
          <p className="text-muted-foreground">
            View all your payment transactions and receipts
          </p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Payment History
            </CardTitle>
            <CardDescription>
              Your payment transaction history ({paymentHistory.length} payments)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {paymentHistory.map((payment) => (
                <div key={payment.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        payment.amount < 0 ? 'bg-red-100' : 'bg-blue-100'
                      }`}>
                        {payment.amount < 0 ? (
                          <RefreshCw className={`h-5 w-5 ${
                            payment.amount < 0 ? 'text-red-600' : 'text-blue-600'
                          }`} />
                        ) : (
                          <History className={`h-5 w-5 ${
                            payment.amount < 0 ? 'text-red-600' : 'text-blue-600'
                          }`} />
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {payment.amount < 0 ? 'Refund: ' : ''}
                          {payment.description || 
                           (payment.childName && payment.className ? `${payment.childName} - ${payment.className}` : '') ||
                           (payment.enrollmentDetails?.[0] ? `${payment.enrollmentDetails[0].childName} - ${payment.enrollmentDetails[0].className}` : 'Payment')}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {formatDate(payment.createdAt)}
                          {isAdmin && payment.parentEmail && (
                            <span className="ml-2">• {payment.parentEmail}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-semibold ${
                          payment.amount < 0 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                          {formatCurrency(payment.amount)}
                        </p>
                        {getStatusBadge(payment.status)}
                      </div>
                      {canRefund(payment) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRefundDialog(payment)}
                          className="ml-2"
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          Refund
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Additional payment info */}
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs text-gray-500">
                      Transaction ID: {payment.stripePaymentIntentId.substring(0, 20)}...
                    </div>
                    {payment.paymentPlan && (
                      <div className="text-xs text-blue-600 mt-1">
                        Plan: {payment.paymentPlan}
                      </div>
                    )}
                    {payment.nextPaymentDate && (
                      <div className="text-xs text-orange-600 mt-1">
                        Next: {formatDate(payment.nextPaymentDate)}
                      </div>
                    )}
                  </div>
                  
                  {payment.enrollmentDetails && payment.enrollmentDetails.length > 0 && (
                    <div className="border-t pt-3">
                      <div className="text-sm font-medium text-gray-700 mb-2">
                        Enrollment Details:
                      </div>
                      <div className="space-y-1">
                        {payment.enrollmentDetails.map((detail, index) => (
                          <div key={index} className="flex justify-between items-center text-sm">
                            <span>
                              {detail.childName} - {detail.className}
                            </span>
                            <span className="text-gray-600">
                              {formatCurrency(detail.amountPaid)} of {formatCurrency(detail.price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Refund Dialog */}
      <Dialog open={refundDialog.open} onOpenChange={(open) => setRefundDialog({ open, payment: refundDialog.payment })}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Process a refund for payment #{refundDialog.payment?.id}
              {refundDialog.payment && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md">
                  <p><strong>Original Amount:</strong> {formatCurrency(refundDialog.payment.amount)}</p>
                  <p><strong>Parent:</strong> {refundDialog.payment.parentEmail}</p>
                  <p><strong>Child:</strong> {refundDialog.payment.childName}</p>
                  <p><strong>Class:</strong> {refundDialog.payment.className}</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="refund-amount" className="text-right">
                Amount
              </Label>
              <Input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={refundDialog.payment ? (refundDialog.payment.amount / 100) : undefined}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="col-span-3"
                placeholder="Enter refund amount"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="refund-reason" className="text-right">
                Reason
              </Label>
              <Textarea
                id="refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="col-span-3"
                placeholder="Enter reason for refund"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setRefundDialog({ open: false, payment: null })}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRefund}
              disabled={refundMutation.isPending || !refundAmount || parseFloat(refundAmount) <= 0}
            >
              {refundMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Process Refund'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ParentAppShell>
  );
}