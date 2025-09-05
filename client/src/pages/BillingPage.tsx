import React, { useState, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/SupabaseProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CreditCard, AlertCircle, CheckCircle, DollarSign, Calendar, User, Loader2, History } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { useLocation } from 'wouter';
import { useCart } from '@/contexts/CartContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

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

// Simple payment form component
function SimplePaymentForm({ onSuccess, onError }: { 
  onSuccess: () => void; 
  onError: (error: string) => void; 
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/billing'
      },
      redirect: 'if_required'
    });

    if (error) {
      onError(error.message || 'Payment failed');
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess();
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button 
        type="submit" 
        disabled={!stripe || isProcessing} 
        className="w-full"
      >
        {isProcessing ? 'Processing...' : 'Complete Payment'}
      </Button>
    </form>
  );
}

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
  stripeSubscriptionScheduleId?: string;
  enrollmentDetails: Array<{
    childName: string;
    className: string;
    price: number;
    amountPaid: number;
  }>;
}

interface StripeSubscriptionSchedule {
  id: string;
  status: 'not_started' | 'active' | 'completed' | 'canceled';
  phases: Array<{
    start_date: number;
    end_date: number;
    items: Array<{
      price: {
        id: string;
        unit_amount: number;
        currency: string;
      };
      quantity: number;
    }>;
  }>;
  current_phase: {
    start_date: number;
    end_date: number;
  } | null;
  next_invoice: {
    date: number;
    amount_due: number;
  } | null;
  metadata: {
    parentEmail: string;
    enrollmentIds: string;
    totalAmount: string;
    paymentPlan: string;
  };
}

