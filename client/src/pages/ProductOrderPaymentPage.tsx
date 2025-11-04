import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

interface Submission {
  id: number;
  formId: number;
  totalAmount: number;
  subtotal: number;
  platformFee: number;
  paymentStatus: string;
  stripePaymentIntentId: string | null;
  shippingAddress: any;
  responseData: any;
}

function CheckoutForm({ submissionId, totalAmount }: { submissionId: number; totalAmount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order-confirmation/${submissionId}`,
      },
    });

    if (error) {
      toast({
        title: 'Payment failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      <div className="border-t pt-4">
        <div className="flex justify-between text-lg font-bold mb-4">
          <span>Total:</span>
          <span data-testid="text-payment-total">${(totalAmount / 100).toFixed(2)}</span>
        </div>
      </div>

      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full"
        size="lg"
        data-testid="button-pay-now"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Pay Now'
        )}
      </Button>
    </form>
  );
}

export default function ProductOrderPaymentPage() {
  const [, params] = useRoute('/payment/:submissionId');
  const submissionId = params?.submissionId ? parseInt(params.submissionId) : null;
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch submission details
  const { data: submission, isLoading } = useQuery<Submission>({
    queryKey: [`/api/custom-forms/submissions/${submissionId}`],
    enabled: !!submissionId,
  });

  // Create payment intent when submission is loaded
  useEffect(() => {
    if (submission && !clientSecret && !paymentError) {
      const createPaymentIntent = async () => {
        try {
          // Get Supabase token for authentication
          const token = localStorage.getItem('supabase_token');
          
          const response = await fetch('/api/stripe/create-product-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              submissionId: submission.id,
              totalAmount: submission.totalAmount,
              description: `Product Order #${submission.id}`,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to create payment intent' }));
            throw new Error(errorData.message || 'Failed to create payment intent');
          }

          const data = await response.json();
          setClientSecret(data.clientSecret);
        } catch (error) {
          console.error('Error creating payment intent:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to create payment intent';
          setPaymentError(errorMessage);
          toast({
            title: 'Payment Setup Failed',
            description: errorMessage,
            variant: 'destructive',
          });
        }
      };

      createPaymentIntent();
    }
  }, [submission, clientSecret, paymentError, toast]);

  if (isLoading || !submission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const options = {
    clientSecret: clientSecret || '',
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Payment</CardTitle>
            <CardDescription>Order #{submission.id}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Order Summary */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-2">
              <h3 className="font-semibold mb-3">Order Summary</h3>
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${(submission.subtotal / 100).toFixed(2)}</span>
              </div>
              {submission.platformFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Platform Fee:</span>
                  <span>${(submission.platformFee / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total:</span>
                <span>${(submission.totalAmount / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Error Alert */}
            {paymentError && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{paymentError}</AlertDescription>
              </Alert>
            )}

            {/* Payment Form */}
            {!paymentError && clientSecret ? (
              <Elements stripe={stripePromise} options={options}>
                <CheckoutForm submissionId={submission.id} totalAmount={submission.totalAmount} />
              </Elements>
            ) : !paymentError ? (
              <div className="flex justify-center py-8" data-testid="loading-payment">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
