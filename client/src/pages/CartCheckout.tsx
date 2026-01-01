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
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiRequest } from '@/lib/queryClient';
import { ShoppingCart, CreditCard, Percent, Gift, AlertCircle, Check, Loader2, Calendar, DollarSign, Clock, CheckCircle2, Award } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { formatCurrency } from '@/utils/currency';
import { stripePromise } from '@/config/stripe';
import type { Stripe } from '@stripe/stripe-js';
import { trackBeginCheckout, trackAddPaymentInfo } from '@/lib/analytics';

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
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || !elementsReady || processing || (cart.items.length === 0 && !cart.membership)}
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
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState<string>('full');
  const [paymentFrequency, setPaymentFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'one_time'>('one_time');
  
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
  const MAX_RETRIES = 1; // Only auto-retry once on 409
  
  // Checkout conflict guard - prevents infinite loop when 409 errors occur
  // When true, the initialization useEffect will not re-trigger createPaymentIntent
  const [hasCheckoutConflict, setHasCheckoutConflict] = useState(false);

  // Calculate the ACTUAL total payable amount (class total + membership)
  // This is used to determine if we should show the payment form or free enrollment flow
  const actualPayableAmount = cart.total + (cart.membership?.amount || 0);
  
  // Debug cart data
  console.log('🛒 CartCheckout - cart data:', {
    itemsCount: cart.items.length,
    items: cart.items,
    subtotal: cart.subtotal,
    discounts: cart.discounts,
    total: cart.total,
    membershipAmount: cart.membership?.amount || 0,
    actualPayableAmount
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

  useEffect(() => {
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

    // If cart has items OR membership after hydration, proceed
    const hasCartContent = cart.items.length > 0 || cart.membership;
    if (hasCartContent) {
      // Calculate actual payable amount (class total + membership)
      const payableAmount = cart.total + (cart.membership?.amount || 0);
      
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
        console.log('🛒 Creating initial payment intent with', cart.items.length, 'items and membership:', !!cart.membership);
        // Fetch cart snapshot first to get authoritative pricing, then create payment intent
        const initializeCheckout = async () => {
          await fetchCartSnapshot();
          createPaymentIntent();
        };
        initializeCheckout();
      }
    } else {
      // Cart is hydrated, not loading, and empty - redirect to programs
      console.log('🛒 Cart hydrated, not loading, and empty - redirecting to programs');
      setLocation('/programs');
    }
  }, [isAuthenticated, cartHydrated, cartLoading, cart.items.length, cart.membership, cart.total, hasCheckoutConflict]); // Re-run when cart or loading status changes
  
  // Separate effect to handle discount changes - recreate payment intent when cart total changes
  useEffect(() => {
    // Check if cart has any content (items OR membership)
    const hasCartContent = cart.items.length > 0 || cart.membership;
    
    // Don't recreate if we haven't created the initial payment intent yet or no cart content
    // Also don't recreate if we have a checkout conflict (prevents infinite loop)
    if (!clientSecret || !isAuthenticated || !hasCartContent || isInitialLoad || hasCheckoutConflict) {
      return;
    }
    
    // Calculate actual payable amount (class total + membership)
    const payableAmount = cart.total + (cart.membership?.amount || 0);
    
    // If total payable becomes $0, clear clientSecret to show Free Enrollment flow
    if (payableAmount === 0) {
      console.log('💳 Total payable is $0 - clearing clientSecret for Free Enrollment flow');
      setClientSecret('');
      setLoading(false);
      return;
    }
    
    // When cart total changes (e.g., discount applied), recreate payment intent
    console.log('💳 Cart total changed, recreating payment intent with new amount:', cart.total);
    setClientSecret(''); // Clear to show loading state
    createPaymentIntent();
  }, [cart.total]); // Re-run when cart total changes
  
  // Separate effect to handle payment plan changes with debouncing
  useEffect(() => {
    // Check if cart has any content (items OR membership)
    const hasCartContent = cart.items.length > 0 || cart.membership;
    
    // Don't recreate if we haven't created the initial payment intent yet or no cart content
    // Also don't recreate if we have a checkout conflict (prevents infinite loop)
    if (!clientSecret || !isAuthenticated || !hasCartContent || isInitialLoad || hasCheckoutConflict) {
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

  // Effect to recreate payment intent and refresh snapshot when credits are toggled
  useEffect(() => {
    const hasCartContent = cart.items.length > 0 || cart.membership;
    
    // Also don't recreate if we have a checkout conflict (prevents infinite loop)
    if (!clientSecret || !isAuthenticated || !hasCartContent || isInitialLoad || hasCheckoutConflict) {
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      console.log('💳 Credits changed, refreshing snapshot and payment intent with creditsToApply:', creditsToApply);
      // First refresh snapshot to get updated payment plans
      await fetchCartSnapshot(undefined, creditsToApply);
      // Then recreate payment intent
      setClientSecret('');
      createPaymentIntent();
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [creditsToApply]);

  // Payment plan option from server
  interface PaymentPlanOption {
    id: string;
    name: string;
    description: string;
    amount: number;
    features: string[];
  }

  // Cached authoritative values from server snapshot
  // These override client values when creating payment intent
  const [authoritativeData, setAuthoritativeData] = useState<{
    itemsTotal: number;
    membershipAmount: number;
    membershipAlreadyPaid: boolean;
    membershipRequired: boolean;
    membershipSchoolId: number | null;
    membershipSchoolName: string;
    membershipYear: number;
    discounts: any;
    schoolSettings: any;
    appliedPromoCode: string | null; // Store promo code to avoid stale closure issues
    payableAmount: number; // Grand total minus applied credits
    paymentPlans: PaymentPlanOption[]; // Server-calculated payment plans
  } | null>(null);

  // Fetch cart snapshot from server to get authoritative pricing
  // IMPORTANT: promoCodeOverride parameter is used to pass fresh promo code
  // when called immediately after applyPromoCode (before React state updates)
  const fetchCartSnapshot = async (promoCodeOverride?: string | null, creditsOverride?: number): Promise<boolean> => {
    if (cart.items.length === 0) return true; // No items to sync
    
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
            variantId: item.variantId
          })),
          appliedPromoCode: promoCode,
          creditsToApply: creditsAmount
        }
      );

      const snapshot = await response.json();
      
      if (snapshot.snapshotId) {
        setSnapshotId(snapshot.snapshotId);
        console.log('📸 Cart snapshot received:', {
          snapshotId: snapshot.snapshotId,
          serverTotal: snapshot.totals.grandTotal,
          clientTotal: cart.total + (cart.membership?.amount || 0),
          membershipRequired: snapshot.membership.required,
          membershipAmount: snapshot.membership.discountedAmount,
          membershipAlreadyPaid: snapshot.membership.alreadyPaid,
          availableCredits: snapshot.credits.available
        });
        
        // Store authoritative data for payment intent creation
        // Include membershipRequired and school info so we can construct payload even when cart.membership is null
        // Also store the promo code to avoid stale closure issues when createPaymentIntent runs
        setAuthoritativeData({
          itemsTotal: snapshot.totals.itemsTotal,
          membershipAmount: snapshot.membership.alreadyPaid ? 0 : snapshot.membership.discountedAmount,
          membershipAlreadyPaid: snapshot.membership.alreadyPaid,
          membershipRequired: snapshot.membership.required,
          membershipSchoolId: snapshot.membership.schoolId || null,
          membershipSchoolName: snapshot.membership.schoolName || 'School',
          membershipYear: snapshot.membership.year || new Date().getFullYear(),
          discounts: snapshot.pricing.discounts,
          schoolSettings: snapshot.pricing.schoolSettings,
          appliedPromoCode: promoCode, // Store the promo code used for this snapshot
          payableAmount: snapshot.totals.payableAmount,
          paymentPlans: snapshot.paymentPlans || []
        });
        
        // Update available credits from snapshot
        setAvailableCredits(snapshot.credits.available);
        
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn('⚠️ Failed to fetch cart snapshot (will proceed with client values):', err);
      return true; // Graceful degradation - proceed anyway
    } finally {
      setSnapshotLoading(false);
    }
  };

  const createPaymentIntent = async () => {
    try {
      setLoading(true);
      
      // Get the amount to charge based on selected payment plan
      const selectedPlanAmount = getSelectedPlanAmount();
      // selectedPlanAmount is already in cents, no need to multiply by 100
      
      // Use authoritative data from snapshot if available, otherwise use client cart values
      const useAuthData = authoritativeData !== null;
      const itemsTotal = useAuthData ? authoritativeData.itemsTotal : cart.total;
      const membershipAmount = useAuthData 
        ? authoritativeData.membershipAmount 
        : (cart.membership?.amount || 0);
      const membershipAlreadyPaid = useAuthData ? authoritativeData.membershipAlreadyPaid : false;
      const discounts = useAuthData 
        ? authoritativeData.discounts 
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
        } else if (authoritativeData.membershipRequired && authoritativeData.membershipSchoolId) {
          // Membership required and not paid - ALWAYS send payload using authoritative data
          // This handles the case where cart.membership is null (discounted to $0 on load)
          // We use authoritative values because cart.membership may be stale or missing
          membershipPayload = {
            schoolId: authoritativeData.membershipSchoolId,
            schoolName: authoritativeData.membershipSchoolName || cart.membership?.schoolName || 'School',
            amount: membershipAmount, // Use authoritative amount (may be 0 for discounted)
            year: authoritativeData.membershipYear,
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
      
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
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
          paymentPlan: selectedPaymentPlan, // Include payment plan info
          paymentFrequency: paymentFrequency, // Include payment frequency for date-based scheduling
          parentEmail: user?.email,
          // Include membership fee - use authoritative amount or null if already paid
          membership: membershipPayload,
          // Use promo code from authoritative data if available, otherwise fall back to cart state
          promoCode: useAuthData ? authoritativeData.appliedPromoCode : (cart.appliedPromoCode?.code || null),
          // Volunteer credits to apply (in cents)
          creditsToApply: creditsToApply,
        })
      });

      // Handle 409 Conflict - server returned authoritative values
      if (response.status === 409) {
        const conflictData = await response.json();
        console.warn('⚠️ Payment validation conflict - server returned authoritative values:', conflictData);
        
        // Auto-retry once by using authoritative values from 409 response
        if (retryCount < MAX_RETRIES) {
          setRetryCount(prev => prev + 1);
          console.log('🔄 Auto-retrying with authoritative data from server (attempt', retryCount + 1, 'of', MAX_RETRIES, ')');
          
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
              paymentPlans: conflictData.authoritative.paymentPlans ?? authoritativeData?.paymentPlans ?? []
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
          
          const serverTotal = conflictData.authoritative?.grandTotal;
          setError(`Cart prices have changed. Server total: ${serverTotal ? formatCurrency(serverTotal) : 'unknown'}. Please refresh the page and try again.`);
          toast({
            title: "Cart Updated",
            description: "Your cart prices have changed. Please refresh the page to continue.",
            variant: "destructive",
          });
          return;
        }
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create payment intent');
      }

      const data = await response.json();
      
      // Handle credit-only checkout (when credits fully cover the order)
      if (data.creditOnlyCheckout) {
        console.log('🎫 Credit-only checkout completed:', data);
        setRetryCount(0);
        
        // Clear the cart since credits have been consumed
        clearCart();
        
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
        
        // Show success message and redirect
        toast({
          title: "Enrollment Submitted",
          description: data.message || "Your enrollment has been submitted for admin approval. Your credits have been applied.",
        });
        
        // Redirect to success/enrollments page
        setLocation('/parent/programs/enrollments');
        return;
      }
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
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
        await clearCart();
        
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

  const getUniqueChildrenCount = () => {
    const uniqueChildren = new Set(cart.items.map(item => item.childId));
    return uniqueChildren.size;
  };

  const hasDiscounts = cart.discounts.siblingDiscount > 0 || 
                    cart.discounts.freeAfterThree > 0 || 
                    (cart.discounts.appliedDiscounts && cart.discounts.appliedDiscounts.length > 0);

  const getPaymentPlanOptions = () => {
    // Use server-provided payment plans when available (authoritative pricing)
    // This ensures payment plans correctly reflect applied credits
    if (authoritativeData?.paymentPlans && authoritativeData.paymentPlans.length > 0) {
      // Map server plans to client format with additional UI properties
      return authoritativeData.paymentPlans.map(plan => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        amount: plan.amount,
        popular: plan.id === 'deposit',
        features: plan.features,
        dueDate: plan.id === 'deposit' ? 'Remaining balance due 2 weeks before class start' : undefined,
        installments: plan.id === 'biweekly' ? { frequency: 'biweekly' } : undefined
      }));
    }

    // Fallback to client calculation if no server data (should rarely happen)
    // Use payable amount from authoritative data if available, otherwise calculate from cart
    const totalAmount = authoritativeData?.payableAmount ?? actualPayableAmount;
    
    const depositAmount = Math.round(totalAmount * 0.1); // 10% deposit
    const fullAmount = totalAmount;
    const biweeklyAmount = Math.round(totalAmount / 4); // Estimated 4 payments
    
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
        id: 'biweekly',
        name: 'Biweekly Payment Plan',
        description: 'Automatic payments every 2 weeks until class ends',
        amount: biweeklyAmount,
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
    // Use server-provided payable amount when available
    const payableAmount = authoritativeData?.payableAmount ?? actualPayableAmount;
    
    // For biweekly plans, show the FIRST payment amount (total divided by 4)
    if (selectedPaymentPlan === 'biweekly') {
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

                {/* Membership Fee */}
                {cart.membership && (
                  <div className="flex justify-between items-start p-3 border rounded-lg border-primary/20 bg-primary/5" data-testid="checkout-membership-fee">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" />
                        Annual Membership
                      </h4>
                      <p className="text-xs text-muted-foreground">{cart.membership.schoolName}</p>
                      <Badge variant="secondary" className="text-xs bg-primary/10 text-primary mt-1">
                        {cart.membership.year} Membership
                      </Badge>
                    </div>
                    <div className="text-sm font-medium">
                      {formatCurrency(cart.membership.amount)}
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

                  {cart.membership && (
                    <div className="flex justify-between text-sm" data-testid="checkout-summary-membership">
                      <span className="flex items-center gap-1">
                        <Award className="h-3 w-3 text-primary" />
                        Membership Fee:
                      </span>
                      <span>{formatCurrency(cart.membership.amount)}</span>
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
                    <span>{formatCurrency(Math.max(0, cart.total + (cart.membership?.amount || 0) - creditsToApply))}</span>
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
                          await fetchCartSnapshot(appliedCode);
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
                        await fetchCartSnapshot(null);
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
                          <p className="text-xs text-amber-600">
                            Saving {formatCurrency(creditsToApply)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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
                            Total: {formatCurrency(actualPayableAmount)}
                          </div>
                          <div className="text-lg font-bold text-blue-900">
                            {formatCurrency(Math.ceil(actualPayableAmount / 4))} × 4 payments
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-bold text-blue-900">
                            {formatCurrency(getSelectedPlanAmount())}
                          </div>
                          {selectedPaymentPlan === 'deposit' && (
                            <div className="text-xs text-blue-600">
                              Remaining: {formatCurrency(actualPayableAmount - getSelectedPlanAmount())}
                            </div>
                          )}
                        </>
                      )}
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
            {/* Use actualPayableAmount (class total + membership) to determine if payment is needed */}
            {actualPayableAmount === 0 ? (
              // Free Enrollment UI - when 100% discount is applied and no membership fee
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
                <CardContent>
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
            )}
          </div>
        </div>
      </div>
    </ParentAppShell>
  );
}