// Stripe Subscription Schedules Tab
function SubscriptionSchedulesTab() {
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['stripe-subscription-schedules'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/stripe/subscription-schedules');
      if (!response.ok) {
        throw new Error('Failed to fetch subscription schedules');
      }
      const data = await response.json();
      return data.success ? data.schedules : [];
    },
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return (amount / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'not_started': 'outline',
      'active': 'default',
      'completed': 'secondary',
      'canceled': 'destructive'
    };
    return variants[status] || 'outline';
  };

  if (schedulesLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No payment plans found</h3>
        <p className="text-gray-500">Stripe-managed payment plans will appear here when you enroll with a payment plan option.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Payment Plans</h2>
        <p className="text-muted-foreground">Stripe-managed payment schedules and installments</p>
      </div>

      <div className="space-y-4">
        {schedules.map((schedule: any) => (
          <Card key={schedule.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-medium">Payment Plan #{schedule.id}</h3>
                  <Badge variant={getStatusBadge(schedule.stripeStatus)}>
                    {schedule.stripeStatus}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Plan: {schedule.paymentPlan} | Total: {formatCurrency(schedule.totalAmount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Created: {formatDate(new Date(schedule.createdAt).getTime() / 1000)}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold">
                  {schedule.nextInvoice ? formatCurrency(schedule.nextInvoice.amount_due) : 'N/A'}
                </div>
                <p className="text-sm text-muted-foreground">
                  {schedule.nextInvoice ? `Due: ${formatDate(schedule.nextInvoice.period_start)}` : 'No upcoming payment'}
                </p>
              </div>
            </div>

            {schedule.phases && schedule.phases.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-medium mb-2">Payment Schedule</h4>
                <div className="space-y-2">
                  {schedule.phases.map((phase: any, index: number) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>
                        Phase {index + 1}: {formatDate(phase.start_date)} - {formatDate(phase.end_date)}
                      </span>
                      <span>
                        {phase.items[0] ? formatCurrency(phase.items[0].price.unit_amount) : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {schedule.error && (
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {schedule.error}
                </AlertDescription>
              </Alert>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function PaymentHistoryTab() {
  const { data: paymentHistory = [], isLoading: historyLoading } = useQuery<PaymentHistoryItem[]>({
    queryKey: ['payment-history'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payment-history/history');
      const data = await response.json();
      return data.success ? data.payments : [];
    },
    enabled: true,
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

  if (historyLoading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading payment history...</span>
      </div>
    );
  }

  if (paymentHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No payment records found</h3>
        <p className="text-gray-500">Payment history will appear here once you make your first payment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Payment History</h2>
        <p className="text-muted-foreground">View and manage all your payments</p>
      </div>

      <div className="space-y-4">
        {paymentHistory.map((payment) => (
          <Card key={payment.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-medium">{payment.description || 'Payment'}</h3>
                  <Badge 
                    variant={payment.status === 'succeeded' ? 'default' : 
                            payment.status === 'pending' ? 'secondary' : 'destructive'}
                  >
                    {payment.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(payment.createdAt)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Transaction ID: {payment.stripePaymentIntentId}
                </p>
                {payment.stripeSubscriptionScheduleId && (
                  <p className="text-sm text-muted-foreground">
                    Payment Plan: {payment.stripeSubscriptionScheduleId}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold">
                  {formatCurrency(payment.amount)}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UpcomingPaymentsTab() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isPending, startTransition] = useTransition();
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [currentPayment, setCurrentPayment] = useState<any>(null);
  
  // Enable real-time updates for scheduled payments 
  const { isConnected } = useRealTimeUpdates({
    onBillingUpdate: (data) => {
      console.log('🔄 Upcoming payments: Real-time billing update received:', data);
      refetchUpcoming();
    },
    onPaymentComplete: (data) => {
      console.log('💳 Upcoming payments: Real-time payment complete:', data);
      refetchUpcoming();
      toast({
        title: "Payment Completed!",
        description: "Your scheduled payment has been processed successfully.",
        variant: "default",
      });
    }
  });

  const { data: upcomingPayments, isLoading, refetch: refetchUpcoming } = useQuery({
    queryKey: ['/api/stripe/subscription-schedules'], // Now managed by Stripe
    staleTime: 0,
    refetchInterval: 2000, // Refresh every 2 seconds
    queryFn: async () => {
      console.log('📅 Fetching upcoming payments...');
      // Return empty array - all payments now managed by Stripe subscription schedules
      return [];
      
      // All legacy scheduled payment functionality removed
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

  const handlePayScheduledPayment = async (payment: any) => {
    console.log('🔄 Pay Now clicked for scheduled payment:', payment.id);

    if (isPending) {
      console.log('⏳ Already processing, ignoring click');
      return;
    }

    console.log('🚀 Starting scheduled payment process');

    startTransition(() => {
      (async () => {
        try {
          console.log('📤 Sending scheduled payment request...');
          
          const response = await apiRequest('POST', '/api/scheduled-payments/pay', {
            paymentId: payment.id,
            amount: payment.amount,
            description: payment.description
          });

          console.log('📥 Scheduled payment response received:', response.status);

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('❌ Scheduled payment request failed:', errorData);
            throw new Error(`Payment request failed: ${errorData.message || response.statusText}`);
          }

          const data = await response.json();
          console.log('✅ Scheduled payment response data:', data);

          if (data.clientSecret) {
            console.log('🔑 Client secret received, showing payment form');
            setClientSecret(data.clientSecret);
            setCurrentPayment(payment);
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
          console.error('❌ Scheduled payment error:', error);
          toast({
            title: "Payment Error",
            description: error.message || "Failed to process payment. Please try again.",
            variant: "destructive",
          });
        }
      })();
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-500">Loading upcoming payments...</p>
      </div>
    );
  }

  if (!upcomingPayments || upcomingPayments.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No upcoming payments</h3>
        <p className="text-gray-500">Your payment plan payments will appear here when due.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-5 w-5 text-blue-600" />
        <h3 className="text-lg font-semibold">Upcoming Payment Plan Installments</h3>
      </div>
      
      {upcomingPayments.map((payment: any) => (
        <Card key={payment.id} className="border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    Payment {payment.installmentNumber} of {payment.totalInstallments}
                  </Badge>
                  <Badge variant="secondary">
                    {payment.paymentPlan === 'three_payments' ? '3-Payment Plan' : payment.paymentPlan}
                  </Badge>
                </div>
                
                <h4 className="font-semibold text-lg mb-1">{payment.description}</h4>
                <p className="text-gray-600 text-sm mb-3">Due: {formatDate(payment.dueDate)}</p>
                
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>Amount: {formatCurrency(payment.amount)}</span>
                  <span>•</span>
                  <span>Status: {payment.status}</span>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(payment.amount)}
                  </div>
                  <div className="text-sm text-gray-500">
                    Due {formatDate(payment.dueDate)}
                  </div>
                </div>
                
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handlePayScheduledPayment(payment)}
                  disabled={isPending}
                >
                  {isPending ? 'Processing...' : 'Pay Now'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Payment Reminders</h4>
            <p className="text-sm text-blue-700">
              We'll send you email reminders 7 days before each payment is due. 
              You can pay early at any time using the "Pay Now" button above.
            </p>
          </div>
        </div>
      </div>

      {/* Stripe Payment Form for scheduled payments */}
      {showPayment && clientSecret && (
        <div className="mt-8" data-payment-form>
          <Card>
            <CardHeader>
              <CardTitle>Complete Payment</CardTitle>
              <CardDescription>
                Process your scheduled payment securely with Stripe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <SimplePaymentForm 
                  onSuccess={() => {
                    console.log('✅ Scheduled payment completed');
                    
                    // Hide the payment form
                    setShowPayment(false);
                    setClientSecret('');
                    setCurrentPayment(null);
                    
                    // Navigate to payment success page
                    const successParams = new URLSearchParams({
                      payment_intent: `scheduled_${Date.now()}`,
                      amount: String(currentPayment?.amount || 0), // Use actual payment amount
                      date: new Date().toISOString(),
                      enrollments: JSON.stringify(currentPayment?.enrollmentIds || [])
                    });
                    
                    navigate(`/payment-success?${successParams.toString()}`);
                  }}
                  onError={(error: string) => {
                    console.error('❌ Scheduled payment failed:', error);
                    toast({
                      title: "Payment Failed",
                      description: error || "Please try again.",
                      variant: "destructive",
                    });
                    setShowPayment(false);
                    setClientSecret('');
                    setCurrentPayment(null);
                  }}
                />
              </Elements>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}



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

function PaymentForm({ 
  enrollmentIds, 
  totalAmount, 
  onPaymentSuccess,
  navigate
}: { 
  enrollmentIds: number[], 
  totalAmount: number,
  onPaymentSuccess: (details: { paymentIntentId: string; amount: number; paymentDate: string }) => void,
  navigate: (path: string) => void
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const { clearCart } = useCart();
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
          return_url: `${window.location.origin}/billing`,
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
        
        // Update enrollment statuses and send confirmation email
        try {
          console.log('🔄 Updating enrollment statuses and sending confirmation...');
          console.log('🔄 Enrollment IDs to update:', enrollmentIds);
          
          const token = localStorage.getItem('supabase_token');
          const confirmResponse = await fetch('/api/billing/confirm-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              paymentIntentId: paymentIntent.id,
              enrollmentIds: enrollmentIds,
              amount: totalAmount,
              paymentDate: new Date().toISOString(),
            })
          });
          
          if (confirmResponse.ok) {
            console.log('✅ Payment confirmation and enrollment update successful');
          } else {
            console.warn('⚠️ Payment confirmation failed:', await confirmResponse.text());
          }
        } catch (error) {
          console.error('❌ Error confirming payment:', error);
        }

        // Call the success callback with payment details
        onPaymentSuccess({
          paymentIntentId: paymentIntent.id,
          amount: totalAmount,
          paymentDate: new Date().toISOString(),
        });
        
        // Clear cart immediately to prevent refilling
        console.log('🛒 Clearing cart after successful payment');
        clearCart();

        // Navigate to payment success page with details
        const successParams = new URLSearchParams({
          payment_intent: paymentIntent.id,
          amount: totalAmount.toString(),
          date: new Date().toISOString(),
          enrollments: JSON.stringify(enrollmentIds)
        });
        
        navigate(`/payment-success?${successParams.toString()}`);
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
    }).format(amount / 100); // Convert cents to dollars
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
            paymentMethodOrder: ['card']
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
  const { clearCart } = useCart();
  const [, navigate] = useLocation();
  
  // Enable real-time updates for billing data
  const { isConnected } = useRealTimeUpdates({
    onBillingUpdate: (data) => {
      console.log('🔄 Real-time billing update received:', data);
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/subscription-schedules'] });
    },
    onPaymentComplete: (data) => {
      console.log('💳 Real-time payment complete:', data);
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/subscription-schedules'] });
      toast({
        title: "Payment Completed!",
        description: `Payment of ${data.amount ? (data.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'your payment'} has been processed successfully.`,
        variant: "default",
      });
    }
  });
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

  // Removed automatic redirect after payment success - users can manually navigate

  // Fetch billing summary with aggressive refreshing for real-time updates
  const { data: billingSummary, isLoading, error, refetch } = useQuery<BillingSummary>({
    queryKey: ['billing-summary'],
    staleTime: 0, // Always fetch fresh data
    refetchInterval: 1500, // Refresh every 1.5 seconds 
    refetchOnWindowFocus: true,
    refetchOnMount: true,
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
    notifyOnChangeProps: ['data', 'error', 'isLoading'],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100); // Convert cents to dollars
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
    
    // Always use the real-time total balance from the API
    const realTimeTotal = billingSummary.totalBalance || 0;
    console.log('🧮 Real-time total balance from API:', realTimeTotal);
    return realTimeTotal;
  };

  const getPaymentPlanAmount = () => {
    if (!billingSummary) return 0;
    // Get the actual balances for selected enrollments (or all if none selected)
    const enrollmentsToCalculate = selectedEnrollments.length > 0 
      ? billingSummary.enrollmentDetails.filter(detail => selectedEnrollments.includes(detail.enrollmentId))
      : billingSummary.enrollmentDetails;
    
    const totalBalance = enrollmentsToCalculate.reduce((total, detail) => total + detail.balance, 0);

    switch (selectedPaymentPlan) {
      case 'deposit_all':
        // Pay 10% deposit for selected enrollments
        return Math.round(totalBalance * 0.1);
      case 'half_now':
        // Pay 50% now, 50% later
        return Math.round(totalBalance * 0.5);
      case 'full_payment':
        // Pay everything with 5% discount if over $500
        const discount = totalBalance > 50000 ? Math.round(totalBalance * 0.05) : 0;
        return totalBalance - discount;
      case 'three_payments':
        // Split into 3 monthly payments - first payment amount
        return Math.round(totalBalance / 3);
      default:
        return totalBalance;
    }
  };

  const getPaymentPlanDescription = () => {
    if (!billingSummary) return '';
    // Get the actual balances for selected enrollments (or all if none selected)
    const enrollmentsToCalculate = selectedEnrollments.length > 0 
      ? billingSummary.enrollmentDetails.filter(detail => selectedEnrollments.includes(detail.enrollmentId))
      : billingSummary.enrollmentDetails;
    
    const totalBalance = enrollmentsToCalculate.reduce((total, detail) => total + detail.balance, 0);

    switch (selectedPaymentPlan) {
      case 'deposit_all':
        return `Pay 10% deposit (${formatCurrency(Math.round(totalBalance * 0.1))}) to secure selected enrollments. Remaining balance due before classes start.`;
      case 'half_now':
        return `Pay 50% now (${formatCurrency(Math.round(totalBalance * 0.5))}), remaining 50% in 30 days.`;
      case 'full_payment':
        const discount = totalBalance > 50000 ? Math.round(totalBalance * 0.05) : 0;
        return `Pay full amount now${discount > 0 ? ` with 5% discount (save ${formatCurrency(discount)})` : ''}. No future payments needed.`;
      case 'three_payments':
        return `Split into 3 equal monthly payments of ${formatCurrency(Math.round(totalBalance / 3))} each.`;
      default:
        return '';
    }
  };

  const handlePaySelected = async () => {
    console.log('🔄 Pay Selected button clicked');

    // Allow payment if specific enrollments are selected OR if user wants to pay all enrollments
    const enrollmentsToProcess = selectedEnrollments.length > 0 
      ? selectedEnrollments 
      : billingSummary?.enrollmentDetails?.map(d => d.enrollmentId) || [];

    if (enrollmentsToProcess.length === 0) {
      console.log('❌ No enrollments available to process');
      toast({
        title: "No Enrollments Available",
        description: "There are no enrollments available to pay.",
        variant: "destructive",
      });
      return;
    }

    if (isPending) {
      console.log('⏳ Already processing, ignoring click');
      return; // Prevent multiple clicks while processing
    }

    console.log('🚀 Starting payment process for enrollments:', enrollmentsToProcess);

    startTransition(() => {
      (async () => {
        try {
        const totalAmount = getPaymentPlanAmount();
        console.log('💰 Total amount to pay:', totalAmount);
        console.log('💳 Selected payment plan:', selectedPaymentPlan);

        console.log('📤 Sending payment request...');
        
        // Determine which enrollments to process
        const enrollmentsToProcess = selectedEnrollments.length > 0 
          ? selectedEnrollments 
          : billingSummary?.enrollmentDetails?.map(d => d.enrollmentId) || [];

        // Build payment details with selected plan
        const paymentDetails = enrollmentsToProcess.map(enrollmentId => {
          const enrollment = billingSummary?.enrollmentDetails?.find(d => d.enrollmentId === enrollmentId);
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
      })();
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
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            View and manage payments for your children's programs and classes
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="history">All Payments</TabsTrigger>
            <TabsTrigger value="plans">Payment Plans</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming Payments</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">

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
                      {formatCurrency(getSelectedTotal())}
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
                      {formatCurrency(getPaymentPlanAmount())}
                    </div>
                    <div className="text-sm text-muted-foreground">Next Payment Amount</div>
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
                      
                      {/* Cost Breakdown */}
                      <div className="flex justify-between items-start">
                        <div className="text-sm text-gray-600">
                          <div>Total Cost: {formatCurrency(detail.classPrice)}</div>
                          <div className="text-green-600">Amount Paid: {formatCurrency(detail.amountPaid)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-red-600">
                            Outstanding: {formatCurrency(detail.balance)}
                          </div>
                          <div className="text-sm text-blue-600">
                            Balance Due
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-6" />
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
                          Pay 10% deposit for all enrollments - {formatCurrency(Math.round(getSelectedTotal() * 0.1))}
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
                          Pay half now, half in 30 days - {formatCurrency(Math.round(getSelectedTotal() * 0.5))}
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
                          Complete payment now - {formatCurrency(getSelectedTotal() - (getSelectedTotal() > 50000 ? Math.round(getSelectedTotal() * 0.05) : 0))}
                          {getSelectedTotal() > 50000 && (
                            <span className="text-green-600 font-medium"> (Save {formatCurrency(Math.round(getSelectedTotal() * 0.05))})</span>
                          )}
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          {getSelectedTotal() > 50000 ? '5% discount applied, ' : ''}No future payments needed
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
                          Three monthly payments of {formatCurrency(Math.round(getSelectedTotal() / 3))} each
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
                        enrollmentIds={selectedEnrollments.length > 0 ? selectedEnrollments : billingSummary?.enrollmentDetails.map(d => d.enrollmentId) || []} 
                        totalAmount={getPaymentPlanAmount()} 
                        navigate={navigate}
                        onPaymentSuccess={async (details) => {
                          console.log('🎉 Payment success callback triggered:', details);
                          
                          // Clear cart immediately
                          console.log('🛒 Clearing cart after successful payment');
                          clearCart();
                          
                          // Clear the payment form
                          setShowPayment(false);
                          setClientSecret('');
                        }}
                      />
                    </Elements>
                  </React.Suspense>
                </CardContent>
              </Card>
            )}
          </div>
        )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <PaymentHistoryTab />
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <SubscriptionSchedulesTab />
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-6">
            <UpcomingPaymentsTab />
          </TabsContent>
        </Tabs>
      </div>
    </ParentAppShell>
  );
}