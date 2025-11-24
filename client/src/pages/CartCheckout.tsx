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
import { formatCurrency } from '@/utils/currency';
import { STRIPE_PUBLISHABLE_KEY } from '@/config/stripe';

// Initialize Stripe outside component to avoid re-creating the Stripe object
console.log('🔑 CartCheckout Stripe key check:', STRIPE_PUBLISHABLE_KEY ? 'Present' : 'Missing');

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

function CheckoutForm({ selectedPaymentPlan, selectedPlanAmount }: { selectedPaymentPlan: string; selectedPlanAmount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const { cart, clearCart } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [processing, setProcessing] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);
  
  // Reset ready state when stripe or elements change (e.g., when clientSecret changes)
  useEffect(() => {
    setElementsReady(false);
  }, [stripe, elements]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      toast({
        title: "Payment Not Ready",
        description: "Please wait for the payment form to load completely.",
        variant: "destructive",
      });
      return;
    }
    
    if (!elementsReady) {
      toast({
        title: "Payment Form Loading",
        description: "Please wait a moment for the payment form to finish loading.",
        variant: "destructive",
      });
      return;
    }

    // Backup cart data before processing payment
    const cartData = localStorage.getItem('cart');
    if (cartData) {
      sessionStorage.setItem('cart_backup', cartData);
      console.log('💾 Backed up cart data to sessionStorage');
    }

    setProcessing(true);

    // Save payment plan before payment for success page
    localStorage.setItem('selectedPaymentPlan', selectedPaymentPlan);

    // Ensure proper return URL with protocol
    const returnUrl = `${window.location.protocol}//${window.location.host}/cart/success`;
    console.log('💳 Stripe return URL:', returnUrl);

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: 'always', // Force redirect to success page
      });

      // Note: With redirect: 'always', Stripe redirects immediately on success
      // This code only runs if there's an error (redirect didn't happen)
      if (result.error) {
        setProcessing(false);
        toast({
          title: "Payment Failed",
          description: result.error.message,
          variant: "destructive",
        });
      }
      // No else block needed - successful payments redirect before reaching here
    } catch (error: any) {
      setProcessing(false);
      console.error("Payment processing failed:", error);
      toast({
        title: "Payment Failed",
        description: error.message || "There was an error processing your payment.",
        variant: "destructive",
      });
    }
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement 
        onReady={() => {
          console.log('✅ PaymentElement is ready');
          setElementsReady(true);
        }}
        onLoadError={(error) => {
          console.error('❌ PaymentElement load error:', error);
          setElementsReady(false);
        }}
      />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || !elementsReady || processing || cart.items.length === 0}
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing Payment...
          </>
        ) : !elementsReady ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading Payment Form...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay {formatCurrency(selectedPlanAmount)}
          </>
        )}
      </Button>
    </form>
  );
}

