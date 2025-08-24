import { useAuth } from "@/components/SupabaseProvider";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { apiRequest } from "@/lib/queryClient";

interface PaymentHistoryItem {
  id: number;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
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
}

export default function PaymentHistoryPage() {
  const { user } = useAuth();
  
  const { data: paymentHistory, isLoading: isLoadingHistory } = useQuery<PaymentHistoryItem[]>({
    queryKey: ['/api/payment-history'],
    enabled: !!user?.email,
    queryFn: async () => {
      // Use the proper user-specific endpoint
      const response = await apiRequest('GET', '/api/payment-history/history');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch payment history: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.payments : [];
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
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
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{formatCurrency(payment.amount)}</span>
                        {getStatusBadge(payment.status)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatDate(payment.createdAt)}
                      </div>
                      {payment.description && (
                        <div className="text-sm text-gray-500 mt-1">
                          {payment.description}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
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
    </ParentAppShell>
  );
}