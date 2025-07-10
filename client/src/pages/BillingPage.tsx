import React, { useState, useTransition } from 'react';
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

// Initialize Stripe outside component to avoid re-creating the Stripe object
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
console.log('🔑 Stripe publishable key check:', stripePublishableKey ? 'Present' : 'Missing');

if (!stripePublishableKey || stripePublishableKey.trim() === '') {
  console.error('❌ Missing VITE_STRIPE_PUBLIC_KEY environment variable');
}

const stripePromise = stripePublishableKey && stripePublishableKey.trim() !== '' 
  ? loadStripe(stripePublishableKey) 
  : null;

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
  const [isReady, setIsReady] = useState(false);

  // Wait for PaymentElement to be ready
  React.useEffect(() => {
    if (stripe && elements) {
      const checkElementsReady = async () => {
        try {
          // Check if PaymentElement is mounted and ready
          const paymentElement = elements.getElement('payment');
          if (paymentElement) {
            console.log('✅ PaymentElement is mounted and ready');
            setIsReady(true);
          } else {
            // Wait a bit longer for the element to mount
            setTimeout(() => {
              const retryElement = elements.getElement('payment');
              if (retryElement) {
                console.log('✅ PaymentElement is ready after retry');
                setIsReady(true);
              } else {
                console.warn('⚠️ PaymentElement still not ready');
              }
            }, 1000);
          }
        } catch (error) {
          console.error('❌ Error checking PaymentElement readiness:', error);
        }
      };

      checkElementsReady();
    }
  }, [stripe, elements]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    console.log('💳 Payment form submitted');

    if (!stripe || !elements) {
      console.error('❌ Stripe or Elements not loaded');
      toast({
        title: "Payment Error",
        description: "Payment system not ready. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Additional check for PaymentElement readiness
    const paymentElement = elements.getElement('payment');
    if (!paymentElement) {
      console.error('❌ PaymentElement not found');
      toast({
        title: "Payment Error",
        description: "Payment form not ready. Please wait a moment and try again.",
        variant: "destructive",
      });
      return;
    }

    if (!isReady) {
      console.error('❌ PaymentElement not ready');
      toast({
        title: "Payment Error",
        description: "Payment form is still loading. Please wait a moment and try again.",
        variant: "destructive",
      });
      return;
    }

    console.log('🔄 Processing payment for amount:', totalAmount);
    setProcessing(true);

    try {
      console.log('📤 Confirming payment with Stripe...');
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/billing?payment=success`,
        },
        redirect: 'if_required',
      });

      console.log('📥 Stripe response:', { error, paymentIntent });

      if (error) {
        console.error('❌ Payment failed:', error);
        toast({
          title: "Payment Failed",
          description: error.message || "Payment could not be processed.",
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        console.log('✅ Payment successful:', paymentIntent.id);
        toast({
          title: "Payment Successful!",
          description: "Your balance has been paid successfully.",
        });

        // Refresh the page to show updated balances
        window.location.reload();
      } else {
        console.warn('⚠️ Unexpected payment result:', paymentIntent);
        toast({
          title: "Payment Status Unknown",
          description: "Please check your payment status and try again if needed.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('❌ Payment processing error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      toast({
        title: "Payment Failed",
        description: error.message || "There was an error processing your payment.",
        variant: "destructive",
      });
    } finally {
      console.log('🏁 Payment processing complete');
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
      <div className="min-h-[120px]">
        <PaymentElement 
          onReady={() => {
            console.log('✅ PaymentElement onReady callback fired');
            setIsReady(true);
          }}
          onLoaderStart={() => {
            console.log('🔄 PaymentElement loader started');
            setIsReady(false);
          }}
          options={{
            layout: 'tabs',
          }}
        />
      </div>
      
      {!isReady && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading payment form...</span>
        </div>
      )}
      
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || !isReady || processing}
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing Payment...
          </>
        ) : !isReady ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading Payment Form...
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
  const [isPending, startTransition] = useTransition();

  // Debug logging for state changes
  React.useEffect(() => {
    console.log('🔄 BillingPage state updated:', {
      isAuthenticated,
      userEmail: user?.email,
      selectedEnrollments,
      showPayment,
      isPending,
      hasClientSecret: !!clientSecret
    });
  }, [isAuthenticated, user, selectedEnrollments, showPayment, isPending, clientSecret]);

  // Fetch billing summary
  const { data: billingSummary, isLoading, error } = useQuery<BillingSummary>({
    queryKey: ['billing-summary'],
    queryFn: async () => {
      try {
        console.log('📊 Fetching billing summary...');
        const response = await apiRequest('GET', '/api/billing/summary');
        console.log('📊 Billing summary response:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error('❌ Billing summary failed:', errorData);
          throw new Error(`Billing summary failed: ${errorData.message || response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Billing summary data:', data);
        return data;
      } catch (error) {
        console.error('❌ Billing summary error:', error);
        throw error;
      }
    },
    enabled: !!isAuthenticated && !!user,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    suspense: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    notifyOnChangeProps: ['data', 'error', 'isLoading'],
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
    console.log('📝 Enrollment selection changed:', { enrollmentId, isSelected });
    
    if (isSelected) {
      const newSelected = [...selectedEnrollments, enrollmentId];
      console.log('✅ Added enrollment, new selection:', newSelected);
      setSelectedEnrollments(newSelected);
    } else {
      const newSelected = selectedEnrollments.filter(id => id !== enrollmentId);
      console.log('❌ Removed enrollment, new selection:', newSelected);
      setSelectedEnrollments(newSelected);
    }
  };

  const getSelectedTotal = () => {
    if (!billingSummary) return 0;
    return billingSummary.enrollmentDetails
      .filter(detail => selectedEnrollments.includes(detail.enrollmentId))
      .reduce((total, detail) => total + detail.balance, 0);
  };

  const handlePaySelected = async () => {
    console.log('🔄 Pay Selected button clicked');
    
    if (selectedEnrollments.length === 0) {
      console.log('❌ No enrollments selected');
      toast({
        title: "No Enrollments Selected",
        description: "Please select at least one enrollment to pay.",
        variant: "destructive",
      });
      return;
    }

    if (isPending) {
      console.log('⏳ Already processing, ignoring click');
      return; // Prevent multiple clicks while processing
    }

    console.log('🚀 Starting payment process for enrollments:', selectedEnrollments);

    startTransition(async () => {
      try {
        const totalAmount = getSelectedTotal();
        console.log('💰 Total amount to pay:', totalAmount);
        
        console.log('📤 Sending payment request...');
        const response = await apiRequest('POST', '/api/billing/pay-balance', {
          enrollmentIds: selectedEnrollments,
          totalAmount: totalAmount,
        });

        console.log('📥 Payment response received:', response.status, response.statusText);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error('❌ Payment request failed:', errorData);
          throw new Error(`Payment request failed: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Payment response data:', data);
        
        if (data.clientSecret) {
          console.log('🔑 Client secret received, showing payment form');
          setClientSecret(data.clientSecret);
          setShowPayment(true);
          
          // Auto-scroll to payment form after a brief delay
          setTimeout(() => {
            const paymentSection = document.querySelector('[data-payment-form]');
            if (paymentSection) {
              paymentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 500);
        } else {
          console.error('❌ No client secret in response:', data);
          throw new Error('No client secret received from server');
        }
      } catch (error: any) {
        console.error('❌ Payment initialization error:', error);
        console.error('❌ Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        
        toast({
          title: "Payment Error",
          description: error.message || "Failed to initialize payment. Please try again.",
          variant: "destructive",
        });
      }
    });
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
                    {showPayment && (
                      <p className="text-sm text-green-600 font-medium">
                        ✓ Payment form is ready below
                      </p>
                    )}
                  </div>
                  {!showPayment && (
                    <Button 
                      onClick={handlePaySelected}
                      disabled={selectedEnrollments.length === 0 || isPending}
                      size="lg"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Preparing Payment...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Pay Selected ({formatCurrency(getSelectedTotal())})
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            {showPayment && clientSecret && stripePromise && (
              <Card className="border-green-200 bg-green-50/30" data-payment-form>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-green-600" />
                    Secure Payment
                  </CardTitle>
                  <CardDescription>
                    Complete your payment of {formatCurrency(getSelectedTotal())} for {selectedEnrollments.length} enrollment(s)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stripePromise ? (
                    <Elements stripe={stripePromise} options={{ clientSecret }}>
                      <PaymentForm 
                        enrollmentIds={selectedEnrollments} 
                        totalAmount={getSelectedTotal()} 
                      />
                    </Elements>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Stripe is not properly initialized. Please check your Stripe publishable key configuration.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </ParentAppShell>
  );
}