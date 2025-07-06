import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/SupabaseProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiRequest } from '@/lib/queryClient';
import { CreditCard, AlertCircle, CheckCircle, DollarSign, Calendar, User, Loader2 } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface EnrollmentDetail {
  enrollmentId: number;
  childName: string;
  className: string;
  classPrice: number;
  amountPaid: number;
  balance: number;
  enrollmentDate: string;
  status: string;
}

interface BillingSummary {
  totalBalance: number;
  totalBalanceFormatted: string;
  enrollmentCount: number;
  enrollmentDetails: EnrollmentDetail[];
  parentEmail: string;
}

function PaymentForm({ enrollmentIds, totalAmount }: { enrollmentIds: number[], totalAmount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/billing?payment=success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast({
          title: "Payment Successful!",
          description: "Your balance has been paid successfully.",
        });

        // Refresh the page to show updated balances
        window.location.reload();
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || processing}
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing Payment...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay {formatCurrency(totalAmount)}
          </>
        )}
      </Button>
    </form>
  );
}

export default function BillingPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [selectedEnrollments, setSelectedEnrollments] = useState<number[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>('');

  // Fetch billing summary
  const { data: billingSummary, isLoading, error } = useQuery<BillingSummary>({
    queryKey: ['/api/billing/summary'],
    enabled: !!isAuthenticated,
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
      month: 'long',
      day: 'numeric',
    });
  };

  const handleSelectEnrollment = (enrollmentId: number, isSelected: boolean) => {
    if (isSelected) {
      setSelectedEnrollments([...selectedEnrollments, enrollmentId]);
    } else {
      setSelectedEnrollments(selectedEnrollments.filter(id => id !== enrollmentId));
    }
  };

  const getSelectedTotal = () => {
    if (!billingSummary) return 0;
    return billingSummary.enrollmentDetails
      .filter(detail => selectedEnrollments.includes(detail.enrollmentId))
      .reduce((total, detail) => total + detail.balance, 0);
  };

  const handlePaySelected = async () => {
    if (selectedEnrollments.length === 0) {
      toast({
        title: "No Enrollments Selected",
        description: "Please select at least one enrollment to pay.",
        variant: "destructive",
      });
      return;
    }

    try {
      const totalAmount = getSelectedTotal();
      const response = await apiRequest('POST', '/api/billing/pay-balance', {
        enrollmentIds: selectedEnrollments,
        totalAmount: totalAmount,
      });

      if (response.clientSecret) {
        setClientSecret(response.clientSecret);
        setShowPayment(true);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to initialize payment. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center h-[50vh]">
          <p>Please log in to view your billing information.</p>
        </div>
      </ParentAppShell>
    );
  }

  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading billing information...</p>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  if (error) {
    return (
      <ParentAppShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center text-red-500 flex items-center justify-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Error Loading Billing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center">Unable to load billing information. Please try again later.</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Billing & Payments</h1>
          <p className="text-muted-foreground">
            View and pay your outstanding balances
          </p>
        </div>

        {!billingSummary || billingSummary.totalBalance === 0 ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              <strong>All Paid Up!</strong> You have no outstanding balances.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Account Summary
                </CardTitle>
                <CardDescription>
                  Your current billing status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(billingSummary.totalBalance)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Outstanding</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold">
                      {billingSummary.enrollmentCount}
                    </div>
                    <div className="text-sm text-muted-foreground">Unpaid Enrollments</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(getSelectedTotal())}
                    </div>
                    <div className="text-sm text-muted-foreground">Selected to Pay</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Enrollments */}
            <Card>
              <CardHeader>
                <CardTitle>Outstanding Enrollments</CardTitle>
                <CardDescription>
                  Select enrollments to pay and manage your balances
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {billingSummary.enrollmentDetails.map((detail) => (
                    <div key={detail.enrollmentId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedEnrollments.includes(detail.enrollmentId)}
                          onChange={(e) => handleSelectEnrollment(detail.enrollmentId, e.target.checked)}
                          className="rounded"
                        />
                        <div>
                          <div className="font-medium">{detail.className}</div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {detail.childName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(detail.enrollmentDate)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-red-600">
                          {formatCurrency(detail.balance)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(detail.amountPaid)} paid of {formatCurrency(detail.classPrice)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-6" />

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {selectedEnrollments.length} enrollment(s) selected
                    </p>
                  </div>
                  <Button 
                    onClick={handlePaySelected}
                    disabled={selectedEnrollments.length === 0}
                    size="lg"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay Selected ({formatCurrency(getSelectedTotal())})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            {showPayment && clientSecret && (
              <Card>
                <CardHeader>
                  <CardTitle>Complete Payment</CardTitle>
                  <CardDescription>
                    Enter your payment information to pay {formatCurrency(getSelectedTotal())}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <PaymentForm 
                      enrollmentIds={selectedEnrollments} 
                      totalAmount={getSelectedTotal()} 
                    />
                  </Elements>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </ParentAppShell>
  );
}