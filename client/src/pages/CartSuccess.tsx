
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { CheckCircle, ArrowRight, Calendar, CreditCard, Loader2, AlertCircle } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { useCart } from '@/contexts/CartContext';

export default function CartSuccess() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { clearCart } = useCart();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processedEnrollments, setProcessedEnrollments] = useState<number>(0);

  useEffect(() => {
    const processStripeRedirect = async () => {
      try {
        // Check if this is a Stripe redirect by looking for URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const paymentIntent = urlParams.get('payment_intent');
        const paymentIntentClientSecret = urlParams.get('payment_intent_client_secret');
        const redirectStatus = urlParams.get('redirect_status');

        console.log('🔄 CartSuccess: Checking for Stripe redirect params:', {
          paymentIntent,
          redirectStatus,
          hasClientSecret: !!paymentIntentClientSecret
        });

        if (paymentIntent && redirectStatus === 'succeeded') {
          console.log('✅ Payment succeeded! PaymentIntent:', paymentIntent);
          
          // Get cart data to know how many items were purchased
          let cartData = localStorage.getItem('cart') || sessionStorage.getItem('cart_backup');
          let itemCount = 1;
          
          if (cartData) {
            try {
              const cart = JSON.parse(cartData);
              itemCount = cart.items?.length || 1;
              console.log(`🛒 Cart had ${itemCount} items`);
            } catch (e) {
              console.error('Failed to parse cart data:', e);
            }
          }

          // Get payment plan info for display
          const selectedPaymentPlan = localStorage.getItem('selectedPaymentPlan') || 'full';
          console.log(`💳 Payment plan: ${selectedPaymentPlan}`);
          
          // The webhook will handle updating payment status in the background
          // We just need to show success and clear the cart
          
          setProcessedEnrollments(itemCount);
          
          toast({
            title: "Payment Successful!",
            description: `Your payment has been processed. Enrollments are being confirmed.`,
            duration: 5000,
          });

          // Clear ALL cart data
          localStorage.removeItem('cart');
          localStorage.removeItem('asa_cart');
          localStorage.removeItem('selectedPaymentPlan');
          sessionStorage.removeItem('cart_backup');
          
          // Clear cart in context - skip enrollment cancellation since payment already succeeded
          // Await to ensure cart clears properly, but don't fail if it errors
          try {
            await clearCart(true);
          } catch (cartError) {
            console.error('❌ Failed to clear cart context:', cartError);
            // Continue anyway - cart already cleared in localStorage
          }
          
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['/api/enrollments'] });
          queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
          queryClient.invalidateQueries({ queryKey: ['payment-history'] });
          
          console.log('✅ Cart cleared and queries invalidated');
          
        } else {
          console.log('❌ Invalid or missing Stripe redirect parameters');
          throw new Error('Invalid payment confirmation - missing required parameters');
        }
      } catch (error) {
        console.error('❌ Error processing Stripe redirect:', error);
        setError(error instanceof Error ? error.message : 'Failed to process payment');
        toast({
          title: "Payment Processing Error",
          description: error instanceof Error ? error.message : 'Failed to process payment',
          variant: "destructive",
        });
      } finally {
        setProcessing(false);
      }
    };

    processStripeRedirect();
  }, [toast, clearCart]);

  // Show loading state while processing
  if (processing) {
    return (
      <ParentAppShell>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-blue-600 mb-2">
              Processing Your Payment...
            </h1>
            <p className="text-muted-foreground">
              Please wait while we confirm your enrollment and update your account.
            </p>
            {processedEnrollments > 0 && (
              <p className="text-sm text-green-600 mt-2">
                Processed {processedEnrollments} enrollment{processedEnrollments > 1 ? 's' : ''}...
              </p>
            )}
          </div>
        </div>
      </ParentAppShell>
    );
  }

  // Show error state if something went wrong
  if (error) {
    return (
      <ParentAppShell>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-red-600 mb-2">
              Payment Processing Error
            </h1>
            <p className="text-muted-foreground mb-6">
              {error}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={() => setLocation('/billing')}
                className="flex items-center gap-2"
              >
                View Billing
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline"
                onClick={() => setLocation('/dashboard')}
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-green-600">
            Enrollment Complete!
          </h1>
          <p className="text-muted-foreground mt-2">
            Your payment has been processed and your children have been enrolled
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>What's Next?</CardTitle>
            <CardDescription>
              Here's what you can expect after enrollment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium">Payment Confirmation</h3>
                <p className="text-sm text-muted-foreground">
                  You'll receive an email receipt with payment details and enrollment confirmation
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium">Class Information</h3>
                <p className="text-sm text-muted-foreground">
                  Detailed class schedules and additional information will be sent to your email
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium">Enrollment Active</h3>
                <p className="text-sm text-muted-foreground">
                  Your children's enrollments are now active and visible in your dashboard
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            onClick={async () => {
              // Force refresh billing data before navigation
              await queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
              await queryClient.invalidateQueries({ queryKey: ['payment-history'] });
              setTimeout(() => setLocation('/billing'), 100); // Small delay to ensure cache refresh
            }}
            className="flex items-center gap-2"
          >
            View Updated Billing
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline"
            onClick={() => setLocation('/dashboard')}
          >
            View Dashboard
          </Button>
          <Button 
            variant="outline"
            onClick={() => setLocation('/programs')}
          >
            Browse More Classes
          </Button>
        </div>
      </div>
    </ParentAppShell>
  );
}