export default function CartCheckout() {
  const { cart, cartHydrated, cartLoading, clearCart, applyPromoCode, removePromoCode } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState<string>('full');
  const [paymentFrequency, setPaymentFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'one_time'>('one_time');
  
  // Promo code state
  const [promoCode, setPromoCode] = useState<string>('');
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<any>(null);
  const [promoError, setPromoError] = useState<string>('');
  
  // Stripe subscription state
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);

  // Debug cart data
  console.log('🛒 CartCheckout - cart data:', {
    itemsCount: cart.items.length,
    items: cart.items,
    subtotal: cart.subtotal,
    discounts: cart.discounts,
    total: cart.total
  });

  // Automatically set payment frequency based on selected plan
  useEffect(() => {
    if (selectedPaymentPlan === 'biweekly') {
      setPaymentFrequency('biweekly');
    } else if (selectedPaymentPlan === 'full' || selectedPaymentPlan === 'deposit') {
      setPaymentFrequency('one_time');
    }
    // Split plan allows user to choose frequency (weekly/biweekly/monthly)
    // No automatic frequency change needed for split plan
  }, [selectedPaymentPlan]);

  // Track if this is the initial load
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    console.log('🛒 CartCheckout useEffect - isAuthenticated:', isAuthenticated, 'cart items:', cart.items.length, 'cartHydrated:', cartHydrated, 'cartLoading:', cartLoading);
    
    if (!isAuthenticated) {
      console.log('🛒 User not authenticated, redirecting to login');
      setLocation('/login');
      return;
    }

    // CRITICAL: Wait for cart to be hydrated from API before proceeding
    if (!cartHydrated) {
      console.log('🛒 Cart not yet hydrated from API - waiting for TanStack Query to load data');
      return;
    }

    // Mark initial load as complete once cart is hydrated
    if (isInitialLoad) {
      console.log('🛒 Cart hydrated - marking initial load complete');
      setIsInitialLoad(false);
    }

    // CRITICAL: Don't redirect while cart is actively loading/refetching
    // This prevents premature redirect when refreshCart() invalidates the query
    if (cartLoading) {
      console.log('🛒 Cart is loading/refetching - waiting for fresh data');
      return;
    }

    // If cart has items after hydration, create payment intent
    if (cart.items.length > 0) {
      if (!clientSecret) {
        console.log('🛒 Creating initial payment intent with', cart.items.length, 'items');
        createPaymentIntent();
      }
    } else {
      // Cart is hydrated, not loading, and empty - redirect to programs
      console.log('🛒 Cart hydrated, not loading, and empty - redirecting to programs');
      setLocation('/programs');
    }
  }, [isAuthenticated, cartHydrated, cartLoading, cart.items.length, cart.total]); // Re-run when cart or loading status changes
  
  // Separate effect to handle discount changes - recreate payment intent when cart total changes
  useEffect(() => {
    // Don't recreate if we haven't created the initial payment intent yet
    if (!clientSecret || !isAuthenticated || cart.items.length === 0 || isInitialLoad) {
      return;
    }
    
    // When cart total changes (e.g., discount applied), recreate payment intent
    console.log('💳 Cart total changed, recreating payment intent with new amount:', cart.total);
    setClientSecret(''); // Clear to show loading state
    createPaymentIntent();
  }, [cart.total]); // Re-run when cart total changes
  
  // Separate effect to handle payment plan changes with debouncing
  useEffect(() => {
    // Don't recreate if we haven't created the initial payment intent yet
    if (!clientSecret || !isAuthenticated || cart.items.length === 0 || isInitialLoad) {
      return;
    }
    
    // Debounce payment intent recreation when payment plan changes
    const timeoutId = setTimeout(() => {
      console.log('💳 Payment plan changed, recreating payment intent');
      setClientSecret(''); // Clear to show loading state
      createPaymentIntent();
    }, 300); // 300ms debounce to prevent rapid recreations
    
    return () => clearTimeout(timeoutId);
  }, [selectedPaymentPlan, paymentFrequency])

  const createPaymentIntent = async () => {
    try {
      setLoading(true);
      
      // Get the amount to charge based on selected payment plan
      const selectedPlanAmount = getSelectedPlanAmount();
      // selectedPlanAmount is already in cents, no need to multiply by 100
      
      const response = await apiRequest(
        'POST',
        '/api/stripe/create-payment-intent',
        {
          items: cart.items.map(item => ({
            ...item,
            // These values are already in cents, don't multiply by 100 again
            price: item.price,
            totalCost: item.totalCost || item.price,
            depositRequired: item.depositRequired || 0,
            amountPaid: item.amountPaid || 0,
            remainingBalance: item.remainingBalance || 0
          })),
          subtotal: cart.subtotal, // Already in cents
          discounts: {
            siblingDiscount: cart.discounts.siblingDiscount, // Already in cents
            freeAfterThree: cart.discounts.freeAfterThree, // Already in cents
            appliedDiscounts: cart.discounts.appliedDiscounts || [],
            totalDiscountAmount: cart.discounts.totalDiscountAmount || 0 // Already in cents
          },
          total: cart.total, // ALWAYS send full cart total - backend calculates payment plan amounts
          paymentPlan: selectedPaymentPlan, // Include payment plan info
          paymentFrequency: paymentFrequency, // Include payment frequency for date-based scheduling
          parentEmail: user?.email,
        }
      );

      const data = await response.json();
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        
        // Capture Stripe subscription info from response
        if (data.hasActiveSubscription) {
          setHasActiveSubscription(true);
          setSubscriptionInfo(data.subscriptionInfo);
          console.log('✅ User has active Stripe subscription:', data.subscriptionInfo);
        } else {
          setHasActiveSubscription(false);
          setSubscriptionInfo(null);
        }
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
        features: [
          'No additional fees',
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
        id: 'biweekly',
        name: 'Biweekly Payment Plan',
        description: 'Automatic payments every 2 weeks until class ends',
        amount: Math.round(cart.total / 4), // Estimated amount per payment (will be calculated based on class dates)
        features: [
          'Pay every 2 weeks based on class schedule',
          'Payments automatically calculated from class start to end date',
          'No additional fees',
          'Cancel anytime with 30-day notice'
        ],
        installments: {
          frequency: 'biweekly',
          // Count and amounts will be calculated dynamically based on class dates
        }
      }
    ];
  };

  const getSelectedPlanAmount = () => {
    // For biweekly plans, send the FULL cart total to backend
    // The backend will calculate the payment schedule and divide it properly
    if (selectedPaymentPlan === 'biweekly') {
      return cart.total;
    }
    
    // For other plans, return the calculated plan amount
    const plans = getPaymentPlanOptions();
    const selectedPlan = plans.find(plan => plan.id === selectedPaymentPlan);
    return selectedPlan ? selectedPlan.amount : cart.total;
  };

  // Get the amount to display on the Pay button (first payment amount)
  const getButtonDisplayAmount = () => {
    // For biweekly plans, show the FIRST payment amount (total divided by 4)
    if (selectedPaymentPlan === 'biweekly') {
      return Math.ceil(cart.total / 4);
    }
    
    // For all other plans, show the full selected plan amount
    return getSelectedPlanAmount();
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
                {cart.items.map((item) => {
                  const isDiscounted = cart.discounts.discountedChildIds?.includes(item.childId);
                  const isFree = cart.discounts.freeItemIds?.includes(item.id);
                  return (
                  <div key={item.id} className="flex justify-between items-start p-3 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{item.className}</h4>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">for {item.childName}</p>
                        {isFree && (
                          <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200" data-testid={`badge-free-${item.id}`}>
                            <Gift className="h-2.5 w-2.5 mr-0.5" />
                            FREE
                          </Badge>
                        )}
                        {isDiscounted && !isFree && (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                            <Percent className="h-2.5 w-2.5 mr-0.5" />
                            Discount
                          </Badge>
                        )}
                      </div>
                      {item.schedule && (
                        <p className="text-xs text-muted-foreground mt-1">{item.schedule}</p>
                      )}
                    </div>
                    <div className="text-sm font-medium">
                      {isFree ? (
                        <span className="text-emerald-600" data-testid={`price-free-${item.id}`}>FREE</span>
                      ) : (
                        formatCurrency(item.price)
                      )}
                    </div>
                  </div>
                );
                })}

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
                            Sibling Discount {cart.schoolSettings?.siblingDiscountRate ? `(${Math.round(cart.schoolSettings.siblingDiscountRate * 100)}%)` : ''}:
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

                      {cart.discounts.appliedDiscounts && cart.discounts.appliedDiscounts.map((discount) => {
                        // Determine icon and color based on sourceType (not keyword heuristics)
                        const isBundle = discount.sourceType === 'bundle' || discount.bundleRule !== undefined;
                        const Icon = isBundle ? Gift : (discount.type === 'percentage' ? Percent : DollarSign);
                        const colorClass = isBundle ? 'text-purple-600' : 'text-blue-600';
                        
                        return (
                          <div key={discount.id} className={`flex justify-between text-sm ${colorClass}`}>
                            <span className="flex items-center gap-1">
                              <Icon className="h-3 w-3" />
                              <span className="font-medium">{discount.name}</span>
                              {discount.type === 'percentage' && (
                                <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                                  {discount.value}%
                                </Badge>
                              )}
                            </span>
                            <span className="font-semibold">-{formatCurrency(discount.discountAmount)}</span>
                          </div>
                        );
                      })}
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

            {/* Promo Code Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Percent className="h-4 w-4" />
                  Promo Code
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!cart.appliedPromoCode ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase());
                        setPromoError('');
                      }}
                      className="flex-1 px-3 py-2 border rounded-md text-sm"
                      disabled={validatingPromo}
                      data-testid="input-promo-code"
                    />
                    <Button
                      onClick={async () => {
                        setValidatingPromo(true);
                        setPromoError('');
                        const result = await applyPromoCode(promoCode);
                        setValidatingPromo(false);
                        if (!result.success) {
                          setPromoError(result.error || 'Invalid promo code');
                        } else {
                          setPromoCode('');
                        }
                      }}
                      disabled={!promoCode || validatingPromo}
                      size="sm"
                      data-testid="button-apply-promo"
                    >
                      {validatingPromo ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Validating...
                        </>
                      ) : (
                        'Apply'
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-green-800">{cart.appliedPromoCode.name}</p>
                        <p className="text-xs text-green-600">
                          Saving {formatCurrency(cart.appliedPromoCode.discountAmount)}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={removePromoCode}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid="button-remove-promo"
                    >
                      Remove
                    </Button>
                  </div>
                )}
                {promoError && (
                  <p className="text-sm text-red-600" data-testid="text-promo-error">{promoError}</p>
                )}
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
                                {formatCurrency(plan.amount)}
                              </div>
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
                      {selectedPaymentPlan === 'biweekly' ? (
                        <>
                          <div className="text-xs text-blue-600 mb-1">
                            Total: {formatCurrency(cart.total)}
                          </div>
                          <div className="text-lg font-bold text-blue-900">
                            {formatCurrency(Math.ceil(cart.total / 4))} × 4 payments
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-bold text-blue-900">
                            {formatCurrency(getSelectedPlanAmount())}
                          </div>
                          {selectedPaymentPlan === 'deposit' && (
                            <div className="text-xs text-blue-600">
                              Remaining: {formatCurrency(cart.total - getSelectedPlanAmount())}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stripe Subscription Alert */}
            {hasActiveSubscription && subscriptionInfo && (
              <Alert className="border-green-200 bg-green-50" data-testid="alert-stripe-subscription">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  <strong>Active Membership Found!</strong> You have an active membership through Stripe. 
                  Your membership is active and will renew on {new Date(subscriptionInfo.currentPeriodEnd).toLocaleDateString()}.
                  {cart.items.some(item => item.className?.toLowerCase().includes('membership')) && (
                    <span className="block mt-1 text-sm">
                      Note: Membership fees are already covered by your existing subscription.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Payment Frequency Selector - Only show for split payment plan */}
            {['split'].includes(selectedPaymentPlan) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Payment Frequency
                  </CardTitle>
                  <CardDescription>
                    Choose how often you'd like to make payments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={paymentFrequency} onValueChange={(value) => setPaymentFrequency(value as any)}>
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="biweekly" id="biweekly" className="mt-1" />
                        <Label htmlFor="biweekly" className="flex-1 cursor-pointer">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">Every 2 Weeks</h3>
                                <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                                  Recommended
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                Smaller payments spread evenly between class start and end dates
                              </p>
                            </div>
                          </div>
                        </Label>
                      </div>

                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="weekly" id="weekly" className="mt-1" />
                        <Label htmlFor="weekly" className="flex-1 cursor-pointer">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-medium">Weekly</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                More frequent smaller payments for easier budgeting
                              </p>
                            </div>
                          </div>
                        </Label>
                      </div>

                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="monthly" id="monthly" className="mt-1" />
                        <Label htmlFor="monthly" className="flex-1 cursor-pointer">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-medium">Monthly</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                Fewer, larger payments aligned with program duration
                              </p>
                            </div>
                          </div>
                        </Label>
                      </div>
                    </div>
                  </RadioGroup>

                  {/* Payment schedule preview */}
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">
                      <strong>Note:</strong> Payment dates are calculated based on your class start and end dates.
                      The final payment will align with the program end date.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

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
                {loading && !clientSecret ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading payment form...</span>
                  </div>
                ) : error ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {error}
                    </AlertDescription>
                  </Alert>
                ) : !stripePromise ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Stripe is not properly initialized. Please check your Stripe publishable key.
                    </AlertDescription>
                  </Alert>
                ) : clientSecret ? (
                  <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret }}>
                    <CheckoutForm selectedPaymentPlan={selectedPaymentPlan} selectedPlanAmount={getButtonDisplayAmount()} />
                  </Elements>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to initialize payment. Please try again or contact support.
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