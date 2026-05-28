import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCart, type MembershipFee } from '@/contexts/CartContext';
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
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient, safeJsonParse } from '@/lib/queryClient';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'wouter';
import { ShoppingCart, CreditCard, Percent, Gift, AlertCircle, Check, Loader2, Calendar, DollarSign, Clock, CheckCircle2, Award, RefreshCw, ArrowLeft, Zap } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { formatCurrency } from '@/utils/currency';
import { formatClassSchedule } from '@/lib/utils';
import { stripePromise } from '@/config/stripe';
import type { Stripe } from '@stripe/stripe-js';
import { trackBeginCheckout, trackAddPaymentInfo } from '@/lib/analytics';
import { isFreeEnrollmentApproved as gateIsFreeEnrollmentApproved, cartLooksFreeButUnverified as gateCartLooksFreeButUnverified } from '@/utils/freeEnrollmentGate';
import { computeCartItemFingerprint } from '@shared/cartFingerprint';
import { normalizeCheckoutPaymentPlanRequest } from '@shared/checkout-payment-plan';

/** Server cart snapshot shape used for checkout reconciliation (see /api/cart/snapshot). */
type CheckoutPaymentPlanOption = {
  id: string;
  name: string;
  description: string;
  amount: number;
  features: string[];
  numberOfPayments?: number;
  totalAmount?: number;
  finalPaymentAmount?: number;
};

type FreeEnrollmentReason =
  | 'full_credit'
  | 'full_discount_code'
  | 'full_automatic_discount'
  | 'full_comp';

type AuthoritativeDataType = {
  itemsTotal: number;
  membershipAmount: number;
  membershipTotal: number;
  membershipFeeAmount: number;
  membershipAlreadyPaid: boolean;
  membershipRequired: boolean;
  membershipSchoolId: number | null;
  membershipSchoolName: string;
  membershipYear: number;
  discounts: any;
  schoolSettings: any;
  appliedPromoCode: string | null;
  payableAmount: number;
  paymentPlans: CheckoutPaymentPlanOption[];
  snapshotGeneratedAt?: number;
  isFreeEnrollment: boolean;
  freeEnrollmentReason: FreeEnrollmentReason | null;
};

