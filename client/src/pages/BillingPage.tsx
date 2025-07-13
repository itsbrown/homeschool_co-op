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
console.log('🔑 Stripe publishable key starts with:', stripePublishableKey ? stripePublishableKey.substring(0, 15) + '...' : 'N/A');

if (!stripePublishableKey || stripePublishableKey.trim() === '') {
  console.error('❌ Missing VITE_STRIPE_PUBLIC_KEY environment variable');
  throw new Error('Missing VITE_STRIPE_PUBLIC_KEY environment variable');
}

// Validate the key format
if (!stripePublishableKey.startsWith('pk_test_') && !stripePublishableKey.startsWith('pk_live_')) {
  console.error('❌ Invalid Stripe publishable key format');
  throw new Error('Invalid Stripe publishable key format');
}

const stripePromise = loadStripe(stripePublishableKey);

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
  const [elementMounted, setElementMounted] = useState(false);

  // Simplified readiness check - rely on Stripe's callbacks
  React.useEffect(() => {
    // Only set ready when we have stripe, elements, and the element is mounted
    if (stripe && elements && elementMounted) {
      console.log('✅ All Stripe components ready');
      setIsReady(true);
    }
  }, [stripe, elements, elementMounted]);

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
            setElementMounted(true);
          }}
          onLoaderStart={() => {
            console.log('🔄 PaymentElement loader started');
            setElementMounted(false);
            setIsReady(false);
          }}
          onLoadError={(error) => {
            console.error('❌ PaymentElement load error:', error);
            toast({
              title: "Payment Form Error",
              description: "Failed to load payment form. Please refresh and try again.",
              variant: "destructive",
            });
          }}
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card'],
            fields: {
              billingDetails: {
                address: {
                  country: 'never'
                }
              }
            }
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
  const [selectedPaymentOptions, setSelectedPaymentOptions] = useState<{[enrollmentId: number]: number}>({});
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState<string>('deposit_all');
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
      .reduce((total, detail) => {
        if (detail.paymentOptions) {
          const selectedOptionIndex = selectedPaymentOptions[detail.enrollmentId] || 0;
          const selectedOption = detail.paymentOptions[selectedOptionIndex];
          return total + (selectedOption.amount - (selectedOption.discount || 0));
        }
        return total + detail.nextPaymentAmount;
      }, 0);
  };

  const getPaymentPlanAmount = () => {
    const totalBalance = billingSummary?.totalBalance || 0;
    const selectedTotal = getSelectedTotal();
    const baseAmount = selectedEnrollments.length > 0 ? selectedTotal : totalBalance;

    switch (selectedPaymentPlan) {
      case 'deposit_all':
        // Pay 10% deposit for all enrollments
        return Math.round(baseAmount * 0.1);
      case 'half_now':
        // Pay 50% now, 50% later
        return Math.round(baseAmount * 0.5);
      case 'full_payment':
        // Pay everything with 5% discount if over $500
        const discount = baseAmount > 50000 ? Math.round(baseAmount * 0.05) : 0;
        return baseAmount - discount;
      case 'three_payments':
        // Split into 3 monthly payments
        return Math.round(baseAmount / 3);
      default:
        return baseAmount;
    }
  };

  const getPaymentPlanDescription = () => {
    const totalBalance = billingSummary?.totalBalance || 0;
    const selectedTotal = getSelectedTotal();
    const baseAmount = selectedEnrollments.length > 0 ? selectedTotal : totalBalance;

    switch (selectedPaymentPlan) {
      case 'deposit_all':
        return `Pay 10% deposit (${formatCurrency(Math.round(baseAmount * 0.1))}) to secure all enrollments. Remaining balance due before classes start.`;
      case 'half_now':
        return `Pay 50% now (${formatCurrency(Math.round(baseAmount * 0.5))}), remaining 50% in 30 days.`;
      case 'full_payment':
        const discount = baseAmount > 50000 ? Math.round(baseAmount * 0.05) : 0;
        return `Pay full amount now${discount > 0 ? ` with 5% discount (save ${formatCurrency(discount)})` : ''}. No future payments needed.`;
      case 'three_payments':
        return `Split into 3 equal monthly payments of ${formatCurrency(Math.round(baseAmount / 3))} each.`;
      default:
        return '';
    }
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
        const totalAmount = getPaymentPlanAmount();
        console.log('💰 Total amount to pay:', totalAmount);
        console.log('💳 Selected payment plan:', selectedPaymentPlan);

        console.log('📤 Sending payment request...');
        
        // Determine which enrollments to process
        const enrollmentsToProcess = selectedEnrollments.length > 0 
          ? selectedEnrollments 
          : billingSummary.enrollmentDetails.map(d => d.enrollmentId);

        // Build payment details with selected plan
        const paymentDetails = enrollmentsToProcess.map(enrollmentId => {
          const enrollment = billingSummary.enrollmentDetails.find(d => d.enrollmentId === enrollmentId);
          if (!enrollment) return null;
          
          return {
            enrollmentId,
            paymentType: selectedPaymentPlan,
            amount: Math.round(totalAmount / enrollmentsToProcess.length), // Distribute amount across enrollments
            description: getPaymentPlanDescription()
          };
        }).filter(Boolean);

        const response = await apiRequest('POST', '/api/billing/pay-balance', {
          enrollmentIds: enrollmentsToProcess,
          totalAmount: totalAmount,
          paymentDetails: paymentDetails,
          paymentPlan: selectedPaymentPlan,
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
                    <div className="text-sm text-muted-foreground">Next Payment Due</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Plan Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Plan Options</CardTitle>
                <CardDescription>
                  Choose how you'd like to pay your outstanding balance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4">
                    <label className="flex items-start space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-gray-50">
                      <input
                        type="radio"
                        name="paymentPlan"
                        value="deposit_all"
                        checked={selectedPaymentPlan === 'deposit_all'}
                        onChange={(e) => setSelectedPaymentPlan(e.target.value)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium">Pay Deposits Only</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Pay 10% deposit for all enrollments - {formatCurrency(Math.round((billingSummary?.totalBalance || 0) * 0.1))}
                        </div>
                        <div className="text-xs text-blue-600 mt-1">
                          Secures all spots, remaining balance due before classes start
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-gray-50">
                      <input
                        type="radio"
                        name="paymentPlan"
                        value="half_now"
                        checked={selectedPaymentPlan === 'half_now'}
                        onChange={(e) => setSelectedPaymentPlan(e.target.value)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium">Split Payment (50/50)</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Pay half now, half in 30 days - {formatCurrency(Math.round((billingSummary?.totalBalance || 0) * 0.5))}
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          No additional fees, automatic payment reminders
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-gray-50">
                      <input
                        type="radio"
                        name="paymentPlan"
                        value="full_payment"
                        checked={selectedPaymentPlan === 'full_payment'}
                        onChange={(e) => setSelectedPaymentPlan(e.target.value)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium">Pay in Full</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Complete payment now - {formatCurrency((billingSummary?.totalBalance || 0) - ((billingSummary?.totalBalance || 0) > 50000 ? Math.round((billingSummary?.totalBalance || 0) * 0.05) : 0))}
                          {(billingSummary?.totalBalance || 0) > 50000 && (
                            <span className="text-green-600 font-medium"> (Save {formatCurrency(Math.round((billingSummary?.totalBalance || 0) * 0.05))})</span>
                          )}
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          {(billingSummary?.totalBalance || 0) > 50000 ? '5% discount applied, ' : ''}No future payments needed
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-gray-50">
                      <input
                        type="radio"
                        name="paymentPlan"
                        value="three_payments"
                        checked={selectedPaymentPlan === 'three_payments'}
                        onChange={(e) => setSelectedPaymentPlan(e.target.value)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium">Monthly Installments (3 payments)</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Three monthly payments of {formatCurrency(Math.round((billingSummary?.totalBalance || 0) / 3))} each
                        </div>
                        <div className="text-xs text-blue-600 mt-1">
                          First payment today, then monthly auto-payments
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="font-medium text-blue-900">Selected Plan Summary</div>
                    <div className="text-sm text-blue-700 mt-1">{getPaymentPlanDescription()}</div>
                    <div className="text-lg font-bold text-blue-900 mt-2">
                      Next Payment: {formatCurrency(getPaymentPlanAmount())}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Enrollments */}
            <Card>
              <CardHeader>
                <CardTitle>Outstanding Enrollments</CardTitle>
                <CardDescription>
                  Review your enrollments (all will be included in the selected payment plan)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg mb-4">
                    <div className="text-sm text-gray-600">
                      <strong>Note:</strong> Your selected payment plan will apply to all outstanding enrollments below. 
                      You can optionally select specific enrollments to pay individually, or leave all unselected to apply the plan to your entire balance.
                    </div>
                  </div>
                  
                  {billingSummary.enrollmentDetails.map((detail) => (
                    <div key={detail.enrollmentId} className="p-4 border rounded-lg">
                      <div className="flex items-start space-x-3 mb-4">
                        <input
                          type="checkbox"
                          checked={selectedEnrollments.includes(detail.enrollmentId)}
                          onChange={(e) => handleSelectEnrollment(detail.enrollmentId, e.target.checked)}
                          className="rounded mt-1"
                        />
                        <div className="flex-1">
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
                      <div className="text-xs text-gray-500 ml-6 mb-4">
                        Select individual enrollments or leave unselected to include all in payment plan
                      </div>
                      
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        {/* Payment Options */}
                        {detail.paymentOptions && detail.paymentOptions.length > 1 && (
                          <div className="flex-1">
                            <div className="text-sm font-medium mb-2">Payment Option:</div>
                            <div className="space-y-2">
                              {detail.paymentOptions.map((option: any, index: number) => (
                                <label key={index} className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`payment-option-${detail.enrollmentId}`}
                                    checked={(selectedPaymentOptions[detail.enrollmentId] || 0) === index}
                                    onChange={() => setSelectedPaymentOptions(prev => ({
                                      ...prev,
                                      [detail.enrollmentId]: index
                                    }))}
                                    className="rounded"
                                  />
                                  <span className="text-sm">
                                    {option.description} - ${((option.amount - (option.discount || 0)) / 100).toFixed(2)}
                                    {option.discount > 0 && (
                                      <span className="text-green-600 text-xs ml-1">
                                        (Save ${(option.discount / 100).toFixed(2)})
                                      </span>
                                    )}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Cost Breakdown */}
                        <div className="text-right">
                          <div className="flex justify-between text-sm">
                            <span>Total Cost:</span>
                            <span>${(detail.classPrice / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-blue-600">
                            <span>Deposit Required (10%):</span>
                            <span>${(detail.depositRequired / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Amount Paid:</span>
                            <span>${(detail.amountPaid / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-lg font-semibold text-red-600">
                            <span>Remaining Balance:</span>
                            <span>${(detail.balance / 100).toFixed(2)}</span>
                          </div>
                          {/* Payment Options */}
                          <div className="mt-4 space-y-2">
                            <div className="text-sm font-medium text-gray-700">Payment Options:</div>
                            {detail.paymentOptions ? detail.paymentOptions.map((option: any, index: number) => (
                              <div key={index} className="p-2 border rounded text-sm">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">{option.description}</span>
                                  <span className="font-semibold">
                                    ${((option.amount - (option.discount || 0)) / 100).toFixed(2)}
                                    {option.discount > 0 && (
                                      <span className="text-green-600 text-xs ml-1">
                                        (Save ${(option.discount / 100).toFixed(2)})
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {option.type === 'deposit' && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    Secures your spot, remaining balance due before class starts
                                  </div>
                                )}
                                {option.type === 'full_payment' && (
                                  <div className="text-xs text-green-600 mt-1">
                                    Complete payment now, no future payments needed
                                  </div>
                                )}
                              </div>
                            )) : (
                              <div className="p-2 bg-blue-50 rounded text-sm">
                                <strong>Next Payment ({detail.paymentType === 'deposit' ? 'Deposit' : 'Remaining Balance'}):</strong> 
                                <span className="font-semibold text-blue-700"> ${(detail.nextPaymentAmount / 100).toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-6" />

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {selectedEnrollments.length > 0 
                        ? `${selectedEnrollments.length} enrollment(s) selected` 
                        : `All ${billingSummary.enrollmentDetails.length} enrollments will be included`}
                    </p>
                    <p className="text-sm font-medium text-blue-600">
                      Payment Plan: {selectedPaymentPlan === 'deposit_all' ? 'Deposits Only' :
                                   selectedPaymentPlan === 'half_now' ? 'Split Payment' :
                                   selectedPaymentPlan === 'full_payment' ? 'Pay in Full' :
                                   selectedPaymentPlan === 'three_payments' ? 'Monthly Installments' : 'Custom'}
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
                      disabled={isPending}
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
                          Proceed with Payment ({formatCurrency(getPaymentPlanAmount())})
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            {showPayment && clientSecret && (
              <Card className="border-green-200 bg-green-50/30" data-payment-form>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-green-600" />
                    Secure Payment
                  </CardTitle>
                  <CardDescription>
                    Complete your {selectedPaymentPlan === 'deposit_all' ? 'deposit payment' :
                                  selectedPaymentPlan === 'half_now' ? 'first payment (50%)' :
                                  selectedPaymentPlan === 'full_payment' ? 'full payment' :
                                  selectedPaymentPlan === 'three_payments' ? 'first monthly payment' : 'payment'} of {formatCurrency(getPaymentPlanAmount())}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <React.Suspense fallback={
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Initializing payment system...</span>
                    </div>
                  }>
                    <Elements 
                      stripe={stripePromise} 
                      options={{ 
                        clientSecret,
                        appearance: {
                          theme: 'stripe',
                          variables: {
                            colorPrimary: '#2563eb',
                          }
                        }
                      }}
                    >
                      <PaymentForm 
                        enrollmentIds={selectedEnrollments} 
                        totalAmount={getSelectedTotal()} 
                      />
                    </Elements>
                  </React.Suspense>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </ParentAppShell>
  );
}