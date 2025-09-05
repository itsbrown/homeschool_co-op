import React, { useState, useEffect } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/components/SupabaseProvider';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiRequest } from '@/lib/queryClient';
import { ShoppingCart, CreditCard, Percent, Gift, AlertCircle, Check, Loader2, Calendar, DollarSign } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';

// Initialize Stripe outside component to avoid re-creating the Stripe object
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
console.log('🔑 CartCheckout Stripe key check:', stripePublishableKey ? 'Present' : 'Missing');

if (!stripePublishableKey || stripePublishableKey.trim() === '') {
  console.error('❌ Missing VITE_STRIPE_PUBLIC_KEY environment variable');
}

const stripePromise = stripePublishableKey && stripePublishableKey.trim() !== '' 
  ? loadStripe(stripePublishableKey) 
  : null;

function CheckoutForm({ selectedPaymentPlan }: { selectedPaymentPlan: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const { cart, clearCart } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [processing, setProcessing] = useState(false);

  const formatCurrency = (amountInCents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amountInCents / 100);
  };

  const getSelectedPlanAmount = () => {
    const depositAmount = Math.round(cart.total * 0.1);
    const fullAmount = cart.total;
    const splitAmount = Math.round(cart.total / 2);
    const monthlyAmount = Math.round(cart.total / 3);
    
    switch (selectedPaymentPlan) {
      case 'deposit':
        return depositAmount;
      case 'full':
        return fullAmount > 500 ? fullAmount - 25 : fullAmount; // $25 discount for full payment over $500
      case 'split':
        return splitAmount;
      case 'monthly':
        return monthlyAmount;
      default:
        return cart.total;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    // Backup cart data before processing payment
    const cartData = localStorage.getItem('cart');
    if (cartData) {
      sessionStorage.setItem('cart_backup', cartData);
      console.log('💾 Backed up cart data to sessionStorage');
    }

    setProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/cart/success`,
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
        // Save payment plan to localStorage for success page processing
        localStorage.setItem('selectedPaymentPlan', selectedPaymentPlan);
        
        console.log('✅ Payment succeeded, Stripe will redirect to success page');
        // Don't process enrollments here - let Stripe redirect handle it
        // The CartSuccess page will process the enrollments after redirect
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


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || processing || cart.items.length === 0}
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
            Pay {formatCurrency(getSelectedPlanAmount())}
          </>
        )}
      </Button>
    </form>
  );
}

export default function CartCheckout() {
  const { cart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState<string>('full');

  // Debug cart data
  console.log('🛒 CartCheckout - cart data:', {
    itemsCount: cart.items.length,
    items: cart.items,
    subtotal: cart.subtotal,
    discounts: cart.discounts,
    total: cart.total
  });

  useEffect(() => {
    console.log('🛒 CartCheckout useEffect - isAuthenticated:', isAuthenticated, 'cart items:', cart.items.length);
    
    if (!isAuthenticated) {
      console.log('🛒 User not authenticated, redirecting to login');
      setLocation('/login');
      return;
    }

    // If cart has items, proceed with checkout
    if (cart.items.length > 0) {
      console.log('🛒 Cart has items, creating payment intent');
      createPaymentIntent();
      return;
    }

    // If cart is empty, wait longer for localStorage to load
    console.log('🛒 Cart is empty, waiting for cart to load...');
    let attempts = 0;
    const maxAttempts = 10; // Try for up to 5 seconds (10 * 500ms)
    
    const timer = setInterval(() => {
      attempts++;
      console.log(`🛒 Cart loading attempt ${attempts}/${maxAttempts} - items:`, cart.items.length);
      
      if (cart.items.length > 0) {
        console.log('🛒 Cart loaded with items:', cart.items.length);
        clearInterval(timer);
        createPaymentIntent();
      } else if (attempts >= maxAttempts) {
        console.log('🛒 CartCheckout: No items found after multiple attempts, redirecting to programs');
        clearInterval(timer);
        setLocation('/programs');
      }
    }, 500);
    
    return () => clearInterval(timer);
  }, [isAuthenticated]); // Re-create payment intent when payment plan changes

  const createPaymentIntent = async () => {
    try {
      setLoading(true);
      
      // Get the amount to charge based on selected payment plan
      const selectedPlanAmount = getSelectedPlanAmount();
      const amountToCharge = selectedPlanAmount * 100; // Convert to cents
      
      const response = await apiRequest(
        'POST',
        '/api/stripe/create-payment-intent',
        {
          items: cart.items.map(item => ({
            ...item,
            price: item.price * 100, // Convert to cents
            totalCost: (item.totalCost || item.price) * 100, // Convert to cents
            depositRequired: (item.depositRequired || 0) * 100, // Convert to cents
            amountPaid: (item.amountPaid || 0) * 100, // Convert to cents
            remainingBalance: (item.remainingBalance || 0) * 100 // Convert to cents
          })),
          subtotal: cart.subtotal * 100, // Convert to cents
          discounts: {
            siblingDiscount: cart.discounts.siblingDiscount * 100, // Convert to cents
            freeAfterThree: cart.discounts.freeAfterThree * 100, // Convert to cents
            appliedDiscounts: cart.discounts.appliedDiscounts || [],
            totalDiscountAmount: (cart.discounts.totalDiscountAmount || 0) * 100 // Convert to cents
          },
          total: amountToCharge, // Use selected payment plan amount in cents
          paymentPlan: selectedPaymentPlan, // Include payment plan info
          parentEmail: user?.email,
        }
      );

      const data = await response.json();
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        throw new Error('Failed to create payment intent');
      }
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      setError(error.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getUniqueChildrenCount = () => {
    const uniqueChildren = new Set(cart.items.map(item => item.childId));
    return uniqueChildren.size;
  };

  const hasDiscounts = cart.discounts.siblingDiscount > 0 || 
                    cart.discounts.freeAfterThree > 0 || 
                    (cart.discounts.appliedDiscounts && cart.discounts.appliedDiscounts.length > 0);

  const getPaymentPlanOptions = () => {
    const depositAmount = Math.round(cart.total * 0.1); // 10% deposit
    const fullAmount = cart.total;
    const splitAmount = Math.round(cart.total / 2); // 50% split payments
    const monthlyAmount = Math.round(cart.total / 3); // 3-month installments
    
    return [
      {
        id: 'deposit',
        name: 'Pay Deposit Only',
        description: 'Secure your spot with a 10% deposit',
        amount: depositAmount,
        popular: true,
        features: [
          'Immediate enrollment confirmation',
          'Remaining balance due before class starts',
          'Full refund if cancelled 30 days before',
          'Payment reminder emails'
        ],
        dueDate: 'Remaining balance due 2 weeks before class start'
      },
      {
        id: 'full',
        name: 'Pay in Full',
        description: 'Complete payment now',
        amount: fullAmount,
        discount: fullAmount > 500 ? 25 : 0, // $25 discount for full payment over $500
        features: [
          fullAmount > 500 ? '$25 discount on total cost' : 'No additional fees',
          'No future payment worries',
          'Priority class placement',
          'Full refund if cancelled 30 days before'
        ]
      },
      {
        id: 'split',
        name: 'Split Payment Plan',
        description: 'Pay 50% now, 50% later',
        amount: splitAmount,
        features: [
          'Pay half now, half in 30 days',
          'Automatic payment reminders',
          'No additional fees',
          'Flexible payment dates'
        ],
        installments: {
          count: 2,
          frequency: 'monthly',
          amounts: [splitAmount, splitAmount]
        }
      },
      {
        id: 'monthly',
        name: '3-Month Payment Plan',
        description: 'Pay in 3 monthly installments',
        amount: monthlyAmount,
        features: [
          'First payment today, then monthly',
          'Automatic monthly billing',
          'No additional fees',
          'Cancel anytime with 30-day notice'
        ],
        installments: {
          count: 3,
          frequency: 'monthly',
          amounts: [monthlyAmount, monthlyAmount, monthlyAmount]
        }
      }
    ];
  };

  const getSelectedPlanAmount = () => {
    const plans = getPaymentPlanOptions();
    const selectedPlan = plans.find(plan => plan.id === selectedPaymentPlan);
    return selectedPlan ? selectedPlan.amount - (selectedPlan.discount || 0) : cart.total;
  };

  if (loading) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Preparing your checkout...</p>
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
                Checkout Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center">{error}</p>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button onClick={() => setLocation('/programs')}>
                Return to Classes
              </Button>
            </CardFooter>
          </Card>
        </div>
      </ParentAppShell>
    );
  }

  if (!clientSecret) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
          <p className="text-muted-foreground">
            Complete your enrollment for {cart.items.length} class{cart.items.length !== 1 ? 'es' : ''}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Order Summary
                </CardTitle>
                <CardDescription>
                  Review your class enrollments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-start p-3 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{item.className}</h4>
                      <p className="text-xs text-muted-foreground">for {item.childName}</p>
                      {item.schedule && (
                        <p className="text-xs text-muted-foreground mt-1">{item.schedule}</p>
                      )}
                    </div>
                    <div className="text-sm font-medium">
                      {formatCurrency(item.price)}
                    </div>
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(cart.subtotal)}</span>
                  </div>

                  {hasDiscounts && (
                    <>
                      {cart.discounts.siblingDiscount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span className="flex items-center gap-1">
                            <Percent className="h-3 w-3" />
                            Sibling Discount (10%):
                          </span>
                          <span>-{formatCurrency(cart.discounts.siblingDiscount)}</span>
                        </div>
                      )}

                      {cart.discounts.freeAfterThree > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span className="flex items-center gap-1">
                            <Gift className="h-3 w-3" />
                            Free After Three:
                          </span>
                          <span>-{formatCurrency(cart.discounts.freeAfterThree)}</span>
                        </div>
                      )}

                      {cart.discounts.appliedDiscounts && cart.discounts.appliedDiscounts.map((discount) => (
                        <div key={discount.id} className="flex justify-between text-sm text-blue-600">
                          <span className="flex items-center gap-1">
                            <Gift className="h-3 w-3" />
                            {discount.name}:
                          </span>
                          <span>-{formatCurrency(discount.discountAmount)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  <Separator />
                  <div className="flex justify-between font-medium text-lg">
                    <span>Total:</span>
                    <span>{formatCurrency(cart.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Discount Info */}
            {getUniqueChildrenCount() > 1 && (
              <Alert className="border-green-200 bg-green-50">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  <strong>Discounts Applied!</strong> You're saving money with our family-friendly pricing.
                  {getUniqueChildrenCount() >= 4 && (
                    <span className="block mt-1">
                      Plus, your 4th child and beyond are free!
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Payment Form */}
          <div className="space-y-6">
            {/* Payment Plan Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Payment Plan Options
                </CardTitle>
                <CardDescription>
                  Choose how you'd like to pay for your enrollment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedPaymentPlan} onValueChange={setSelectedPaymentPlan}>
                  <div className="space-y-3">
                    {getPaymentPlanOptions().map((plan) => (
                      <div key={plan.id} className="flex items-start space-x-3">
                        <RadioGroupItem value={plan.id} id={plan.id} className="mt-1" />
                        <Label htmlFor={plan.id} className="flex-1 cursor-pointer">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{plan.name}</h3>
                                {plan.popular && (
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                                    Popular
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                                {plan.features.slice(0, 2).map((feature, index) => (
                                  <li key={index} className="flex items-center gap-1">
                                    <Check className="h-3 w-3 text-green-500" />
                                    {feature}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold">
                                {formatCurrency(plan.amount - (plan.discount || 0))}
                              </div>
                              {plan.discount && (
                                <div className="text-xs text-green-600">
                                  Save {formatCurrency(plan.discount)}
                                </div>
                              )}
                            </div>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>

                {/* Selected Plan Summary */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-blue-900">
                        {getPaymentPlanOptions().find(p => p.id === selectedPaymentPlan)?.name}
                      </div>
                      <div className="text-sm text-blue-700">
                        {getPaymentPlanOptions().find(p => p.id === selectedPaymentPlan)?.description}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-900">
                        {formatCurrency(getSelectedPlanAmount())}
                      </div>
                      {selectedPaymentPlan === 'deposit' && (
                        <div className="text-xs text-blue-600">
                          Remaining: {formatCurrency(cart.total - getSelectedPlanAmount())}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Information
                </CardTitle>
                <CardDescription>
                  Enter your payment details to complete enrollment
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stripePromise ? (
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <CheckoutForm selectedPaymentPlan={selectedPaymentPlan} />
                  </Elements>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      Stripe is not properly initialized. Please check your Stripe publishable key.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ParentAppShell>
  );
}