function CheckoutForm({ selectedPaymentPlan, selectedPlanAmount, autoPayEnabled, hasPaymentMethod, togglingAutoPay, toggleAutoPay, checkoutBlocked, checkoutBlockedReason }: { selectedPaymentPlan: string; selectedPlanAmount: number; autoPayEnabled: boolean; hasPaymentMethod: boolean; togglingAutoPay: boolean; toggleAutoPay: (enabled: boolean) => void; checkoutBlocked?: boolean; checkoutBlockedReason?: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const { cart, clearCart } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [processing, setProcessing] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);
  const [pendingAutoPayEnabled, setPendingAutoPayEnabled] = useState(false);
  
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

    if (checkoutBlocked) {
      toast({
        title: "Action required",
        description: checkoutBlockedReason || "Complete the required steps before paying.",
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

    // Save pending auto-pay preference for first-time users (applied on success page after card is saved)
    if (!hasPaymentMethod) {
      localStorage.setItem('pendingAutoPay', pendingAutoPayEnabled ? 'true' : 'false');
    }

    // Ensure proper return URL with protocol
    const returnUrl = `${window.location.protocol}//${window.location.host}/cart/success`;
    console.log('💳 Stripe return URL:', returnUrl);

    // Track add_payment_info event for GA4
    trackAddPaymentInfo('card', selectedPlanAmount);
    
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
      {selectedPaymentPlan === 'biweekly' && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="font-medium text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Auto-Pay
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {autoPayEnabled
                  ? 'Your saved payment method will be charged automatically every two weeks'
                  : 'Turn on to have each installment charged automatically on its due date'}
              </p>
              {!hasPaymentMethod && pendingAutoPayEnabled && (
                <p className="text-xs text-muted-foreground mt-1">
                  Your card will be saved securely. Auto-pay activates after your first payment.
                </p>
              )}
            </div>
            <Switch
              checked={hasPaymentMethod ? autoPayEnabled : pendingAutoPayEnabled}
              onCheckedChange={hasPaymentMethod ? (checked) => toggleAutoPay(checked) : setPendingAutoPayEnabled}
              disabled={togglingAutoPay}
              aria-label="Enable automatic payments"
            />
          </div>
        </div>
      )}
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || !elementsReady || processing || checkoutBlocked || (cart.items.length === 0 && !cart.membership)}
        size="lg"
        data-testid="button-checkout-submit"
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
  const { cart, cartHydrated, cartLoading, clearCart, applyPromoCode, removePromoCode, refreshCart, setMembership } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isPriceMismatchError, setIsPriceMismatchError] = useState(false);
  // Captured at the moment the strict-validation 409 finally exhausts its
  // retries, so we can render an old-vs-new totals diff (plus a per-line
  // class-by-class breakdown) inside the blocking "Prices Have Changed"
  // screen instead of just a one-liner.
  const [priceMismatchDetails, setPriceMismatchDetails] = useState<{
    previousTotal: number | null;
    serverTotal: number | null;
    delta: number | null;
    lineDiffs: Array<{
      classId: number | null;
      variantId?: string | null;
      className: string;
      childName: string;
      clientPrice: number; // cents
      serverPrice: number; // cents — null when server has no pricing for this line
      delta: number; // cents (server - client)
    }>;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState<string>(() => {
    if (typeof window === 'undefined') return 'full';
    const saved = localStorage.getItem('selectedPaymentPlan');
    if (saved === 'full' || saved === 'biweekly' || saved === 'deposit' || saved === 'split') {
      return saved;
    }
    return 'full';
  });
  const [paymentFrequency, setPaymentFrequency] = useState<
    'weekly' | 'biweekly' | 'monthly' | 'one_time'
  >(() => {
    if (typeof window === 'undefined') return 'one_time';
    const saved = localStorage.getItem('selectedPaymentPlan');
    if (saved === 'biweekly') return 'biweekly';
    return 'one_time';
  });
  
  // Stripe loading state - store resolved Stripe instance, not a Promise
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeError, setStripeError] = useState<string>('');
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  
  // Load Stripe on mount
  useEffect(() => {
    const loadStripeInstance = async () => {
      try {
        const stripe = await stripePromise;
        if (stripe) {
          setStripeInstance(stripe);
          setStripeReady(true);
        } else {
          setStripeError('Failed to initialize payment system');
        }
      } catch (err: any) {
        setStripeError(err.message || 'Failed to load payment system');
      }
    };
    loadStripeInstance();
  }, []);
  
  // Promo code state
  const [promoCode, setPromoCode] = useState<string>('');
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<any>(null);
  const [promoError, setPromoError] = useState<string>('');
  
  // Stripe subscription state
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  
  // Volunteer credits state
  const [availableCredits, setAvailableCredits] = useState<number>(0);
  const [applyCredits, setApplyCredits] = useState(false);
  const [creditsToApply, setCreditsToApply] = useState<number>(0);
  const [loadingCredits, setLoadingCredits] = useState(false);
  
  // Free enrollment state (for 100% discount requiring admin approval)
  const [freeEnrollmentRequested, setFreeEnrollmentRequested] = useState(false);
  const [requestingFreeEnrollment, setRequestingFreeEnrollment] = useState(false);
  
  // Track if begin_checkout has been fired to prevent duplicates
  const [hasTrackedBeginCheckout, setHasTrackedBeginCheckout] = useState(false);
  
  // Cart snapshot state for server reconciliation
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // Use ref to track retry count for recursive calls (avoids stale closure)
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 1; // Only auto-retry once on 409
  
  // Checkout conflict guard - prevents infinite loop when 409 errors occur
  // When true, the initialization useEffect will not re-trigger createPaymentIntent
  const [hasCheckoutConflict, setHasCheckoutConflict] = useState(false);

  const [authoritativeData, setAuthoritativeData] = useState<AuthoritativeDataType | null>(null);

  /** Membership cents owed: cart line first, then server snapshot (covers refreshDiscounts wiping cart.membership). */
  const effectiveMembershipCents = useMemo(() => {
    const fromCart = cart.membership?.amount ?? 0;
    if (fromCart > 0) return fromCart;
    const a = authoritativeData;
    if (!a || a.membershipAlreadyPaid) return 0;
    const owed =
      a.membershipTotal ??
      a.membershipAmount ??
      (a.membershipRequired && a.membershipFeeAmount > 0 ? a.membershipFeeAmount : 0);
    return owed > 0 ? owed : 0;
  }, [cart.membership?.amount, authoritativeData]);

  const membershipForOrderSummary = useMemo((): MembershipFee | null => {
    if (cart.membership) return cart.membership;
    const a = authoritativeData;
    if (!a || a.membershipAlreadyPaid || a.membershipSchoolId == null) return null;
    const owed =
      a.membershipTotal ??
      a.membershipAmount ??
      (a.membershipRequired && a.membershipFeeAmount > 0 ? a.membershipFeeAmount : 0);
    if (owed > 0) {
      return {
        schoolId: a.membershipSchoolId,
        schoolName: a.membershipSchoolName,
        amount: owed,
        year: a.membershipYear,
      };
    }
    return null;
  }, [cart.membership, authoritativeData]);

  const actualPayableAmount = cart.total + effectiveMembershipCents;

  const agreementSchoolId =
    authoritativeData?.membershipSchoolId ?? membershipForOrderSummary?.schoolId ?? null;

  const { data: agreementStatus, isLoading: agreementStatusLoading } = useQuery<{
    hasSigned: boolean;
    requiresNewSignature: boolean;
  }>({
    queryKey: ['agreement-status-checkout', agreementSchoolId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/parent/agreements/check/${agreementSchoolId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to check membership agreement status');
      }
      return res.json();
    },
    enabled: !!agreementSchoolId && isAuthenticated,
    staleTime: 30_000,
  });

  const mustSignAgreement = agreementStatus?.requiresNewSignature === true;

  const isFreeEnrollmentApproved = gateIsFreeEnrollmentApproved(actualPayableAmount, authoritativeData);
  const cartLooksFreeButUnverified = gateCartLooksFreeButUnverified(actualPayableAmount, authoritativeData);

  console.log('🛒 CartCheckout - cart data:', {
    itemsCount: cart.items.length,
    subtotal: cart.subtotal,
    discounts: cart.discounts,
    total: cart.total,
    membershipCartCents: cart.membership?.amount || 0,
    effectiveMembershipCents,
    actualPayableAmount,
  });

  const handlePaymentPlanChange = (planId: string) => {
    setSelectedPaymentPlan(planId);
    localStorage.setItem('selectedPaymentPlan', planId);
    const normalized = normalizeCheckoutPaymentPlanRequest(planId, paymentFrequency);
    if (normalized.paymentFrequency !== paymentFrequency) {
      setPaymentFrequency(normalized.paymentFrequency);
    }
  };

  // Keep frequency aligned with selected plan (server uses both fields)
  useEffect(() => {
    const normalized = normalizeCheckoutPaymentPlanRequest(
      selectedPaymentPlan,
      paymentFrequency,
    );
    if (normalized.paymentFrequency !== paymentFrequency) {
      setPaymentFrequency(normalized.paymentFrequency);
    }
  }, [selectedPaymentPlan, paymentFrequency]);

  // Auto-pay status query and toggle (only relevant when biweekly is selected)
  const { data: autoPayData, isLoading: autoPayLoading } = useQuery({
    queryKey: ['/api/user/auto-pay-status'],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const autoPayEnabled: boolean = (autoPayData as any)?.autoPayEnabled ?? false;

  const { data: paymentMethodData } = useQuery({
    queryKey: ['/api/user/payment-method'],
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const hasPaymentMethod: boolean = !!(paymentMethodData as any)?.cardOnFile;

  const { mutate: toggleAutoPay, isPending: togglingAutoPay } = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest('PATCH', '/api/user/auto-pay', { enabled });
      if (!res.ok) throw new Error('Failed to update auto-pay preference');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/auto-pay-status'] });
    },
    onError: () => {
      toast({ title: 'Could not update auto-pay setting. Please try again.', variant: 'destructive' });
    },
  });

  // Fetch available volunteer credits
  useEffect(() => {
    const fetchCredits = async () => {
      if (!isAuthenticated) return;
      setLoadingCredits(true);
      try {
        const response = await apiRequest('GET', '/api/my-credits/available');
        const data = await response.json();
        setAvailableCredits(data.totalAvailableCents || 0);
        console.log('💰 Available volunteer credits:', data.totalAvailableCents);
      } catch (err) {
        console.error('Failed to fetch volunteer credits:', err);
        setAvailableCredits(0);
      } finally {
        setLoadingCredits(false);
      }
    };
    fetchCredits();
  }, [isAuthenticated]);

  // Calculate credits to apply based on cart total
  useEffect(() => {
    if (applyCredits && availableCredits > 0) {
      const maxApplicable = Math.min(availableCredits, actualPayableAmount);
      setCreditsToApply(maxApplicable);
    } else {
      setCreditsToApply(0);
    }
  }, [applyCredits, availableCredits, actualPayableAmount]);

  // Track if this is the initial load
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Latest cart gate for debounced "empty cart" redirect — avoids racing TanStack
  // refetch so checkout briefly sees 0 lines and sends parents to the wrong page.
  const checkoutGateRef = useRef({
    itemCount: 0,
    hasMembership: false,
    hydrated: false,
    loading: true,
  });
  checkoutGateRef.current = {
    itemCount: cart.items.length,
    hasMembership: !!cart.membership || effectiveMembershipCents > 0,
    hydrated: cartHydrated,
    loading: cartLoading,
  };
  const emptyCartRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (emptyCartRedirectTimerRef.current) {
      clearTimeout(emptyCartRedirectTimerRef.current);
      emptyCartRedirectTimerRef.current = null;
    }

    console.log('🛒 CartCheckout useEffect - isAuthenticated:', isAuthenticated, 'cart items:', cart.items.length, 'membership:', cart.membership, 'cartHydrated:', cartHydrated, 'cartLoading:', cartLoading);
    
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

    // If cart has items OR membership (cart or server snapshot) after hydration, proceed
    const hasCartContent =
      cart.items.length > 0 || !!cart.membership || effectiveMembershipCents > 0;
    if (hasCartContent) {
      const payableAmount = actualPayableAmount;
      
      // If total payable is $0 (100% discount with no membership), don't create payment intent
      // The UI will show the Free Enrollment request flow instead
      if (payableAmount === 0) {
        console.log('🛒 Total payable is $0 - showing Free Enrollment flow (skipping payment intent)');
        setLoading(false);
        return;
      }
      
      // Guard: Don't re-trigger if we already hit a checkout conflict (409 with max retries exceeded)
      // This prevents infinite loops when the server rejects our cart prices
      if (hasCheckoutConflict) {
        console.log('🛒 Checkout conflict detected - not re-triggering payment intent creation');
        return;
      }
      
      if (!clientSecret) {
        console.log(
          '🛒 Creating initial payment intent with',
          cart.items.length,
          'items and membership due (cart or snapshot):',
          effectiveMembershipCents > 0,
        );
        // Pass forceRefresh=true to ensure fresh snapshot with membership data
        createPaymentIntent(null, true);
      }
      return;
    }

    // Cart looks empty: debounce redirect so a refetching window does not send users
    // away from checkout while lines are still loading into state.
    const expectingCheckoutAfterEnrollment =
      sessionStorage.getItem("postSessionEnrollmentCheckout") === "1";
    const redirectDebounceMs = expectingCheckoutAfterEnrollment ? 2500 : 600;

    emptyCartRedirectTimerRef.current = setTimeout(() => {
      const g = checkoutGateRef.current;
      const stillEmpty =
        g.hydrated && !g.loading && g.itemCount === 0 && !g.hasMembership;
      if (stillEmpty) {
        console.log('🛒 Cart still empty after debounce — leaving checkout for /payments');
        sessionStorage.removeItem("postSessionEnrollmentCheckout");
        setLocation('/payments');
      } else {
        sessionStorage.removeItem("postSessionEnrollmentCheckout");
      }
      emptyCartRedirectTimerRef.current = null;
    }, redirectDebounceMs);

    return () => {
      if (emptyCartRedirectTimerRef.current) {
        clearTimeout(emptyCartRedirectTimerRef.current);
        emptyCartRedirectTimerRef.current = null;
      }
    };
  }, [isAuthenticated, cartHydrated, cartLoading, cart.items.length, cart.membership, cart.total, effectiveMembershipCents, actualPayableAmount, hasCheckoutConflict]); // Re-run when cart or loading status changes

  // Load authoritative snapshot (including membership) as soon as the cart is ready,
  // not only inside create-payment-intent — so the order summary shows membership.
  useEffect(() => {
    if (!isAuthenticated || !cartHydrated || cartLoading || cart.items.length === 0) {
      return;
    }
    if (authoritativeData?.membershipTotal != null && authoritativeData.membershipTotal > 0) {
      return;
    }
    if (authoritativeData?.membershipAlreadyPaid) {
      return;
    }
    void fetchCartSnapshot();
  }, [isAuthenticated, cartHydrated, cartLoading, cart.items.length, authoritativeData?.membershipTotal, authoritativeData?.membershipAlreadyPaid]);
  
  // Separate effect to handle discount changes - recreate payment intent when cart total changes
  useEffect(() => {
    // Check if cart has any content (items OR membership)
    const hasCartContent =
      cart.items.length > 0 || !!cart.membership || effectiveMembershipCents > 0;
    
    // Don't recreate if we haven't created the initial payment intent yet or no cart content
    // Also don't recreate if we have a checkout conflict (prevents infinite loop)
    if (!clientSecret || !isAuthenticated || !hasCartContent || isInitialLoad || hasCheckoutConflict) {
      return;
    }
    
    const payableAmount = actualPayableAmount;
    
    // If total payable becomes $0, clear clientSecret to show Free Enrollment flow
    if (payableAmount === 0) {
      console.log('💳 Total payable is $0 - clearing clientSecret for Free Enrollment flow');
      setClientSecret('');
      setLoading(false);
      return;
    }
    
    // When cart total changes (e.g., discount applied), recreate payment intent
    // CRITICAL: Pass forceRefresh=true to ensure fresh snapshot includes the promo code
    // Without this, stale authoritativeData with null promo code would be used
    console.log('💳 Cart total changed, recreating payment intent with new amount:', cart.total, 'promoCode:', cart.appliedPromoCode?.code || 'none');
    setClientSecret(''); // Clear to show loading state
    createPaymentIntent(null, true); // Force fresh snapshot to include promo code
  }, [cart.total, actualPayableAmount]); // Re-run when class total or membership component changes
  
  // Separate effect to handle payment plan changes with debouncing
  useEffect(() => {
    // Check if cart has any content (items OR membership)
    const hasCartContent =
      cart.items.length > 0 || !!cart.membership || effectiveMembershipCents > 0;
    
    // Don't recreate if we haven't created the initial payment intent yet or no cart content
    // Also don't recreate if we have a checkout conflict (prevents infinite loop)
    if (!clientSecret || !isAuthenticated || !hasCartContent || isInitialLoad || hasCheckoutConflict) {
      return;
    }
    
    // Debounce payment intent recreation when payment plan changes
    const timeoutId = setTimeout(() => {
      console.log('💳 Payment plan changed, recreating payment intent (snapshot trust path)');
      setClientSecret(''); // Clear to show loading state
      // includeTrustSignal=true — switching plan/frequency is NOT a
      // cart-content change, so the server can reuse the snapshot it
      // already issued and skip the strict cart-vs-DB revalidation that
      // was producing spurious 409 "Prices Have Changed" blocks.
      createPaymentIntent(null, false, true);
    }, 300); // 300ms debounce to prevent rapid recreations
    
    return () => clearTimeout(timeoutId);
  }, [selectedPaymentPlan, paymentFrequency])

  // Effect to recreate payment intent and refresh snapshot when credits are toggled
  useEffect(() => {
    const hasCartContent =
      cart.items.length > 0 || !!cart.membership || effectiveMembershipCents > 0;
    
    // Also don't recreate if we have a checkout conflict (prevents infinite loop)
    if (!clientSecret || !isAuthenticated || !hasCartContent || isInitialLoad || hasCheckoutConflict) {
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      console.log('💳 Credits changed, recreating payment intent with creditsToApply:', creditsToApply);
      setClientSecret('');
      // Pass forceRefresh=true to ensure fresh snapshot with current credits amount
      createPaymentIntent(null, true);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [creditsToApply]);

  const prevCartItemsRef = useRef<string>('');
  
  useEffect(() => {
    const currentCartKey = cart.items.map(i => `${i.classId}-${i.childId}-${i.variantId || ''}`).sort().join('|');
    
    if (prevCartItemsRef.current && prevCartItemsRef.current !== currentCartKey) {
      console.log('🔄 Cart items changed - clearing stale authoritative data and promo state');
      setAuthoritativeData(null);
      setAppliedPromo(null);
      setPromoCode('');
      setPromoError('');
      setClientSecret('');
      setHasCheckoutConflict(false);
      // CRITICAL: Drop the trusted snapshotId on any cart-content change so
      // the next /create-payment-intent call falls back to strict validation
      // and re-issues a fresh snapshot. Failing to clear this would let the
      // server honour a snapshot whose fingerprint no longer matches.
      setSnapshotId(null);
      retryCountRef.current = 0;
      setRetryCount(0);
    }
    
    prevCartItemsRef.current = currentCartKey;
  }, [cart.items]);

  // Fetch cart snapshot from server to get authoritative pricing
  // IMPORTANT: promoCodeOverride parameter is used to pass fresh promo code
  // when called immediately after applyPromoCode (before React state updates)
  // Returns the authoritative data directly for immediate use (avoids React state timing issues)
  const fetchCartSnapshot = async (promoCodeOverride?: string | null, creditsOverride?: number): Promise<AuthoritativeDataType | null> => {
    // Allow membership-only carts (e.g., "Pay Outstanding" for a membership
    // with no enrollments). The /cart/snapshot endpoint accepts an empty
    // items array and still derives membership/credits from the parent's
    // school config and credit balance.
    if (cart.items.length === 0 && !cart.membership) return null; // Nothing to sync

    const defaultSnapshotError =
      'Unable to verify cart pricing. Please refresh and try again.';

    try {
      setSnapshotLoading(true);
      // Use override if provided, otherwise fall back to cart state
      const promoCode = promoCodeOverride !== undefined ? promoCodeOverride : (cart.appliedPromoCode?.code || null);
      // Use credits override if provided, otherwise use current state
      const creditsAmount = creditsOverride !== undefined ? creditsOverride : (applyCredits ? creditsToApply : 0);
      console.log('📸 Fetching cart snapshot from server with promoCode:', promoCode, 'creditsToApply:', creditsAmount);

      const response = await apiRequest(
        'POST',
        '/api/cart/snapshot',
        {
          items: cart.items.map(item => ({
            id: item.id,
            classId: item.classId,
            childId: item.childId,
            childName: item.childName,
            variantId: item.variantId,
            sessionId: item.sessionId,
            // Include enrollment data for existing enrollments with partial payments
            enrollmentId: item.enrollmentId,
            remainingBalance: item.remainingBalance
          })),
          appliedPromoCode: promoCode,
          creditsToApply: creditsAmount
        },
        {
          // Read JSON error bodies instead of apiRequest throwing before we can
          // surface the server's message (fixes opaque "verify cart pricing" UX).
          passthroughStatuses: [400, 404, 409, 422, 429, 500, 502, 503],
        },
      );

      if (!response.ok) {
        let detail = defaultSnapshotError;
        if (response.status === 401) {
          detail = 'Your session may have expired. Please sign in again and retry checkout.';
        } else {
          try {
            const errBody = await safeJsonParse(response);
            const code = errBody?.error;
            const msg =
              typeof errBody?.message === 'string' && errBody.message.trim()
                ? errBody.message.trim()
                : '';
            if (msg) {
              detail = msg;
            } else if (code === 'UNAUTHORIZED_CHILDREN') {
              detail =
                'One or more classes in your cart are linked to a child we could not verify on your account. Remove those lines or refresh your cart, then try again.';
            } else if (code === 'MIXED_SCHOOLS') {
              detail =
                'Your cart contains classes from more than one school. Complete checkout for one school at a time.';
            } else if (code === 'SCHOOL_NOT_FOUND' || code === 'NO_SCHOOL_ID') {
              detail =
                'We could not determine which school this cart belongs to. Remove invalid classes and try again.';
            }
          } catch (parseErr: any) {
            const pm =
              typeof parseErr?.message === 'string' ? parseErr.message.trim() : '';
            if (pm) detail = pm;
          }
        }
        throw new Error(detail);
      }

      const snapshot = await safeJsonParse(response);

      if (!snapshot?.snapshotId) {
        throw new Error(defaultSnapshotError);
      }

      setSnapshotId(snapshot.snapshotId);
      console.log('📸 Cart snapshot received:', {
        snapshotId: snapshot.snapshotId,
        serverTotal: snapshot.totals.grandTotal,
        membershipTotal: snapshot.totals.membershipTotal,
        clientTotal: cart.total + (cart.membership?.amount || 0),
        membershipRequired: snapshot.membership.required,
        membershipAmount: snapshot.membership.discountedAmount,
        membershipAlreadyPaid: snapshot.membership.alreadyPaid,
        membershipSchoolId: snapshot.membership.schoolId,
        availableCredits: snapshot.credits.available
      });

      // Build authoritative data object
      const authData: AuthoritativeDataType = {
        itemsTotal: snapshot.totals.itemsTotal,
        membershipTotal: snapshot.totals.membershipTotal ?? 0,
        membershipAmount: snapshot.membership.alreadyPaid
          ? 0
          : (snapshot.totals.membershipTotal ?? snapshot.membership.discountedAmount ?? 0),
        membershipFeeAmount: snapshot.membership.amount ?? 0,
        membershipAlreadyPaid: snapshot.membership.alreadyPaid,
        membershipRequired: snapshot.membership.required,
        membershipSchoolId: snapshot.membership.schoolId || null,
        membershipSchoolName: snapshot.membership.schoolName || 'School',
        membershipYear: snapshot.membership.year || new Date().getFullYear(),
        discounts: snapshot.pricing.discounts,
        schoolSettings: snapshot.pricing.schoolSettings,
        appliedPromoCode: promoCode, // Store the promo code used for this snapshot
        payableAmount: snapshot.totals.payableAmount,
        paymentPlans: snapshot.paymentPlans || [],
        snapshotGeneratedAt: snapshot.generatedAt,
        // Authoritative server-derived free-enrollment flag — see type comment.
        isFreeEnrollment: snapshot.isFreeEnrollment === true,
        freeEnrollmentReason: snapshot.freeEnrollmentReason ?? null,
      };

      // Store authoritative data in state for UI components
      setAuthoritativeData(authData);

      const owedMembership = authData.membershipTotal ?? authData.membershipAmount ?? 0;
      if (
        !authData.membershipAlreadyPaid &&
        owedMembership > 0 &&
        authData.membershipSchoolId != null
      ) {
        setMembership({
          schoolId: authData.membershipSchoolId,
          schoolName: authData.membershipSchoolName,
          amount: owedMembership,
          year: authData.membershipYear,
        });
      }

      // Update available credits from snapshot
      setAvailableCredits(snapshot.credits.available);

      // Return the data directly for immediate use (avoids waiting for React state update)
      return authData;
    } catch (err: any) {
      console.warn('⚠️ Failed to fetch cart snapshot:', err);
      const msg = typeof err?.message === 'string' ? err.message : '';
      if (
        msg.includes("Unexpected token '<") ||
        msg.includes('<!DOCTYPE') ||
        msg.includes('<html')
      ) {
        throw new Error(
          'The pricing service returned a web page instead of data. Open checkout on the same app URL where the rest of the site loads (so /api routes work), then refresh.',
        );
      }
      throw err instanceof Error ? err : new Error(defaultSnapshotError);
    } finally {
      setSnapshotLoading(false);
    }
  };

  // Accept optional fresh auth data to avoid React state timing issues
  // When forceRefresh is true, always fetches new snapshot even if authoritativeData exists
  // When includeTrustSignal is true, passes trustedSnapshotId + cartItemFingerprint
  // so the server can skip strict cart-vs-DB validation. ONLY enable this on
  // payment-plan / payment-frequency change effects — the cart contents are
  // unchanged on those toggles, so the snapshot the server already issued for
  // this cart is still authoritative. NEVER enable on initial mount,
  // cart-total change, credits-toggle, or 409-retry calls — those legitimately
  // need the strict path.
  const createPaymentIntent = async (
    freshAuthData?: AuthoritativeDataType | null,
    forceRefresh: boolean = false,
    includeTrustSignal: boolean = false,
  ) => {
    try {
      setLoading(true);
      
      // CRITICAL FIX: Always use fresh data when provided, or fetch if null/forceRefresh
      // This prevents race conditions where authoritativeData is stale/null
      // The snapshot is the single source of truth for pricing
      let currentAuthData = freshAuthData || (forceRefresh ? null : authoritativeData);
      if (!currentAuthData) {
        console.log('📸 Fetching fresh snapshot before payment (forceRefresh:', forceRefresh, ')...');
        currentAuthData = await fetchCartSnapshot();
        if (!currentAuthData) {
          throw new Error('Unable to verify cart pricing. Please refresh and try again.');
        }
        console.log('📸 Fresh snapshot data obtained:', {
          itemsTotal: currentAuthData.itemsTotal,
          membershipAmount: currentAuthData.membershipAmount,
          membershipRequired: currentAuthData.membershipRequired
        });
      }
      
      // Get the amount to charge based on selected payment plan
      const selectedPlanAmount = getSelectedPlanAmount();
      // selectedPlanAmount is already in cents, no need to multiply by 100
      
      // Use authoritative data from snapshot (now guaranteed to exist)
      const useAuthData = currentAuthData !== null;
      const itemsTotal = useAuthData ? currentAuthData.itemsTotal : cart.total;
      const membershipAmount = useAuthData
        ? (currentAuthData.membershipTotal ??
          currentAuthData.membershipAmount ??
          0)
        : (cart.membership?.amount || 0);
      const membershipAlreadyPaid = useAuthData ? currentAuthData.membershipAlreadyPaid : false;
      const discounts = useAuthData 
        ? currentAuthData.discounts 
        : cart.discounts;
      
      // Build membership object using authoritative data when available
      // Key cases:
      // 1. membershipAlreadyPaid=true → null (no need to pay again)
      // 2. membershipRequired=true AND !membershipAlreadyPaid → send with authoritative amount (even if 0)
      //    (server needs to see explicit payload to recognize discounted membership)
      // 3. cart.membership exists but no authoritative data → use cart.membership
      // 4. No membership required → null
      let membershipPayload = null;
      if (useAuthData) {
        // Using authoritative data - construct payload from it
        if (membershipAlreadyPaid) {
          // Already paid - don't send membership at all
          membershipPayload = null;
        } else if (
          currentAuthData.membershipSchoolId != null &&
          (membershipAmount > 0 || currentAuthData.membershipRequired)
        ) {
          membershipPayload = {
            schoolId: currentAuthData.membershipSchoolId,
            schoolName: currentAuthData.membershipSchoolName || cart.membership?.schoolName || 'School',
            amount: membershipAmount,
            year: currentAuthData.membershipYear,
          };
        } else if (cart.membership) {
          // Cart has membership but server says not required (edge case) - use cart data
          membershipPayload = {
            schoolId: cart.membership.schoolId,
            schoolName: cart.membership.schoolName,
            amount: membershipAmount,
            year: cart.membership.year,
          };
        }
        // If membership not required and cart.membership doesn't exist, payload stays null
      } else {
        // No authoritative data yet - use client cart membership as-is
        membershipPayload = cart.membership;
      }
      
      console.log('💳 Creating payment intent with:', {
        useAuthoritativeData: useAuthData,
        itemsTotal,
        membershipAmount,
        membershipAlreadyPaid,
        membershipPayload: membershipPayload ? { amount: membershipPayload.amount } : null
      });
      
      // Build the trust signal only when explicitly requested (i.e. on
      // plan/frequency-toggle calls). Compute the fingerprint from the same
      // tuples the server uses so the cache key matches.
      const fingerprint = computeCartItemFingerprint(
        cart.items.map((i: any) => ({
          classId: i.classId,
          childId: i.childId,
          variantId: i.variantId,
          enrollmentId: i.enrollmentId,
        })),
      );
      const trustSignal = (includeTrustSignal && snapshotId)
        ? { trustedSnapshotId: snapshotId, cartItemFingerprint: fingerprint }
        : {};

      // Use bare fetch (NOT apiRequest) here because the existing 409
      // conflict-recovery flow relies on inspecting `response.status` and
      // calling `response.json()` to read the server's authoritative
      // values, then auto-retrying. apiRequest throws on non-OK statuses
      // (including 409) which would skip the recovery flow entirely.
      // We still attach the supabase token + activeRole header manually.
      const token = localStorage.getItem('supabase_token');
      const activeRole = localStorage.getItem('activeRole');
      const checkoutPlan = normalizeCheckoutPaymentPlanRequest(
        selectedPaymentPlan,
        paymentFrequency,
      );
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...(activeRole ? { 'X-Active-Role': activeRole } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
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
            siblingDiscount: discounts.siblingDiscount || 0,
            freeAfterThree: discounts.freeAfterThree || 0,
            appliedDiscounts: discounts.appliedDiscounts || [],
            totalDiscountAmount: discounts.totalDiscountAmount || 0
          },
          total: itemsTotal, // Use authoritative items total if available
          paymentPlan: checkoutPlan.paymentPlan,
          paymentFrequency: checkoutPlan.paymentFrequency,
          expectedSchedule: checkoutPlan.paymentPlan === 'biweekly' ? (() => {
            const biweeklyPlan = currentAuthData?.paymentPlans?.find((p: any) => p.id === 'biweekly');
            if (biweeklyPlan) {
              return {
                firstPaymentAmount: biweeklyPlan.amount,
                numberOfPayments: biweeklyPlan.numberOfPayments,
                snapshotGeneratedAt: currentAuthData?.snapshotGeneratedAt,
              };
            }
            return undefined;
          })() : undefined,
          parentEmail: user?.email,
          // Include membership fee - use authoritative amount or null if already paid
          membership: membershipPayload,
          // Use promo code from authoritative data if available, otherwise fall back to cart state
          promoCode: useAuthData ? currentAuthData.appliedPromoCode : (cart.appliedPromoCode?.code || null),
          // Volunteer credits to apply (in cents)
          creditsToApply: creditsToApply,
          // Optional trust signal — only present on payment-plan / frequency
          // toggles. The server verifies it against its in-memory snapshot
          // cache and falls back to strict validation on any mismatch.
          ...trustSignal,
        }),
      });

      // Handle 409 Conflict - server returned authoritative values
      if (response.status === 409) {
        const conflictData = await response.json();
        console.warn('⚠️ Payment validation conflict - server returned authoritative values:', conflictData);
        
        // Auto-retry once by using authoritative values from 409 response
        // Use ref to avoid stale closure - state updates are async and cause infinite loops
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          setRetryCount(retryCountRef.current); // Keep state in sync for UI
          console.log('🔄 Auto-retrying with authoritative data from server (attempt', retryCountRef.current, 'of', MAX_RETRIES, ')');
          
          toast({
            title: "Refreshing Cart",
            description: "Your cart has been updated with the latest prices. Retrying payment...",
          });
          
          // Use authoritative data from 409 response - server now provides full membership metadata
          if (conflictData.authoritative) {
            // Use the server's membershipAlreadyPaid flag directly if provided
            const membershipAlreadyPaid = conflictData.authoritative.membershipAlreadyPaid === true;
            
            // IMPORTANT: Preserve itemsTotal from snapshot if 409 response has zero/missing itemsTotal
            // This happens when MEMBERSHIP_AMOUNT_MISMATCH returns before items are validated
            const serverItemsTotal = conflictData.authoritative.itemsTotal;
            const preservedItemsTotal = (serverItemsTotal && serverItemsTotal > 0) 
              ? serverItemsTotal 
              : (authoritativeData?.itemsTotal || cart.total);
            
            // Use membership metadata from 409 response directly - server now provides full context
            setAuthoritativeData({
              itemsTotal: preservedItemsTotal,
              membershipAmount: conflictData.authoritative.membershipAmount || 0,
              membershipAlreadyPaid: membershipAlreadyPaid,
              // Use 409 response values directly - server now includes full metadata
              membershipRequired: conflictData.authoritative.membershipRequired ?? authoritativeData?.membershipRequired ?? false,
              membershipSchoolId: conflictData.authoritative.membershipSchoolId ?? authoritativeData?.membershipSchoolId ?? null,
              membershipSchoolName: conflictData.authoritative.membershipSchoolName ?? authoritativeData?.membershipSchoolName ?? 'School',
              membershipYear: conflictData.authoritative.membershipYear ?? authoritativeData?.membershipYear ?? new Date().getFullYear(),
              discounts: conflictData.authoritative.discounts || authoritativeData?.discounts || cart.discounts,
              schoolSettings: conflictData.authoritative.schoolSettings || authoritativeData?.schoolSettings || null,
              // Preserve existing promo code from authoritativeData
              appliedPromoCode: authoritativeData?.appliedPromoCode ?? (cart.appliedPromoCode?.code || null),
              // Preserve payable amount and payment plans from previous snapshot
              payableAmount: conflictData.authoritative.payableAmount ?? authoritativeData?.payableAmount ?? actualPayableAmount,
              paymentPlans: conflictData.authoritative.paymentPlans ?? authoritativeData?.paymentPlans ?? [],
              // Preserve free-enrollment flag from previous snapshot — a 409 conflict
              // doesn't re-derive it, so we conservatively fall back to the prior value.
              isFreeEnrollment: conflictData.authoritative.isFreeEnrollment ?? authoritativeData?.isFreeEnrollment ?? false,
              freeEnrollmentReason: conflictData.authoritative.freeEnrollmentReason ?? authoritativeData?.freeEnrollmentReason ?? null,
            });
            console.log('📝 Set authoritative data from 409:', {
              serverItemsTotal,
              preservedItemsTotal,
              membershipAmount: conflictData.authoritative.membershipAmount,
              membershipAlreadyPaid,
              membershipRequired: conflictData.authoritative.membershipRequired,
              membershipSchoolId: conflictData.authoritative.membershipSchoolId,
              grandTotal: conflictData.authoritative.grandTotal
            });
          }
          
          // Small delay to let state update
          await new Promise(resolve => setTimeout(resolve, 300));
          // Recursive retry with authoritative data now set
          return createPaymentIntent();
        } else {
          // Max retries exceeded - set conflict guard to prevent infinite loop
          // This flag prevents the initialization useEffect from re-triggering createPaymentIntent
          console.log('🚫 Max retries exceeded - setting checkout conflict guard');
          setHasCheckoutConflict(true);

          const serverTotal = conflictData.authoritative?.grandTotal ?? null;
          // Capture the client's intended total (what was shown to the parent
          // before the conflict surfaced) so the blocking screen can render
          // a clear before/after diff. cart.total is items only — add the
          // membership amount the client believed was due.
          const previousTotal =
            (typeof cart.total === 'number' ? cart.total : 0)
            + (membershipPayload?.amount || 0);
          const delta = (serverTotal !== null && previousTotal !== null)
            ? (serverTotal - previousTotal)
            : null;

          // Build a per-line-item diff so the blocking screen can show
          // exactly which class drifted, by how much, and for which child.
          // The server returns `itemPrices: [{ classId, variantId?, price }]`
          // — we join that against the client's cart items so the parent
          // can see "Soccer for Maya: was $120, now $135 (+$15)" instead
          // of just an opaque grand-total change.
          const serverItemPrices: Array<{ classId: number; variantId?: string; price: number }> =
            Array.isArray(conflictData.authoritative?.itemPrices)
              ? conflictData.authoritative.itemPrices
              : [];
          const lineDiffs = cart.items.map((item) => {
            const clientPrice = item.totalCost || item.price || 0;
            const serverLine = serverItemPrices.find(
              (sp) =>
                sp.classId === item.classId &&
                (sp.variantId ?? null) === (item.variantId ?? null),
            );
            const serverPrice = serverLine ? serverLine.price : clientPrice;
            return {
              classId: item.classId,
              variantId: item.variantId ?? null,
              className: item.className || `Class #${item.classId}`,
              childName: item.childName || '',
              clientPrice,
              serverPrice,
              delta: serverPrice - clientPrice,
            };
          });

          setPriceMismatchDetails({
            previousTotal,
            serverTotal,
            delta,
            lineDiffs,
          });
          setIsPriceMismatchError(true);
          setError(`Prices in your cart have been updated since you added them. The current total is ${serverTotal ? formatCurrency(serverTotal) : 'different'}.`);
          // NOTE: We deliberately do NOT raise a destructive toast here. The
          // full-screen "Prices Have Changed" block below (driven by
          // hasCheckoutConflict + isPriceMismatchError) is the user-facing
          // surface. The toast was redundant AND, because use-toast routes
          // destructive toasts through errorTracker into the admin inbox, it
          // generated a false-positive admin alert every time a parent
          // toggled their payment plan. Removing the toast fixes both.
          return;
        }
      }

      if (!response.ok) {
        const errorData = await response.json();
        const errorCode = errorData.error || '';
        // EXPLICIT allow-list of server error codes that should render the
        // "Prices Have Changed" recovery block. Switched away from a
        // substring check on errorData.message because that previously
        // caught any 409 whose message happened to contain "changed" /
        // "mismatch" / "cart prices" — including the biweekly-schedule
        // false-positive 409s tracked in #186 — and rendered the
        // blocking screen on benign drift. Anything not in this list
        // falls through to the generic-error path below.
        const isMismatchError = [
          'MEMBERSHIP_AMOUNT_MISMATCH',
          'TOTAL_MISMATCH_OVERPAYMENT',
          'UNIFIED_TOTAL_MISMATCH',
          'ZERO_SERVER_TOTAL_MISMATCH',
          'AMOUNT_MISMATCH',
          'PRICING_CHANGED',
        ].includes(errorCode);

        if (isMismatchError) {
          setIsPriceMismatchError(true);
          setError(errorData.message || 'Prices have changed. Please refresh your cart.');
          return;
        }
        throw new Error(errorData.message || 'Failed to create payment intent');
      }

      const data = await response.json();
      
      // Handle credit-only checkout (when credits fully cover the order)
      if (data.creditOnlyCheckout) {
        console.log('🎫 Credit-only checkout completed:', data);
        retryCountRef.current = 0;
        setRetryCount(0);
        
        // Clear the cart since credits have been consumed
        // Skip cancellation since enrollments are now pending_admin_approval (not pending_payment)
        clearCart(true);
        
        // Track purchase event for GA4
        trackBeginCheckout(
          cart.items.map(item => ({
            item_id: String(item.classId),
            item_name: item.className,
            price: item.price,
            quantity: 1,
            item_category: 'Class',
            item_variant: item.childName,
          })),
          cart.total
        );
        
        // Redirect to success page with credit-only flag (matches Stripe payment flow)
        // The success page will show appropriate messaging and handle cleanup
        const creditsApplied = data.creditsApplied || 0;
        setLocation(`/cart/success?creditOnly=true&creditsApplied=${creditsApplied}`);
        return;
      }
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        retryCountRef.current = 0; // Reset ref for future checkouts
        setRetryCount(0); // Reset retry count on success
        
        // Track begin_checkout event for GA4 only once per checkout session
        if (!hasTrackedBeginCheckout) {
          trackBeginCheckout(
            cart.items.map(item => ({
              item_id: String(item.classId),
              item_name: item.className,
              price: item.price,
              quantity: 1,
              item_category: 'Class',
              item_variant: item.childName,
            })),
            cart.total
          );
          setHasTrackedBeginCheckout(true);
        }
        
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
  
  // Handler for free enrollment requests (100% discount requiring admin approval)
  const handleFreeEnrollmentRequest = async () => {
    if (!user?.email) {
      toast({
        title: "Not Authenticated",
        description: "Please log in to request free enrollment.",
        variant: "destructive",
      });
      return;
    }

    // Defence-in-depth: refuse to submit a free-enrollment request unless the
    // server cart snapshot has authoritatively flagged this cart as free.
    // The server endpoint also re-derives this and rejects mismatches, but
    // gating client-side avoids round-trip and keeps the UI honest if anyone
    // else triggers this handler (e.g. via dev tools).
    if (!isFreeEnrollmentApproved) {
      toast({
        title: "Cannot Submit Free Enrollment",
        description:
          "We couldn't confirm your cart qualifies for free enrollment. Please refresh your cart balance and try again.",
        variant: "destructive",
      });
      return;
    }

    setRequestingFreeEnrollment(true);
    
    try {
      const response = await apiRequest(
        'POST',
        '/api/stripe/request-free-enrollment',
        {
          items: cart.items.map(item => ({
            ...item,
            price: item.price,
            totalCost: item.totalCost || item.price,
          })),
          subtotal: cart.subtotal,
          discounts: {
            siblingDiscount: cart.discounts.siblingDiscount,
            freeAfterThree: cart.discounts.freeAfterThree,
            appliedDiscounts: cart.discounts.appliedDiscounts || [],
            totalDiscountAmount: cart.discounts.totalDiscountAmount || 0
          },
          total: cart.total,
          parentEmail: user.email,
          // Use promo code from authoritative data if available (avoids stale closure)
          promoCode: authoritativeData?.appliedPromoCode ?? (cart.appliedPromoCode?.code || null),
        }
      );
      
      // apiRequest already returns parsed JSON, so use response directly
      const data = response as any;
      
      if (data.success) {
        setFreeEnrollmentRequested(true);
        
        // Clear the cart after successful request
        // Skip cancellation since enrollments are now pending_admin_approval
        await clearCart(true);
        
        toast({
          title: "Enrollment Request Submitted",
          description: "Your free enrollment request has been submitted for admin approval. You will be notified once it's reviewed.",
        });
      } else {
        throw new Error(data.error || 'Failed to submit free enrollment request');
      }
    } catch (error: any) {
      console.error('Error requesting free enrollment:', error);
      toast({
        title: "Request Failed",
        description: error.message || "There was an error submitting your free enrollment request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRequestingFreeEnrollment(false);
    }
  };

  const hasDiscounts = cart.discounts.siblingDiscount > 0 || 
                    cart.discounts.freeAfterThree > 0 || 
                    (cart.discounts.appliedDiscounts && cart.discounts.appliedDiscounts.length > 0);

  const getPaymentPlanOptions = () => {
    // Use server-provided payment plans when available (authoritative pricing)
    // This ensures payment plans correctly reflect applied credits
    if (authoritativeData?.paymentPlans && authoritativeData.paymentPlans.length > 0) {
      // Map server plans to client format with additional UI properties
      // CRITICAL: Include numberOfPayments from server to ensure correct payment count display
      return authoritativeData.paymentPlans
        .filter(plan => plan.id !== 'deposit')
        .map(plan => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        amount: plan.amount,
        popular: plan.id === 'full',
        features: plan.features,
        dueDate: undefined,
        installments: plan.id === 'biweekly' ? { frequency: 'biweekly' } : undefined,
        // Server-authoritative payment count - ensures display matches actual schedule
        numberOfPayments: plan.numberOfPayments,
        totalAmount: plan.totalAmount,
        finalPaymentAmount: plan.finalPaymentAmount
      }));
    }

    // Fallback to client calculation if no server data (should rarely happen)
    // Use payable amount from authoritative data if available, otherwise calculate from cart
    const totalAmount = authoritativeData?.payableAmount ?? actualPayableAmount;
    
    const fullAmount = totalAmount;
    const biweeklyAmount = Math.round(totalAmount / 4); // Estimated 4 payments
    
    return [
      {
        id: 'full',
        name: 'Pay in Full',
        description: 'Complete payment now',
        amount: fullAmount,
        popular: true,
        features: [
          'No additional fees',
          'No future payment worries',
          'Priority class placement',
          'Full refund if cancelled 30 days before'
        ]
      },
      {
        id: 'biweekly',
        name: 'Biweekly Payment Plan',
        description: 'Automatic payments every 2 weeks; last payment at least 2 weeks before your latest class ends',
        amount: biweeklyAmount,
        numberOfPayments: 4, // Fallback estimate - server will provide actual count
        features: [
          'Pay every 2 weeks based on class schedule',
          'Payments end at least two weeks before the latest class end date in your cart',
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
    // Use server-provided payable amount when available
    const payableAmount = authoritativeData?.payableAmount ?? actualPayableAmount;
    
    // For biweekly plans, send the FULL payable amount to backend
    // The backend will calculate the payment schedule and divide it properly
    if (selectedPaymentPlan === 'biweekly') {
      return payableAmount;
    }
    
    // For other plans, return the calculated plan amount (already includes membership via payableAmount)
    const plans = getPaymentPlanOptions();
    const selectedPlan = plans.find(plan => plan.id === selectedPaymentPlan);
    return selectedPlan ? selectedPlan.amount : payableAmount;
  };

  // Get the amount to display on the Pay button (first payment amount)
  const getButtonDisplayAmount = () => {
    // For biweekly plans, use server-provided first payment amount from payment plans
    // This ensures button matches the displayed plan amount (server-authoritative)
    if (selectedPaymentPlan === 'biweekly') {
      const biweeklyPlan = authoritativeData?.paymentPlans?.find(p => p.id === 'biweekly');
      if (biweeklyPlan?.amount) {
        return biweeklyPlan.amount;
      }
      // Fallback only if server data not available
      const payableAmount = authoritativeData?.payableAmount ?? actualPayableAmount;
      return Math.ceil(payableAmount / 4);
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
    const handleRefreshCart = async () => {
      setError('');
      setIsPriceMismatchError(false);
      setPriceMismatchDetails(null);
      setHasCheckoutConflict(false);
      setClientSecret('');
      // Drop the trusted snapshot — refreshing the cart will produce a new one.
      setSnapshotId(null);
      setLoading(true);
      retryCountRef.current = 0;
      setRetryCount(0);
      await refreshCart();
      toast({
        title: "Cart Refreshed",
        description: "Your cart has been updated with the latest prices. Preparing checkout...",
      });
    };

    return (
      <ParentAppShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className={`text-center flex items-center justify-center gap-2 ${isPriceMismatchError ? 'text-amber-600' : 'text-red-500'}`}>
                {isPriceMismatchError ? (
                  <>
                    <RefreshCw className="h-5 w-5" />
                    Prices Have Changed
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5" />
                    Checkout Error
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-muted-foreground">{error}</p>
              {isPriceMismatchError && priceMismatchDetails && priceMismatchDetails.previousTotal !== null && priceMismatchDetails.serverTotal !== null && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="price-mismatch-details">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Previous total</span>
                    <span className="font-medium line-through">{formatCurrency(priceMismatchDetails.previousTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">New total</span>
                    <span className="font-semibold">{formatCurrency(priceMismatchDetails.serverTotal)}</span>
                  </div>
                  {priceMismatchDetails.delta !== null && priceMismatchDetails.delta !== 0 && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
                      <span className="text-muted-foreground">Difference</span>
                      <span
                        className={`font-medium ${priceMismatchDetails.delta > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                        data-testid="price-mismatch-delta"
                      >
                        {priceMismatchDetails.delta > 0 ? '+' : ''}{formatCurrency(priceMismatchDetails.delta)}
                      </span>
                    </div>
                  )}
                  {priceMismatchDetails.lineDiffs.some((line) => line.delta !== 0) && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        What changed
                      </div>
                      <ul className="space-y-2" data-testid="price-mismatch-line-diffs">
                        {priceMismatchDetails.lineDiffs
                          .filter((line) => line.delta !== 0)
                          .map((line) => (
                            <li
                              key={`${line.classId}-${line.variantId ?? 'no-variant'}-${line.childName}`}
                              className="flex items-start justify-between gap-3"
                              data-testid={`price-mismatch-line-${line.classId}`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{line.className}</div>
                                {line.childName && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    for {line.childName}
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs">
                                  <span className="line-through text-muted-foreground">
                                    {formatCurrency(line.clientPrice)}
                                  </span>
                                  <span className="mx-1 text-muted-foreground">→</span>
                                  <span className="font-semibold">
                                    {formatCurrency(line.serverPrice)}
                                  </span>
                                </div>
                                <div
                                  className={`text-xs font-medium ${line.delta > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                                >
                                  {line.delta > 0 ? '+' : ''}{formatCurrency(line.delta)}
                                </div>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {isPriceMismatchError && (
                <p className="text-center text-sm text-muted-foreground">
                  This can happen when class prices are updated or promotions change.
                  Refresh your cart to see the current prices and continue checkout.
                </p>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              {isPriceMismatchError ? (
                <>
                  <Button 
                    onClick={handleRefreshCart}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Cart & Continue
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setLocation('/cart')}
                    className="w-full"
                  >
                    Review Cart
                  </Button>
                </>
              ) : (
                <Button onClick={() => setLocation('/payments')} className="w-full">
                  Return to Payments
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </ParentAppShell>
    );
  }

  // Only show loading spinner if we actually need a clientSecret for payment
  // If actualPayableAmount is $0, we don't need a clientSecret - show Free Enrollment flow
  if (!clientSecret && actualPayableAmount > 0) {
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
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => setLocation('/parent/home')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
          <p className="text-muted-foreground">
            Complete your enrollment for {cart.items.length} class{cart.items.length !== 1 ? 'es' : ''}
          </p>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">Cart</span>
            </div>
            <div className="h-px flex-1 bg-primary max-w-8" />
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">2</div>
              <span className="text-sm font-medium">Review & Pay</span>
            </div>
            <div className="h-px flex-1 bg-border max-w-8" />
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">3</div>
              <span className="text-sm text-muted-foreground">Confirmation</span>
            </div>
          </div>
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
                        <p className="text-xs text-muted-foreground mt-1">{formatClassSchedule(item.schedule)}</p>
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

                {/* Membership Fee — use server snapshot when cart.membership was cleared (e.g. refreshDiscounts) */}
                {membershipForOrderSummary && (
                  <div className="flex justify-between items-start p-3 border rounded-lg border-primary/20 bg-primary/5" data-testid="checkout-membership-fee">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" />
                        Annual Membership
                      </h4>
                      <p className="text-xs text-muted-foreground">{membershipForOrderSummary.schoolName}</p>
                      <Badge variant="secondary" className="text-xs bg-primary/10 text-primary mt-1">
                        {membershipForOrderSummary.year} Membership
                      </Badge>
                    </div>
                    <div className="text-sm font-medium">
                      {formatCurrency(membershipForOrderSummary.amount)}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  {cart.items.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Class Enrollments:</span>
                      <span>{formatCurrency(cart.subtotal)}</span>
                    </div>
                  )}

                  {membershipForOrderSummary && (
                    <div className="flex justify-between text-sm" data-testid="checkout-summary-membership">
                      <span className="flex items-center gap-1">
                        <Award className="h-3 w-3 text-primary" />
                        Membership Fee:
                      </span>
                      <span>{formatCurrency(membershipForOrderSummary.amount)}</span>
                    </div>
                  )}

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

                  {creditsToApply > 0 && (
                    <div className="flex justify-between text-sm text-amber-600">
                      <span className="flex items-center gap-1">
                        <Award className="h-3 w-3" />
                        Credits:
                      </span>
                      <span>-{formatCurrency(creditsToApply)}</span>
                    </div>
                  )}

                  <Separator />
                  <div className="flex justify-between font-medium text-lg">
                    <span>Total:</span>
                    <span>{formatCurrency(Math.max(0, actualPayableAmount - creditsToApply))}</span>
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
                          const appliedCode = promoCode; // Capture before clearing
                          setPromoCode('');
                          // Refresh cart snapshot with the newly applied promo code
                          // Pass explicitly to avoid stale closure issue (React state is async)
                          try {
                            await fetchCartSnapshot(appliedCode);
                          } catch (e: any) {
                            setPromoError(e?.message || 'Could not refresh pricing after applying this code.');
                          }
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
                      onClick={async () => {
                        removePromoCode();
                        // Refresh cart snapshot to update totals without promo discount
                        // Pass null explicitly since state won't be updated yet
                        try {
                          await fetchCartSnapshot(null);
                        } catch (e: any) {
                          toast({
                            title: 'Could not refresh pricing',
                            description: e?.message || 'Try refreshing the page.',
                            variant: 'destructive',
                          });
                        }
                      }}
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

            {/* Credits */}
            {availableCredits > 0 && (
              <Card data-testid="card-credits">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Award className="h-4 w-4 text-amber-500" />
                    Credits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Available Balance</p>
                      <p className="text-lg font-bold text-amber-600">{formatCurrency(availableCredits)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="apply-credits" className="text-sm cursor-pointer">
                        Apply to order
                      </Label>
                      <input
                        type="checkbox"
                        id="apply-credits"
                        checked={applyCredits}
                        onChange={(e) => setApplyCredits(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        data-testid="checkbox-apply-credits"
                      />
                    </div>
                  </div>
                  {applyCredits && creditsToApply > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-amber-600" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">Credits Applied</p>
                          <p className="text-xs text-amber-600" data-testid="text-credits-saving">
                            Saving {formatCurrency(creditsToApply)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>

          {/* Payment Form */}
          <div className="space-y-6">
            {/* Payment Plan Selection - only show when there's a balance to pay (including membership) */}
            {actualPayableAmount > 0 && (
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
                <RadioGroup value={selectedPaymentPlan} onValueChange={handlePaymentPlanChange}>
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
                                {plan.id === 'biweekly' &&
                                typeof (plan as any).numberOfPayments === 'number' &&
                                (plan as any).numberOfPayments > 1 ? (
                                  <div className="space-y-0.5">
                                    <div className="text-sm font-medium text-muted-foreground">
                                      First payment
                                    </div>
                                    <div>{formatCurrency(plan.amount)}</div>
                                    <div className="text-xs font-normal text-muted-foreground">
                                      × {(plan as any).numberOfPayments} payments
                                    </div>
                                  </div>
                                ) : (
                                  formatCurrency(plan.amount)
                                )}
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
                      {(() => {
                        const payableAmount = authoritativeData?.payableAmount ?? actualPayableAmount;
                        const selectedPlan = getPaymentPlanOptions().find(p => p.id === selectedPaymentPlan);
                        
                        if (selectedPaymentPlan === 'biweekly') {
                          // Use server-provided numberOfPayments if available, otherwise fallback to 4
                          const numPayments = (selectedPlan as any)?.numberOfPayments || 4;
                          return (
                            <>
                              <div className="text-xs text-blue-600 mb-1">
                                Total: {formatCurrency(payableAmount)}
                              </div>
                              <div className="text-lg font-bold text-blue-900">
                                {formatCurrency(selectedPlan?.amount || Math.ceil(payableAmount / numPayments))} × {numPayments} payments
                              </div>
                            </>
                          );
                        }
                        
                        return (
                          <>
                            <div className="text-lg font-bold text-blue-900">
                              {formatCurrency(getSelectedPlanAmount())}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}


            {/* Stripe Subscription Alert - only show when school has enabled subscription status display */}
            {actualPayableAmount > 0 && cart.schoolSettings?.showSubscriptionStatus && hasActiveSubscription && subscriptionInfo && (
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


            {/* Payment Information or Free Enrollment */}
            {/* Gate the Free Enrollment UI on the authoritative server flag (isFreeEnrollmentApproved),
                NOT on actualPayableAmount === 0 alone. The latter can be true for a stale Stripe-managed
                cart where the parent actually owes money — in that case we show a recovery card. */}
            {cartLooksFreeButUnverified ? (
              <Card data-testid="card-free-enrollment-unverified">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    We couldn't confirm a $0 total
                  </CardTitle>
                  <CardDescription>
                    Your cart shows $0 due, but we couldn't verify this qualifies as a free enrollment.
                    This usually happens when an enrollment's balance is out of date.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700">
                      Please refresh your cart so we can recalculate the amount you owe.
                      If the issue persists, contact your school administrator.
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={() => {
                      setAuthoritativeData(null);
                      setClientSecret('');
                      setHasCheckoutConflict(false);
                      retryCountRef.current = 0;
                      setRetryCount(0);
                      refreshCart?.();
                    }}
                    className="w-full"
                    data-testid="button-refresh-cart-balance"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Cart Balance
                  </Button>
                </CardContent>
              </Card>
            ) : isFreeEnrollmentApproved ? (
              // Free Enrollment UI — only when server snapshot has explicitly set isFreeEnrollment=true
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-green-600" />
                    Free Enrollment
                  </CardTitle>
                  <CardDescription>
                    Your enrollment qualifies for a full discount - no payment required
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {freeEnrollmentRequested ? (
                    // Success state after request is submitted
                    <div className="text-center py-8 space-y-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-green-800">
                          Enrollment Request Submitted!
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2">
                          Your free enrollment request has been submitted for approval.
                          A school administrator will review your request and you will be
                          notified once it's approved.
                        </p>
                      </div>
                      <Alert className="border-blue-200 bg-blue-50 text-left">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-700">
                          <strong>What happens next?</strong>
                          <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>A school administrator will review your request</li>
                            <li>You'll receive a notification when approved</li>
                            <li>Once approved, enrollment will be active immediately</li>
                          </ul>
                        </AlertDescription>
                      </Alert>
                      <Button
                        onClick={() => setLocation('/parent-dashboard')}
                        className="mt-4"
                        data-testid="button-go-to-dashboard"
                      >
                        Go to Dashboard
                      </Button>
                    </div>
                  ) : (
                    // Request form
                    <div className="space-y-6">
                      <Alert className="border-amber-200 bg-amber-50">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-700">
                          <strong>Admin Approval Required</strong>
                          <p className="mt-1">
                            Free enrollments require approval from a school administrator.
                            Your request will be reviewed and you'll be notified of the decision.
                          </p>
                        </AlertDescription>
                      </Alert>
                      
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-green-900">Total Amount</div>
                            <div className="text-sm text-green-700">
                              {cart.items.length} enrollment{cart.items.length > 1 ? 's' : ''} with full discount applied
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-green-900">
                              FREE
                            </div>
                            {cart.subtotal > 0 && (
                              <div className="text-sm text-green-600 line-through">
                                {formatCurrency(cart.subtotal)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        onClick={handleFreeEnrollmentRequest}
                        disabled={requestingFreeEnrollment || cart.items.length === 0}
                        className="w-full bg-green-600 hover:bg-green-700"
                        size="lg"
                        data-testid="button-request-free-enrollment"
                      >
                        {requestingFreeEnrollment ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting Request...
                          </>
                        ) : (
                          <>
                            <Gift className="mr-2 h-4 w-4" />
                            Request Free Enrollment
                          </>
                        )}
                      </Button>
                      
                      <p className="text-xs text-muted-foreground text-center">
                        By submitting this request, you agree to our terms of service.
                        Enrollment will be confirmed after admin approval.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              // Regular payment form
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
                <CardContent className="space-y-4">
                  {mustSignAgreement && (
                    <Alert variant="destructive" data-testid="checkout-agreement-required">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="space-y-2">
                        <p>
                          You must review and sign the school membership agreement before paying
                          {membershipForOrderSummary
                            ? ` (includes ${formatCurrency(membershipForOrderSummary.amount)} annual membership).`
                            : '.'}
                        </p>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/membership-agreement?schoolId=${agreementSchoolId}&return=${encodeURIComponent('/cart/checkout')}`}
                          >
                            Review & sign agreement
                          </Link>
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  {!stripeReady ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Initializing payment system...</span>
                    </div>
                  ) : stripeError ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {stripeError}
                      </AlertDescription>
                    </Alert>
                  ) : loading && !clientSecret ? (
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
                  ) : clientSecret && stripeInstance ? (
                    <Elements key={clientSecret} stripe={stripeInstance} options={{ clientSecret }}>
                      <CheckoutForm
                        selectedPaymentPlan={selectedPaymentPlan}
                        selectedPlanAmount={getButtonDisplayAmount()}
                        autoPayEnabled={autoPayEnabled}
                        hasPaymentMethod={hasPaymentMethod}
                        togglingAutoPay={togglingAutoPay}
                        toggleAutoPay={toggleAutoPay}
                        checkoutBlocked={mustSignAgreement || agreementStatusLoading}
                        checkoutBlockedReason={
                          agreementStatusLoading
                            ? 'Checking membership agreement status…'
                            : 'Please sign the membership agreement before completing payment.'
                        }
                      />
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
            )}
          </div>
        </div>
      </div>
    </ParentAppShell>
  );
}