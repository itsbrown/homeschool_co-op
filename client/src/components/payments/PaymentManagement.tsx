import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { handleChargeAmountDivergence } from "./handleChargeAmountDivergence";
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/config/stripe';
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CreditCard, DollarSign, Calendar, Check, Clock, FileText, Search, ChevronDown, Award, Coins, Users, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  getEnrollmentEffectiveBalance,
  getMembershipOutstandingBalance,
  computeManualPayDisplay,
} from "@/utils/parentBalance";
import {
  useUnpaidEnrollments,
  usePayOutstanding,
  type UnpaidEnrollment,
} from "@/hooks/useUnpaidEnrollments";

interface Payment {
  id: string;
  date: string;
  amount: number;
  description: string;
  status: 'paid' | 'succeeded' | 'completed' | 'pending' | 'failed' | 'refunded' | 'canceled';
  method: string;
  programName: string;
  childName: string;
  receiptUrl?: string;
  dueDate?: string;
  metadata?: {
    creditsApplied?: number;
    creditAllocation?: {
      enrollmentCredits: number;
      membershipCredits: number;
    };
    creditOnlyCheckout?: boolean;
    [key: string]: any;
  };
  subtotalAmount?: number;
  discountTotal?: number;
  discountSnapshot?: {
    subtotal: number;
    discountTotal: number;
    appliedDiscounts: Array<{
      source: 'promo' | 'sibling' | 'free_after_threshold' | 'automatic' | 'bundle';
      discountId?: number;
      code?: string;
      name: string;
      type: string;
      value: number;
      amount: number;
    }>;
  };
}

interface PaymentManagementProps {
  childId?: string; // Optional child ID to filter payments for a specific child
  defaultTab?: string; // Optional default tab to open
}

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
}

// Minimal API response shapes for typed `select` transforms below.
interface PaymentHistoryResponse {
  success: boolean;
  payments: Payment[];
}

interface ParentEnrollmentsResponse {
  enrollments?: unknown[];
}

interface ScheduledPaymentApi {
  id: string | number;
  amount: number;
  dueDate: string;
  status: string;
  enrollment?: { childName?: string; className?: string };
  description?: string;
  enrollmentId?: string | number;
  installmentNumber?: number;
  totalInstallments?: number;
  paymentPlan?: string;
}

interface ScheduledPaymentsUpcomingResponse {
  success: boolean;
  payments?: ScheduledPaymentApi[];
}

interface ScheduledPaymentsGroupedResponse {
  success: boolean;
  groups?: Array<Record<string, unknown>>;
}

interface StripePaymentHistoryResponse {
  success: boolean;
  payments?: Array<Record<string, unknown>>;
}

interface CreditsResponse {
  // /api/parent/credits returns the available balance in CENTS under
  // `totalAvailableCents`. (`totalAvailable` was the legacy key name and
  // does NOT exist on the response — reading it would silently return 0
  // and cause the Outstanding Balance card to show the gross owed amount
  // even when credits should reduce it.)
  totalAvailableCents?: number;
  totalAvailableFormatted?: string;
  credits?: Array<Record<string, unknown>>;
}

type UpcomingPaymentRow = {
  id: string | number;
  amount: number;
  dueDate: Date;
  status: string;
  childName: string;
  className: string;
  description: string;
  enrollmentId?: string | number;
  installmentNumber?: number;
  totalInstallments?: number;
  paymentPlan?: string;
  source: 'database';
};

function brandLabel(brand: string): string {
  if (!brand) return 'Card';
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

// Compact list of the parent's saved cards plus a "Use a different card" option.
// Callers control selection via selectedPaymentMethodId / onChange ('new' = enter a new card).
function SavedCardSelector({
  paymentMethods,
  selectedPaymentMethodId,
  onChange,
  disabled,
}: {
  paymentMethods: SavedCard[];
  selectedPaymentMethodId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (paymentMethods.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="saved-card-selector">
      <h3 className="text-sm font-medium">Pay with</h3>
      <div className="rounded-lg border border-border divide-y">
        {paymentMethods.map((pm) => (
          <label
            key={pm.id}
            className={`flex items-center gap-3 p-3 cursor-pointer ${
              selectedPaymentMethodId === pm.id ? 'bg-muted' : ''
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            data-testid={`saved-card-option-${pm.id}`}
          >
            <input
              type="radio"
              name="payment-method-choice"
              value={pm.id}
              checked={selectedPaymentMethodId === pm.id}
              onChange={() => !disabled && onChange(pm.id)}
              disabled={disabled}
              className="h-4 w-4"
            />
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 text-sm">
              <span className="font-medium">{brandLabel(pm.brand)} •••• {pm.last4}</span>
              {pm.expMonth && pm.expYear && (
                <span className="ml-2 text-muted-foreground">
                  exp {String(pm.expMonth).padStart(2, '0')}/{String(pm.expYear).slice(-2)}
                </span>
              )}
            </div>
            {pm.isDefault && (
              <Badge variant="secondary" className="text-xs">Default</Badge>
            )}
          </label>
        ))}
        <label
          className={`flex items-center gap-3 p-3 cursor-pointer ${
            selectedPaymentMethodId === 'new' ? 'bg-muted' : ''
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          data-testid="saved-card-option-new"
        >
          <input
            type="radio"
            name="payment-method-choice"
            value="new"
            checked={selectedPaymentMethodId === 'new'}
            onChange={() => !disabled && onChange('new')}
            disabled={disabled}
            className="h-4 w-4"
          />
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm">Use a different card</span>
        </label>
      </div>
    </div>
  );
}

// Stripe payment form for scheduled payments
function ScheduledPaymentForm({ 
  onSuccess, 
  onError,
  onCancel,
  amount,
  paymentId,
  disabled = false,
}: { 
  onSuccess: () => void; 
  onError: (error: string) => void;
  onCancel: () => void;
  amount: number;
  paymentId: string | number;
  disabled?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);
  // Single-flight guard for Pay button — prevents a fast double-click from
  // firing two confirmPayment calls before `isProcessing` re-renders.
  const submittingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) {
      onError('Payment system not ready. Please try again.');
      return;
    }

    if (!elementsReady) {
      onError('Please wait for the payment form to load.');
      return;
    }

    if (disabled) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + '/parent/payments'
        },
        redirect: 'if_required'
      });

      if (error) {
        onError(error.message || 'Payment failed');
        setIsProcessing(false);
        submittingRef.current = false;
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // IMMEDIATELY confirm with server to update scheduled payment status
        // This provides immediate UI update without waiting for webhook
        try {
          const token = localStorage.getItem('supabase_token');
          const confirmResponse = await fetch(`/api/scheduled-payments/${paymentId}/confirm`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paymentIntentId: paymentIntent.id
            })
          });
          
          const confirmData = await confirmResponse.json();
          if (!confirmResponse.ok) {
            console.warn('⚠️ Failed to confirm payment immediately:', confirmData.error);
            // Don't fail the whole flow - webhook will eventually update the status
          } else {
            console.log('✅ Payment confirmed immediately with server:', confirmData);
          }
        } catch (confirmError) {
          console.warn('⚠️ Error confirming payment with server:', confirmError);
          // Don't fail - webhook will handle it
        }
        
        onSuccess();
      } else if (paymentIntent && paymentIntent.status === 'requires_action') {
        onError('Additional verification required. Please try again.');
        setIsProcessing(false);
        submittingRef.current = false;
      } else {
        onError('Payment status unknown. Please check your payment history.');
        setIsProcessing(false);
        submittingRef.current = false;
      }
    } catch (err: any) {
      onError(err.message || 'An error occurred during payment');
      setIsProcessing(false);
      submittingRef.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement 
        onReady={() => setElementsReady(true)}
        onLoadError={() => setElementsReady(false)}
      />
      <div className="flex gap-2 pt-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || !elementsReady || isProcessing || disabled} 
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Dialog component for scheduled payment with Stripe Elements
interface ScheduledPaymentDialogProps {
  payment: {
    id: string | number;
    amount: number;
    description: string;
    programName?: string;
    childName?: string;
    dueDate?: string;
    installmentNumber?: number;
    totalInstallments?: number;
    paymentPlan?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}

// Friendly self-recovery for the `charge_amount_diverged` 409.

function ScheduledPaymentDialog({ 
  payment, 
  isOpen, 
  onClose, 
  onSuccess,
  formatCurrency,
  formatDate
}: ScheduledPaymentDialogProps) {
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Credit application state.
  // Task 173 — default applyCredits to TRUE so the manual Pay Now flow
  // matches auto-pay. A parent with credits should never get charged the
  // gross amount just because they didn't notice a toggle.
  const [availableCredits, setAvailableCredits] = useState<number>(0);
  const [applyCredits, setApplyCredits] = useState(true);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [creditPaymentComplete, setCreditPaymentComplete] = useState(false);

  // Saved-card / payment-method selection
  const [paymentMethods, setPaymentMethods] = useState<SavedCard[]>([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('new');
  const [isPayingWithSavedCard, setIsPayingWithSavedCard] = useState(false);

  // Snapshot the scheduled-payment IDs we are paying for when the dialog
  // opens. We use this as the stable input to the stale-status guard so a
  // late re-render that drops the IDs from upcoming doesn't false-positive.
  const [snapshotIds, setSnapshotIds] = useState<Array<string | number>>([]);

  // Server-confirmed amount after a divergence recovery. When non-null,
  // it overrides the locally-derived total and is sent as `expectedChargeAmount`
  // on retry. Cleared on close or when the user changes inputs.
  const [serverConfirmedAmount, setServerConfirmedAmount] = useState<number | null>(null);
  const submittingRef = useRef(false);

  // Live status of the snapshotted scheduled payments. Reads from cache —
  // the parent Payment Management page already keeps this query warm.
  const { data: upcomingForStatus } = useQuery<ScheduledPaymentsUpcomingResponse>({
    queryKey: ['/api/scheduled-payments/upcoming'],
    enabled: isOpen,
  });

  const arePaymentsStale = useMemo(() => {
    if (!isOpen || snapshotIds.length === 0) return false;
    if (!upcomingForStatus?.payments) return false;
    const byId = new Map<string, string>();
    for (const p of upcomingForStatus.payments) byId.set(String(p.id), p.status);
    // `pending` and `overdue` are both payable per the scheduled-payment
    // lifecycle. Anything else (processing/completed/paid/cancelled/skipped/failed)
    // or a missing row means another flow already moved on.
    return snapshotIds.some((id) => {
      const status = byId.get(String(id));
      if (!status) return true;
      return status !== 'pending' && status !== 'overdue';
    });
  }, [isOpen, snapshotIds, upcomingForStatus]);

  // UI-side mirror of the server's manual-pay math. The server is
  // authoritative and 409s on any divergence > 1¢.
  const { creditsToApply, amountAfterCredits, isFullyCoveredByCredits } =
    computeManualPayDisplay({
      amount: payment.amount,
      availableCredits,
      applyCredits,
    });
  // After a divergence recovery, prefer the server's amount.
  const effectiveChargeAmount =
    serverConfirmedAmount !== null ? serverConfirmedAmount : amountAfterCredits;
  const isFullyCovered =
    serverConfirmedAmount !== null
      ? serverConfirmedAmount === 0
      : isFullyCoveredByCredits;
  const usingSavedCard = selectedPaymentMethodId !== 'new' && !isFullyCovered;

  // Fetch available credits and saved cards when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSnapshotIds([payment.id]);
      submittingRef.current = false;
      fetchCredits();
      fetchPaymentMethods();
    }
  }, [isOpen, payment.id]);

  // Create payment intent when dialog opens (only if not fully covered by credits AND user wants to enter a new card)
  useEffect(() => {
    if (
      isOpen &&
      !clientSecret &&
      !isFullyCovered &&
      !loadingCredits &&
      !loadingPaymentMethods &&
      selectedPaymentMethodId === 'new'
    ) {
      createPaymentIntent();
    }
  }, [isOpen, isFullyCovered, loadingCredits, loadingPaymentMethods, applyCredits, selectedPaymentMethodId]);

  // Drop the server-confirmed override when inputs change.
  useEffect(() => {
    setServerConfirmedAmount(null);
  }, [applyCredits, selectedPaymentMethodId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setError(null);
      // Default to applyCredits=true on every reopen to match auto-pay parity.
      setApplyCredits(true);
      setCreditPaymentComplete(false);
      setPaymentMethods([]);
      setSelectedPaymentMethodId('new');
      setIsPayingWithSavedCard(false);
      setServerConfirmedAmount(null);
    }
  }, [isOpen]);

  const fetchCredits = async () => {
    setLoadingCredits(true);
    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) return;
      
      const response = await fetch('/api/my-credits/available', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableCredits(data.totalAvailableCents || 0);
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err);
      setAvailableCredits(0);
    } finally {
      setLoadingCredits(false);
    }
  };

  const fetchPaymentMethods = async () => {
    setLoadingPaymentMethods(true);
    try {
      const response = await apiRequest('GET', '/api/user/payment-methods');
      if (response.ok) {
        const data = await response.json();
        const cards: SavedCard[] = data.paymentMethods || [];
        setPaymentMethods(cards);
        // Default to the user's default card if present, otherwise first card, otherwise 'new'
        if (cards.length > 0) {
          const defaultCard = cards.find((c) => c.isDefault) || cards[0];
          setSelectedPaymentMethodId(defaultCard.id);
        } else {
          setSelectedPaymentMethodId('new');
        }
      }
    } catch (err) {
      console.error('Failed to fetch saved cards:', err);
      setPaymentMethods([]);
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  const createPaymentIntent = async () => {
    // Don't create Stripe intent if fully covered by credits or paying with a saved card
    if (isFullyCovered || selectedPaymentMethodId !== 'new') {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('POST', '/api/scheduled-payments/pay', {
        paymentId: payment.id,
        applyCredits,
        expectedChargeAmount: effectiveChargeAmount,
      }, { passthroughStatuses: [409] });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === 'charge_amount_diverged') {
          const result = await handleChargeAmountDivergence({
            data,
            snapshotIds: [payment.id],
            endpoint: '/api/scheduled-payments/pay',
            method: 'POST',
            context: 'single',
          });
          if (result.classification === 'already_paid') {
            toast({
              title: 'Payment already settled',
              description:
                'This installment is already taken care of — refreshing your view.',
            });
            onSuccess();
            onClose();
            return;
          }
          // balance_changed — keep the dialog open with refreshed numbers
          // so the parent can re-confirm the new amount. Re-fetch credits
          // (the on-screen credit balance widget reads from local state)
          // and pin `serverConfirmedAmount` so the displayed total + the
          // next retry match the server's view exactly.
          await fetchCredits();
          setServerConfirmedAmount(result.serverChargeAmount);
          const friendly =
            `Your balance just updated. The amount we'd charge is now ` +
            `${formatCurrency(result.serverChargeAmount)}. Please review and try again.`;
          setError(friendly);
          toast({
            title: 'Balance updated',
            description: friendly,
          });
          return;
        }
        throw new Error(data.error || 'Failed to initialize payment');
      }

      setClientSecret(data.clientSecret);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize payment');
      toast({
        title: "Payment Error",
        description: err.message || 'Failed to initialize payment',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // One-click pay with a saved card (off-session via backend)
  const handleSavedCardPayment = async () => {
    if (selectedPaymentMethodId === 'new') return;
    if (submittingRef.current) return;
    if (arePaymentsStale) return;
    submittingRef.current = true;
    setIsPayingWithSavedCard(true);
    setError(null);

    try {
      const response = await apiRequest('POST', '/api/scheduled-payments/pay', {
        paymentId: payment.id,
        applyCredits,
        expectedChargeAmount: effectiveChargeAmount,
        paymentMethodId: selectedPaymentMethodId,
      }, { passthroughStatuses: [409] });

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.code === 'charge_amount_diverged') {
          const result = await handleChargeAmountDivergence({
            data,
            snapshotIds: [payment.id],
            endpoint: '/api/scheduled-payments/pay',
            method: 'POST',
            context: 'single',
          });
          if (result.classification === 'already_paid') {
            toast({
              title: 'Payment already settled',
              description:
                'This installment is already taken care of — refreshing your view.',
            });
            onSuccess();
            onClose();
            return;
          }
          // Re-fetch credits + pin server-confirmed amount so the dialog
          // breakdown matches the server's view; next click will use it.
          await fetchCredits();
          setServerConfirmedAmount(result.serverChargeAmount);
          const friendly =
            `Your balance just updated. The amount we'd charge is now ` +
            `${formatCurrency(result.serverChargeAmount)}. Please review and try again.`;
          setError(friendly);
          toast({
            title: 'Balance updated',
            description: friendly,
          });
          submittingRef.current = false;
          return;
        }
        throw new Error(data.error || 'Failed to charge saved card');
      }

      if (data.alreadyConfirmed && data.paymentIntentId) {
        // Mark scheduled payment completed immediately on the server (idempotent)
        try {
          const confirmResponse = await apiRequest(
            'POST',
            `/api/scheduled-payments/${payment.id}/confirm`,
            { paymentIntentId: data.paymentIntentId }
          );
          if (!confirmResponse.ok) {
            const cd = await confirmResponse.json().catch(() => ({}));
            console.warn('⚠️ Failed to confirm saved-card payment immediately:', cd?.error);
          }
        } catch (confirmErr) {
          console.warn('⚠️ Error confirming saved-card payment:', confirmErr);
          // Webhook will reconcile
        }
        handleSuccess();
      } else if (data.clientSecret) {
        // Fallback: PI created but needs additional confirmation (e.g., 3DS) — fall through to Elements flow
        setClientSecret(data.clientSecret);
        setSelectedPaymentMethodId('new');
        setError('Additional verification needed. Please confirm using the card form below.');
      } else {
        throw new Error('Unexpected payment response');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to charge saved card');
      toast({
        title: 'Payment Failed',
        description: err.message || 'Failed to charge saved card',
        variant: 'destructive',
      });
      submittingRef.current = false;
    } finally {
      setIsPayingWithSavedCard(false);
    }
  };
  
  // Handle credit-only payment (no Stripe needed).
  // Task 173 — route through the unified `/pay` endpoint so the same
  // atomic `createCreditHolds` → `completeCreditsOnlyPayment` flow used
  // by auto-pay finalizes the installment. The legacy `/pay-with-credits`
  // endpoint is no longer wired from this dialog.
  const handleCreditOnlyPayment = async () => {
    if (submittingRef.current) return;
    if (arePaymentsStale) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('POST', '/api/scheduled-payments/pay', {
        paymentId: payment.id,
        applyCredits: true,
        expectedChargeAmount: 0,
      }, { passthroughStatuses: [409] });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === 'charge_amount_diverged') {
          const result = await handleChargeAmountDivergence({
            data,
            snapshotIds: [payment.id],
            endpoint: '/api/scheduled-payments/pay',
            method: 'POST',
            context: 'single',
          });
          if (result.classification === 'already_paid') {
            toast({
              title: 'Payment already settled',
              description:
                'This installment is already taken care of — refreshing your view.',
            });
            onSuccess();
            onClose();
            return;
          }
          // Credits-only path with balance_changed almost always means the
          // parent's credit balance moved. Re-fetch credits + pin the
          // server-confirmed amount so the breakdown matches the server
          // and the next click hits the right amount.
          await fetchCredits();
          setServerConfirmedAmount(result.serverChargeAmount);
          const friendly = result.serverChargeAmount > 0
            ? `Your credit balance changed. The remaining amount is now ` +
              `${formatCurrency(result.serverChargeAmount)} after credits. ` +
              `Please review and try again.`
            : `Your credit balance changed. Please review the updated payment ` +
              `summary and try again.`;
          setError(friendly);
          toast({
            title: 'Credits updated',
            description: friendly,
          });
          submittingRef.current = false;
          return;
        }
        throw new Error(data.error || 'Failed to process credit payment');
      }

      setCreditPaymentComplete(true);
      toast({
        title: "Payment Successful",
        description: `Payment completed using ${formatCurrency(creditsToApply)} in credits.`,
      });
      // Await every cache key listed in task #192's "Done looks like" so the
      // page reflects the settlement before we close the dialog. The
      // `/api/scheduled-payments` prefix partial-matches the `/upcoming` and
      // `/grouped` sub-keys.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/parent/memberships'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/parent/credits'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/enrollments'] }),
      ]);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to process credit payment');
      toast({
        title: "Payment Error",
        description: err.message || 'Failed to process credit payment',
        variant: "destructive",
      });
      submittingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = async () => {
    toast({
      title: "Payment Successful",
      description: "Your payment has been processed successfully.",
    });
    // Await every cache key listed in task #192's "Done looks like" so the
    // page reflects the settlement before we close the dialog. Outstanding
    // Balance card reads from /api/parent/enrollments. The
    // `/api/scheduled-payments` prefix partial-matches `/upcoming` and
    // `/grouped` so a single invalidation refreshes both.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/parent/memberships'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/parent/credits'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/enrollments'] }),
    ]);
    onSuccess();
    onClose();
  };

  const handleError = (errorMessage: string) => {
    toast({
      title: "Payment Failed",
      description: errorMessage,
      variant: "destructive",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Make Payment</DialogTitle>
          <DialogDescription>
            {payment.installmentNumber && payment.totalInstallments 
              ? `Complete your payment for ${payment.paymentPlan || 'scheduled'} payment ${payment.installmentNumber} of ${payment.totalInstallments}`
              : `Complete your payment for ${payment.description}`
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Payment Summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Payment Summary</h3>
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span>Program:</span>
                <span className="font-medium">{payment.programName || 'Class'}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Child:</span>
                <span className="font-medium">{payment.childName || 'Child'}</span>
              </div>
              {payment.dueDate && (
                <div className="flex justify-between mb-2">
                  <span>Due Date:</span>
                  <span className="font-medium">{formatDate(payment.dueDate)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span>Payment Amount:</span>
                <span className="font-medium">{formatCurrency(payment.amount)}</span>
              </div>
              {creditsToApply > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Credits Applied:</span>
                  <span className="font-medium">-{formatCurrency(creditsToApply)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border mt-2">
                <span className="font-semibold">Amount Due:</span>
                <span className="font-bold text-lg" data-testid="text-amount-due">{formatCurrency(effectiveChargeAmount)}</span>
              </div>
              {serverConfirmedAmount !== null && (
                <p
                  className="text-xs text-amber-700 mt-1"
                  data-testid="text-server-confirmed-amount"
                >
                  Updated by server after a balance change — this is the
                  amount we will actually charge.
                </p>
              )}
            </div>
          </div>

          {/* Credits Section */}
          {availableCredits > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Available Credits</p>
                    <p className="text-lg font-bold text-amber-600">{formatCurrency(availableCredits)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="apply-credits-toggle" className="text-sm text-amber-800">
                    Apply to payment
                  </Label>
                  <Switch
                    id="apply-credits-toggle"
                    checked={applyCredits}
                    onCheckedChange={(checked) => {
                      setApplyCredits(checked);
                      setClientSecret(null); // Reset to recalculate with credits
                    }}
                  />
                </div>
              </div>
              {applyCredits && (
                <div className="mt-3 p-2 bg-amber-100 rounded text-sm text-amber-800">
                  <div className="flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    <span>
                      {isFullyCovered
                        ? `Full payment covered by credits! Remaining credits: ${formatCurrency(availableCredits - creditsToApply)}`
                        : `${formatCurrency(creditsToApply)} will be applied. You'll pay ${formatCurrency(effectiveChargeAmount)} with card.`
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved card selector — only when not fully covered by credits */}
          {!isFullyCovered && paymentMethods.length > 0 && (
            <SavedCardSelector
              paymentMethods={paymentMethods}
              selectedPaymentMethodId={selectedPaymentMethodId}
              onChange={(id) => {
                setSelectedPaymentMethodId(id);
                setError(null);
                if (id !== 'new') {
                  // Pay-with-saved-card path doesn't need a pre-created intent
                  setClientSecret(null);
                }
              }}
              disabled={isLoading || isPayingWithSavedCard}
            />
          )}

          {/* Payment Form or Credit-Only Payment */}
          {loadingCredits || loadingPaymentMethods ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading payment options...</p>
            </div>
          ) : error && !usingSavedCard ? (
            <div className="text-center py-4">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={isFullyCovered ? handleCreditOnlyPayment : createPaymentIntent} variant="outline">
                Try Again
              </Button>
            </div>
          ) : isFullyCovered ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <Check className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-800">No card payment needed!</p>
                <p className="text-sm text-green-600">Your credits fully cover this payment.</p>
              </div>
              {arePaymentsStale && (
                <p
                  className="text-xs text-muted-foreground text-center"
                  data-testid="text-stale-payment-helper"
                >
                  This installment is no longer pending — refresh to see the latest status.
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreditOnlyPayment}
                  className="flex-1"
                  disabled={isLoading || arePaymentsStale}
                  data-testid="pay-with-credits-button"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Award className="h-4 w-4 mr-2" />
                      Pay with Credits
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : usingSavedCard ? (
            <div className="space-y-3">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {arePaymentsStale && (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="text-stale-payment-helper"
                >
                  This installment is no longer pending — refresh to see the latest status.
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isPayingWithSavedCard}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSavedCardPayment}
                  disabled={isPayingWithSavedCard || arePaymentsStale}
                  className="flex-1"
                  data-testid="pay-with-saved-card-button"
                >
                  {isPayingWithSavedCard ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Pay {formatCurrency(effectiveChargeAmount)}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Initializing payment...</p>
            </div>
          ) : clientSecret ? (
            <>
              {arePaymentsStale && (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="text-stale-payment-helper"
                >
                  This installment is no longer pending — refresh to see the latest status.
                </p>
              )}
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#1e3a5f',
                    }
                  }
                }}
              >
                <ScheduledPaymentForm
                  onSuccess={handleSuccess}
                  onError={handleError}
                  onCancel={onClose}
                  amount={effectiveChargeAmount}
                  paymentId={payment.id}
                  disabled={arePaymentsStale}
                />
              </Elements>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CombinedPaymentForm({ 
  onSuccess, 
  onError,
  onCancel,
  amount,
  scheduledPaymentIds,
  disabled = false,
}: { 
  onSuccess: (paymentIntentId: string) => void; 
  onError: (error: string) => void;
  onCancel: () => void;
  amount: number;
  scheduledPaymentIds: number[];
  disabled?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);
  // Single-flight guard for the Pay All button — prevents a fast double-click
  // from firing two confirmPayment calls before `isProcessing` re-renders.
  const submittingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) {
      onError('Payment system not ready. Please try again.');
      return;
    }
    if (!elementsReady) {
      onError('Please wait for the payment form to load.');
      return;
    }
    if (disabled) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + '/payments'
        },
        redirect: 'if_required'
      });
      if (error) {
        onError(error.message || 'Payment failed');
        setIsProcessing(false);
        submittingRef.current = false;
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        try {
          const token = localStorage.getItem('supabase_token');
          const confirmResponse = await fetch('/api/scheduled-payments/confirm-combined', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paymentIntentId: paymentIntent.id })
          });
          const confirmData = await confirmResponse.json();
          if (!confirmResponse.ok) {
            console.warn('Failed to confirm combined payment immediately:', confirmData.error);
          } else {
            console.log('Combined payment confirmed immediately:', confirmData);
          }
        } catch (confirmError) {
          console.warn('Error confirming combined payment:', confirmError);
        }
        onSuccess(paymentIntent.id);
      } else if (paymentIntent && paymentIntent.status === 'requires_action') {
        onError('Additional verification required. Please try again.');
        setIsProcessing(false);
        submittingRef.current = false;
      } else {
        onError('Payment status unknown. Please check your payment history.');
        setIsProcessing(false);
        submittingRef.current = false;
      }
    } catch (err: any) {
      onError(err.message || 'An error occurred during payment');
      setIsProcessing(false);
      submittingRef.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement 
        onReady={() => setElementsReady(true)}
        onLoadError={() => setElementsReady(false)}
      />
      <div className="flex gap-2 pt-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || !elementsReady || isProcessing || disabled} 
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

interface CombinedPaymentDialogProps {
  payments: any[];
  group: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}

function CombinedPaymentDialog({
  payments,
  group,
  isOpen,
  onClose,
  onSuccess,
  formatCurrency,
  formatDate,
}: CombinedPaymentDialogProps) {
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task 173 — default applyCredits to TRUE so credits flow into combined
  // payments by default (auto-pay parity).
  const [availableCredits, setAvailableCredits] = useState<number>(0);
  const [applyCredits, setApplyCredits] = useState(true);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [creditPaymentComplete, setCreditPaymentComplete] = useState(false);

  // Saved-card / payment-method selection
  const [paymentMethods, setPaymentMethods] = useState<SavedCard[]>([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('new');
  const [isPayingWithSavedCard, setIsPayingWithSavedCard] = useState(false);

  // Server-confirmed amount after a divergence recovery. When non-null,
  // it overrides the locally-derived total and is sent as `expectedChargeAmount`
  // on retry. Cleared on close or when the user changes inputs.
  const [serverConfirmedAmount, setServerConfirmedAmount] = useState<number | null>(null);

  // Snapshot the scheduled-payment IDs at open time for the stale-status guard.
  const [snapshotIds, setSnapshotIds] = useState<Array<string | number>>([]);
  const submittingRef = useRef(false);

  // Live status of the snapshotted scheduled payments. Reads from cache —
  // the parent Payment Management page already keeps this query warm.
  const { data: upcomingForStatus } = useQuery<ScheduledPaymentsUpcomingResponse>({
    queryKey: ['/api/scheduled-payments/upcoming'],
    enabled: isOpen,
  });

  const arePaymentsStale = useMemo(() => {
    if (!isOpen || snapshotIds.length === 0) return false;
    if (!upcomingForStatus?.payments) return false;
    const byId = new Map<string, string>();
    for (const p of upcomingForStatus.payments) byId.set(String(p.id), p.status);
    // `pending` and `overdue` are both payable per the scheduled-payment
    // lifecycle. Anything else (processing/completed/paid/cancelled/skipped/failed)
    // or a missing row means another flow already moved on.
    return snapshotIds.some((id) => {
      const status = byId.get(String(id));
      if (!status) return true;
      return status !== 'pending' && status !== 'overdue';
    });
  }, [isOpen, snapshotIds, upcomingForStatus]);

  const totalAmount = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
  // UI-side mirror of the server's combined credit math. Server is authoritative.
  const { creditsToApply, amountAfterCredits, isFullyCoveredByCredits } =
    computeManualPayDisplay({
      amount: totalAmount,
      availableCredits,
      applyCredits,
    });
  // After a divergence recovery, prefer the server's amount.
  const effectiveChargeAmount =
    serverConfirmedAmount !== null ? serverConfirmedAmount : amountAfterCredits;
  const isFullyCovered =
    serverConfirmedAmount !== null
      ? serverConfirmedAmount === 0
      : isFullyCoveredByCredits;
  const usingSavedCard = selectedPaymentMethodId !== 'new' && !isFullyCovered;

  useEffect(() => {
    if (isOpen) {
      setSnapshotIds(payments.map((p: any) => p.id));
      submittingRef.current = false;
      fetchCredits();
      fetchPaymentMethods();
    }
    // We intentionally only re-snapshot when the dialog opens (not on every
    // render) so the stale guard reflects the IDs the user committed to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (
      isOpen &&
      !clientSecret &&
      !isFullyCovered &&
      !loadingCredits &&
      !loadingPaymentMethods &&
      selectedPaymentMethodId === 'new'
    ) {
      createPaymentIntent();
    }
  }, [isOpen, isFullyCovered, loadingCredits, loadingPaymentMethods, applyCredits, selectedPaymentMethodId]);

  useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setError(null);
      // Default to applyCredits=true on every reopen to match auto-pay parity.
      setApplyCredits(true);
      setCreditPaymentComplete(false);
      setPaymentMethods([]);
      setSelectedPaymentMethodId('new');
      setIsPayingWithSavedCard(false);
      setServerConfirmedAmount(null);
    }
  }, [isOpen]);

  // Drop the server-confirmed override when inputs change.
  useEffect(() => {
    setServerConfirmedAmount(null);
  }, [applyCredits, selectedPaymentMethodId]);

  const fetchCredits = async () => {
    setLoadingCredits(true);
    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) return;

      const response = await fetch('/api/my-credits/available', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableCredits(data.totalAvailableCents || 0);
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err);
      setAvailableCredits(0);
    } finally {
      setLoadingCredits(false);
    }
  };

  const fetchPaymentMethods = async () => {
    setLoadingPaymentMethods(true);
    try {
      const response = await apiRequest('GET', '/api/user/payment-methods');
      if (response.ok) {
        const data = await response.json();
        const cards: SavedCard[] = data.paymentMethods || [];
        setPaymentMethods(cards);
        if (cards.length > 0) {
          const defaultCard = cards.find((c) => c.isDefault) || cards[0];
          setSelectedPaymentMethodId(defaultCard.id);
        } else {
          setSelectedPaymentMethodId('new');
        }
      }
    } catch (err) {
      console.error('Failed to fetch saved cards:', err);
      setPaymentMethods([]);
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  const createPaymentIntent = async () => {
    if (isFullyCovered || selectedPaymentMethodId !== 'new') {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const scheduledPaymentIds = payments.map((p: any) => p.id);
      const response = await apiRequest('POST', '/api/scheduled-payments/pay-combined', {
        scheduledPaymentIds,
        applyCredits,
        expectedChargeAmount: effectiveChargeAmount,
      }, { passthroughStatuses: [409] });

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.code === 'charge_amount_diverged') {
          const result = await handleChargeAmountDivergence({
            data,
            snapshotIds: scheduledPaymentIds,
            endpoint: '/api/scheduled-payments/pay-combined',
            method: 'POST',
            context: 'combined',
          });
          if (result.classification === 'already_paid') {
            toast({
              title: 'Payments already settled',
              description:
                'These installments are already taken care of — refreshing your view.',
            });
            onSuccess();
            onClose();
            return;
          }
          // Re-fetch credits + pin server-confirmed amount so the dialog
          // breakdown matches the server's view; next click will use it.
          await fetchCredits();
          setServerConfirmedAmount(result.serverChargeAmount);
          const friendly =
            `Your balance just updated. The combined amount we'd charge is now ` +
            `${formatCurrency(result.serverChargeAmount)}. Please review and try again.`;
          setError(friendly);
          toast({
            title: 'Balance updated',
            description: friendly,
          });
          return;
        }
        throw new Error(data.error || 'Failed to initialize combined payment');
      }

      setClientSecret(data.clientSecret);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize payment');
      toast({
        title: "Payment Error",
        description: err.message || 'Failed to initialize combined payment',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // One-click pay-all using a saved card (off-session via backend)
  const handleSavedCardPayment = async () => {
    if (selectedPaymentMethodId === 'new') return;
    if (submittingRef.current) return;
    if (arePaymentsStale) return;
    submittingRef.current = true;
    setIsPayingWithSavedCard(true);
    setError(null);

    try {
      const scheduledPaymentIds = payments.map((p: any) => p.id);
      const response = await apiRequest('POST', '/api/scheduled-payments/pay-combined', {
        scheduledPaymentIds,
        applyCredits,
        expectedChargeAmount: effectiveChargeAmount,
        paymentMethodId: selectedPaymentMethodId,
      }, { passthroughStatuses: [409] });

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.code === 'charge_amount_diverged') {
          const result = await handleChargeAmountDivergence({
            data,
            snapshotIds: scheduledPaymentIds,
            endpoint: '/api/scheduled-payments/pay-combined',
            method: 'POST',
            context: 'combined',
          });
          if (result.classification === 'already_paid') {
            toast({
              title: 'Payments already settled',
              description:
                'These installments are already taken care of — refreshing your view.',
            });
            onSuccess();
            onClose();
            return;
          }
          // Re-fetch credits + pin server-confirmed amount so the dialog
          // breakdown matches the server's view; next click will use it.
          await fetchCredits();
          setServerConfirmedAmount(result.serverChargeAmount);
          const friendly =
            `Your balance just updated. The combined amount we'd charge is now ` +
            `${formatCurrency(result.serverChargeAmount)}. Please review and try again.`;
          setError(friendly);
          toast({
            title: 'Balance updated',
            description: friendly,
          });
          submittingRef.current = false;
          return;
        }
        throw new Error(data.error || 'Failed to charge saved card');
      }

      if (data.alreadyConfirmed && data.paymentIntentId) {
        try {
          const confirmResponse = await apiRequest(
            'POST',
            '/api/scheduled-payments/confirm-combined',
            { paymentIntentId: data.paymentIntentId }
          );
          if (!confirmResponse.ok) {
            const cd = await confirmResponse.json().catch(() => ({}));
            console.warn('⚠️ Failed to confirm saved-card combined payment immediately:', cd?.error);
          }
        } catch (confirmErr) {
          console.warn('⚠️ Error confirming saved-card combined payment:', confirmErr);
        }
        await handleSuccess(data.paymentIntentId);
      } else if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setSelectedPaymentMethodId('new');
        setError('Additional verification needed. Please confirm using the card form below.');
        submittingRef.current = false;
      } else {
        throw new Error('Unexpected payment response');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to charge saved card');
      toast({
        title: 'Payment Failed',
        description: err.message || 'Failed to charge saved card',
        variant: 'destructive',
      });
      submittingRef.current = false;
    } finally {
      setIsPayingWithSavedCard(false);
    }
  };

  const handleCreditOnlyPayment = async () => {
    if (submittingRef.current) return;
    if (arePaymentsStale) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const scheduledPaymentIds = payments.map((p: any) => p.id);
      // Task 173 — route through unified `/pay-combined` so the credits-only
      // zero-charge path uses the same atomic createCreditHolds →
      // completeCreditsOnlyPayment flow as auto-pay (per installment).
      const response = await apiRequest('POST', '/api/scheduled-payments/pay-combined', {
        scheduledPaymentIds,
        applyCredits: true,
        expectedChargeAmount: 0,
      }, { passthroughStatuses: [409] });

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.code === 'charge_amount_diverged') {
          const result = await handleChargeAmountDivergence({
            data,
            snapshotIds: scheduledPaymentIds,
            endpoint: '/api/scheduled-payments/pay-combined',
            method: 'POST',
            context: 'combined',
          });
          if (result.classification === 'already_paid') {
            toast({
              title: 'Payments already settled',
              description:
                'These installments are already taken care of — refreshing your view.',
            });
            onSuccess();
            onClose();
            return;
          }
          // Re-fetch credits + pin server-confirmed amount so the dialog
          // breakdown matches the server's view; next click will use it.
          await fetchCredits();
          setServerConfirmedAmount(result.serverChargeAmount);
          const friendly = result.serverChargeAmount > 0
            ? `Your credit balance changed. The remaining combined amount is now ` +
              `${formatCurrency(result.serverChargeAmount)} after credits. ` +
              `Please review and try again.`
            : `Your credit balance changed. Please review the updated payment ` +
              `summary and try again.`;
          setError(friendly);
          toast({
            title: 'Credits updated',
            description: friendly,
          });
          submittingRef.current = false;
          return;
        }
        throw new Error(data.error || 'Failed to process credit payment');
      }

      setCreditPaymentComplete(true);
      toast({
        title: "Payment Successful",
        description: `${payments.length} payments completed using ${formatCurrency(creditsToApply)} in credits.`,
      });
      // Await every cache key listed in task #192's "Done looks like" so the
      // page reflects the settlement before we close the dialog. The
      // `/api/scheduled-payments` prefix partial-matches the `/upcoming` and
      // `/grouped` sub-keys.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/parent/memberships'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/parent/credits'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/enrollments'] }),
      ]);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to process credit payment');
      toast({
        title: "Payment Error",
        description: err.message || 'Failed to process credit payment',
        variant: "destructive",
      });
      submittingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = async (_paymentIntentId: string) => {
    toast({
      title: "Payment Successful",
      description: `Combined payment for ${payments.length} installments processed successfully.`,
    });
    // Await every cache key listed in task #192's "Done looks like" so the
    // page reflects the settlement before we close the dialog. Outstanding
    // Balance card reads from /api/parent/enrollments. The
    // `/api/scheduled-payments` prefix partial-matches `/upcoming` and
    // `/grouped` so a single invalidation refreshes both.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/parent/memberships'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/parent/credits'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/enrollments'] }),
    ]);
    onSuccess();
    onClose();
  };

  const handleError = (errorMessage: string) => {
    toast({
      title: "Payment Failed",
      description: errorMessage,
      variant: "destructive",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Make Payment</DialogTitle>
          <DialogDescription>
            Complete your payment for {payments.length} installments due on {group?.dueDateFormatted || 'this date'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Payment Summary</h3>
            <div className="bg-muted p-4 rounded-lg space-y-3">
              {payments.map((payment: any) => (
                <div key={payment.id} className="flex justify-between items-start text-sm">
                  <div>
                    <p className="font-medium">{payment.childName || 'Child'}</p>
                    <p className="text-muted-foreground text-xs">
                      {payment.className || 'Class'} - Installment {payment.installmentNumber}/{payment.totalInstallments}
                    </p>
                  </div>
                  <span className="font-medium">{formatCurrency(payment.amount)}</span>
                </div>
              ))}
              <div className="border-t pt-2 border-border">
                <div className="flex justify-between">
                  <span>Payment Amount:</span>
                  <span className="font-medium">{formatCurrency(totalAmount)}</span>
                </div>
                {creditsToApply > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Credits Applied:</span>
                    <span className="font-medium">-{formatCurrency(creditsToApply)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-border mt-2">
                  <span className="font-semibold">Amount Due:</span>
                  <span className="font-bold text-lg" data-testid="text-combined-amount-due">{formatCurrency(effectiveChargeAmount)}</span>
                </div>
                {serverConfirmedAmount !== null && (
                  <p
                    className="text-xs text-amber-700 mt-1"
                    data-testid="text-combined-server-confirmed-amount"
                  >
                    Updated by server after a balance change — this is the
                    amount we will actually charge.
                  </p>
                )}
              </div>
            </div>
          </div>

          {availableCredits > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Available Credits</p>
                    <p className="text-lg font-bold text-amber-600">{formatCurrency(availableCredits)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="apply-combined-credits-toggle" className="text-sm text-amber-800">
                    Apply to payment
                  </Label>
                  <Switch
                    id="apply-combined-credits-toggle"
                    checked={applyCredits}
                    onCheckedChange={(checked) => {
                      setApplyCredits(checked);
                      setClientSecret(null);
                    }}
                  />
                </div>
              </div>
              {applyCredits && (
                <div className="mt-3 p-2 bg-amber-100 rounded text-sm text-amber-800">
                  <div className="flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    <span>
                      {isFullyCovered
                        ? `Full payment covered by credits! Remaining credits: ${formatCurrency(availableCredits - creditsToApply)}`
                        : `${formatCurrency(creditsToApply)} will be applied. You'll pay ${formatCurrency(effectiveChargeAmount)} with card.`
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved card selector — only when not fully covered by credits */}
          {!isFullyCovered && paymentMethods.length > 0 && (
            <SavedCardSelector
              paymentMethods={paymentMethods}
              selectedPaymentMethodId={selectedPaymentMethodId}
              onChange={(id) => {
                setSelectedPaymentMethodId(id);
                setError(null);
                if (id !== 'new') {
                  setClientSecret(null);
                }
              }}
              disabled={isLoading || isPayingWithSavedCard}
            />
          )}

          {loadingCredits || loadingPaymentMethods ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading payment options...</p>
            </div>
          ) : error && !usingSavedCard ? (
            <div className="text-center py-4">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={isFullyCovered ? handleCreditOnlyPayment : createPaymentIntent} variant="outline">
                Try Again
              </Button>
            </div>
          ) : isFullyCovered ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <Check className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-800">No card payment needed!</p>
                <p className="text-sm text-green-600">Your credits fully cover this payment.</p>
              </div>
              {arePaymentsStale && (
                <p
                  className="text-sm text-muted-foreground text-center"
                  data-testid="combined-payment-stale-helper"
                >
                  These installments were just updated. Please close and reopen this dialog.
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreditOnlyPayment}
                  className="flex-1"
                  disabled={isLoading || arePaymentsStale}
                >
                  <Award className="h-4 w-4 mr-2" />
                  Pay with Credits
                </Button>
              </div>
            </div>
          ) : usingSavedCard ? (
            <div className="space-y-3">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {arePaymentsStale && (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="combined-payment-stale-helper"
                >
                  These installments were just updated. Please close and reopen this dialog.
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isPayingWithSavedCard}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSavedCardPayment}
                  disabled={isPayingWithSavedCard || arePaymentsStale}
                  className="flex-1"
                  data-testid="pay-all-with-saved-card-button"
                >
                  {isPayingWithSavedCard ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Pay {formatCurrency(effectiveChargeAmount)}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Initializing payment...</p>
            </div>
          ) : clientSecret ? (
            <>
              {arePaymentsStale && (
                <p
                  className="text-sm text-muted-foreground mb-2"
                  data-testid="combined-payment-stale-helper"
                >
                  These installments were just updated. Please close and reopen this dialog.
                </p>
              )}
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#1e3a5f',
                    }
                  }
                }}
              >
                <CombinedPaymentForm
                  onSuccess={handleSuccess}
                  onError={handleError}
                  onCancel={onClose}
                  amount={effectiveChargeAmount}
                  scheduledPaymentIds={payments.map((p: any) => p.id)}
                  disabled={arePaymentsStale}
                />
              </Elements>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PaymentManagement({ childId, defaultTab }: PaymentManagementProps) {
  const { toast } = useToast();
  const {
    unpaidEnrollments: payOutstandingEnrollments,
    unpaidMemberships: payOutstandingMemberships,
    displayCents: payOutstandingDisplayCents,
    netDueCents: payOutstandingNetDueCents,
    showCreditsLine: payOutstandingShowCreditsLine,
    creditsCents: payOutstandingCreditsCents,
    totalOwedCents: payOutstandingTotalOwedCents,
    enrollmentCount: payOutstandingEnrollmentCount,
    membershipCount: payOutstandingMembershipCount,
    isLoading: isLoadingPayOutstanding,
  } = useUnpaidEnrollments();
  const payOutstanding = usePayOutstanding();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  
  // State for the Stripe payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentForDialog, setSelectedPaymentForDialog] = useState<any>(null);
  
  // State for combined payment dialog
  const [combinedDialogOpen, setCombinedDialogOpen] = useState(false);
  const [selectedCombinedGroup, setSelectedCombinedGroup] = useState<any>(null);
  const [selectedCombinedPayments, setSelectedCombinedPayments] = useState<any[]>([]);
  
  // Detect Stripe redirect completion (e.g., after 3D Secure verification)
  // When Stripe redirects back, URL contains payment_intent and redirect_status params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentIntent = urlParams.get('payment_intent');
    const redirectStatus = urlParams.get('redirect_status');
    
    if (paymentIntent && redirectStatus) {
      console.log('🔄 Detected Stripe redirect completion:', { paymentIntent, redirectStatus });
      
      // Invalidate all payment-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/parent/memberships'] });
      
      // Show appropriate toast based on status
      if (redirectStatus === 'succeeded') {
        toast({
          title: "Payment Successful",
          description: "Your payment has been processed successfully.",
        });
      } else if (redirectStatus === 'failed') {
        toast({
          title: "Payment Failed",
          description: "Your payment could not be processed. Please try again.",
          variant: "destructive",
        });
      }
      
      // Clean up URL parameters to prevent re-triggering on refresh
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [toast]);
  
  // Get payment data for the parent. Multi-element queryKey makes the default
  // fetcher request `/api/payment-history/history`; the leading prefix allows
  // existing `['/api/payment-history']` invalidations to partial-match.
  const { data: payments, isLoading, refetch } = useQuery<PaymentHistoryResponse, Error, Payment[]>({
    queryKey: ["/api/payment-history", "history"],
    select: (data) => (data?.success ? data.payments : []),
  });

  // Get outstanding balances from enrollments using Supabase-authenticated endpoint.
  // The `childId` parameter was carried in the previous queryKey for cache
  // differentiation only — the original queryFn ignored it and always fetched
  // the unfiltered endpoint. Preserved as-is here.
  const { data: enrollments, isLoading: isLoadingEnrollments } = useQuery<
    ParentEnrollmentsResponse | unknown[],
    Error,
    unknown[]
  >({
    queryKey: ["/api/parent/enrollments"],
    select: (data) =>
      Array.isArray(data) ? data : (data?.enrollments ?? []),
  });

  // Get database-stored scheduled payments (single source of truth for upcoming payments)
  const { data: dbScheduledPayments, isLoading: isLoadingDbScheduled, refetch: refetchDbScheduledPayments } = useQuery<
    ScheduledPaymentsUpcomingResponse,
    Error,
    UpcomingPaymentRow[]
  >({
    queryKey: ['/api/scheduled-payments/upcoming'],
    select: (data) => {
      if (!data?.success || !data.payments) return [];
      return data.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        dueDate: new Date(payment.dueDate),
        status: payment.status,
        childName: payment.enrollment?.childName || 'Child',
        className: payment.enrollment?.className || 'Class',
        description: payment.description || `Payment for ${payment.enrollment?.className || 'class'}`,
        enrollmentId: payment.enrollmentId,
        installmentNumber: payment.installmentNumber,
        totalInstallments: payment.totalInstallments,
        paymentPlan: payment.paymentPlan,
        source: 'database' as const,
      }));
    },
  });

  // Get grouped scheduled payments for combined payment view
  const { data: groupedPayments, isLoading: isLoadingGrouped, refetch: refetchGrouped } = useQuery<
    ScheduledPaymentsGroupedResponse,
    Error,
    Array<Record<string, unknown>>
  >({
    queryKey: ['/api/scheduled-payments/grouped'],
    select: (data) => (data?.success ? data.groups ?? [] : []),
  });

  // Membership enrollments — used to include membership fee in Outstanding Balance total.
  // Uses default fetcher (no custom queryFn) per asa-frontend-conventions.
  const { data: membershipEnrollments } = useQuery<unknown[]>({
    queryKey: ['/api/parent/memberships'],
  });

  // Get Stripe payment history for user
  const { data: stripePayments, isLoading: isLoadingStripePayments } = useQuery<
    StripePaymentHistoryResponse,
    Error,
    Array<Record<string, unknown>>
  >({
    queryKey: ["/api/stripe/payment-history"],
    select: (data) => (data?.success ? data.payments ?? [] : []),
  });

  // Get credits data for the parent (using existing endpoint that matches ParentDashboard)
  const { data: creditsData, isLoading: isLoadingCredits } = useQuery<CreditsResponse>({
    queryKey: ["/api/parent/credits"],
  });
  
  // Auto-pay: fetch toggle state for status strip in Upcoming tab
  const { data: autoPayStatusData } = useQuery<{ autoPayEnabled: boolean }>({
    queryKey: ['/api/user/auto-pay-status'],
    refetchOnWindowFocus: true,
  });

  const autoPayEnabled = autoPayStatusData?.autoPayEnabled ?? false;

  // Filter payments based on search and status
  const filteredPayments = React.useMemo(() => {
    if (!payments) return [];
    
    return payments.filter((payment: Payment) => {
      // Filter by search query
      const matchesSearch = 
        (payment.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (payment.programName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (payment.childName || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      // Filter by status - treat 'succeeded', 'paid', and 'completed' as equivalent
      let matchesStatus = filterStatus === 'all';
      if (!matchesStatus) {
        if (filterStatus === 'paid') {
          // Show 'paid', 'succeeded', and 'completed' for the "Paid" filter
          matchesStatus = payment.status === 'paid' || payment.status === 'succeeded' || payment.status === 'completed';
        } else if (filterStatus === 'succeeded') {
          // Also allow filtering by 'succeeded' specifically
          matchesStatus = payment.status === 'succeeded' || payment.status === 'paid' || payment.status === 'completed';
        } else {
          matchesStatus = payment.status === filterStatus;
        }
      }
      
      return matchesSearch && matchesStatus;
    });
  }, [payments, searchQuery, filterStatus]);
  
  // Calculate outstanding balances from enrollments
  const outstandingBalances = React.useMemo(() => {
    if (!enrollments) return [];
    
    const enrollmentGroups = enrollments.reduce<Record<string, any[]>>((acc, enrollment: any) => {
      const key = `${enrollment.classId}-${enrollment.childId}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(enrollment);
      return acc;
    }, {});

    const unpaidEnrollments = [];
    for (const [key, groupEnrollments] of Object.entries(enrollmentGroups)) {
      const enrollmentList = groupEnrollments as any[];
      const sortedEnrollments = enrollmentList.sort((a, b) => 
        new Date(b.enrollmentDate).getTime() - new Date(a.enrollmentDate).getTime()
      );

      // Use effectiveBalance (DB-generated: total_cost - total_paid - COALESCE(comp_amount_cents, 0))
      // via the parentBalance helper. Never read remainingBalance — it is intentionally 0 for
      // Stripe-managed payment plans and would silently zero-out the displayed balance for the
      // parent (see asa-payment-patterns "Parent Payments page shows $0" pitfall).
      const latestEnrollment = sortedEnrollments[0];
      const latestBalance = getEnrollmentEffectiveBalance(latestEnrollment);
      const hasBalance = latestBalance > 0;
      const hasFullyPaidEnrollment = sortedEnrollments.some((e: any) =>
        e.status === 'enrolled' && getEnrollmentEffectiveBalance(e) === 0
      );

      if (hasBalance || (!hasFullyPaidEnrollment && latestEnrollment.status === 'pending_payment' && latestBalance > 0)) {
        unpaidEnrollments.push(latestEnrollment);
      }
    }
    
    return unpaidEnrollments;
  }, [enrollments]);

  // Group payments by status for the overview tab, including outstanding balances and scheduled payments
  const paymentStats = React.useMemo(() => {
    const paymentData = payments || [];
    const outstandingData = outstandingBalances || [];
    const dbScheduledData = dbScheduledPayments || [];
    
    const stats = paymentData.reduce((acc: any, payment: Payment) => {
      // Count by exact status for filtering
      acc[payment.status] = (acc[payment.status] || 0) + 1;
      acc.total += 1;
      
      // Accumulate totals for each payment type (treat 'succeeded', 'paid', and 'completed' as successful)
      if (payment.status === 'paid' || payment.status === 'succeeded' || payment.status === 'completed') {
        acc.totalPaid = (acc.totalPaid || 0) + payment.amount;
        acc.successfulCount = (acc.successfulCount || 0) + 1;
      } else if (payment.status === 'pending') {
        acc.totalPending = (acc.totalPending || 0) + payment.amount;
      }
      
      return acc;
    }, { paid: 0, succeeded: 0, pending: 0, failed: 0, refunded: 0, canceled: 0, total: 0, totalPaid: 0, totalPending: 0, totalOutstanding: 0, outstandingCount: 0, successfulCount: 0, scheduledPaymentsTotal: 0, scheduledPaymentsCount: 0 });
    
    // Add outstanding balances from enrollments using the parentBalance helper —
    // it always reads effectiveBalance (DB-generated) and never falls back to
    // remainingBalance (which is intentionally 0 for Stripe-managed payment plans
    // and would silently zero-out totals — see asa-payment-patterns).
    stats.totalOutstanding = outstandingData.reduce((total: number, enrollment: any) => {
      return total + Math.max(0, getEnrollmentEffectiveBalance(enrollment));
    }, 0);
    stats.outstandingCount = outstandingData.length;

    // Add membership fees to outstanding balance (denylist per asa-payment-patterns gold-standard).
    // 'grace_period' is intentionally included — fee is overdue but membership is still active.
    // Helper applies the same denylist + ?? balance fallback contract.
    const membershipOutstanding = (membershipEnrollments || []).reduce(
      (total: number, m: any) => total + getMembershipOutstandingBalance(m),
      0,
    );
    stats.totalOutstanding += membershipOutstanding;

    // Add scheduled/upcoming payments from database (single source of truth)
    const pendingDbScheduled = dbScheduledData.filter((p: any) => p.status === 'pending');
    
    const scheduledTotal = pendingDbScheduled
      .map((p: any) => p.amount || 0)
      .reduce((sum: number, amount: number) => sum + amount, 0);
    
    stats.scheduledPaymentsTotal = scheduledTotal;
    stats.scheduledPaymentsCount = pendingDbScheduled.length;
    // Outstanding Balance is sourced from program_enrollments.effectiveBalance (per asa-payment-patterns).
    // Scheduled payments are a subset of that balance — adding them here would double-count.
    
    return stats;
  }, [payments, outstandingBalances, dbScheduledPayments, membershipEnrollments]);
  
  // Format currency amount
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  };
  
  // Format date with validation for invalid dates
  // Use UTC timezone to prevent date shifting when displaying scheduled payment dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };
  
  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
      case 'succeeded':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Check className="mr-1 h-3 w-3" /> Paid
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="mr-1 h-3 w-3" /> Pending
          </Badge>
        );
      case 'failed':
      case 'canceled':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        );
      case 'refunded':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <DollarSign className="mr-1 h-3 w-3" /> Refunded
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  return (
    <div className="space-y-6">
      <Tabs defaultValue={defaultTab ?? "all-payments"} className="w-full">
        <TabsList className="w-full flex-col sm:flex-row justify-start h-auto">
          <TabsTrigger value="overview" className="w-full sm:w-auto sm:mr-2">Overview</TabsTrigger>
          <TabsTrigger value="all-payments" className="w-full sm:w-auto sm:mr-2">All Payments</TabsTrigger>
          <TabsTrigger value="stripe-payments" className="w-full sm:w-auto sm:mr-2">Stripe Payments</TabsTrigger>
          <TabsTrigger value="upcoming" className="w-full sm:w-auto sm:mr-2">Upcoming Payments</TabsTrigger>
          <TabsTrigger value="credits" className="w-full sm:w-auto">Credits</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(paymentStats.totalPaid || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentStats.successfulCount || 0} successful payments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const showPayButton =
                    isLoadingPayOutstanding ||
                    payOutstandingNetDueCents > 0;
                  return (
                    <>
                      <div
                        className="text-2xl font-bold text-orange-600"
                        data-testid="text-outstanding-amount-overview"
                      >
                        {isLoadingEnrollments
                          ? 'Loading...'
                          : formatCurrency(payOutstandingDisplayCents)}
                      </div>
                      {payOutstandingShowCreditsLine && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <div>Owed: {formatCurrency(payOutstandingTotalOwedCents)}</div>
                          <div className="text-amber-700">
                            − Credits available: {formatCurrency(payOutstandingCreditsCents)}
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {payOutstandingEnrollmentCount} unpaid enrollment
                        {payOutstandingEnrollmentCount === 1 ? '' : 's'}
                        {payOutstandingMembershipCount > 0 && (
                          <>
                            {' + '}
                            {payOutstandingMembershipCount} membership
                            {payOutstandingMembershipCount === 1 ? '' : 's'}
                          </>
                        )}
                      </p>
                      {showPayButton && (
                        <Button
                          className="mt-3 w-full h-11"
                          onClick={() =>
                            payOutstanding(
                              payOutstandingEnrollments,
                              payOutstandingMemberships,
                            )
                          }
                          disabled={
                            isLoadingPayOutstanding ||
                            (payOutstandingEnrollments.length === 0 &&
                              payOutstandingMemberships.length === 0)
                          }
                          data-testid="button-pay-outstanding-overview"
                        >
                          {isLoadingPayOutstanding ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4 mr-2" />
                          )}
                          {isLoadingPayOutstanding
                            ? 'Loading...'
                            : payOutstandingNetDueCents > 0
                            ? `Pay ${formatCurrency(payOutstandingNetDueCents)}`
                            : 'Pay Now'}
                        </Button>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(paymentStats.scheduledPaymentsTotal || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentStats.scheduledPaymentsCount || 0} scheduled payments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? "Loading..." : paymentStats.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total payments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  {isLoadingCredits ? "Loading..." : (creditsData?.totalAvailableFormatted || '$0.00')}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {creditsData?.credits?.length || 0} credit{(creditsData?.credits?.length || 0) !== 1 ? 's' : ''} on account
                </p>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your most recent payments</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading payment data...</p>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p>No payment records found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPayments.slice(0, 5).map((payment: Payment, index: number) => (
                    <div key={`recent-${payment.id}-${index}`} className="flex justify-between items-center p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center 
                          ${payment.status === 'paid' || payment.status === 'succeeded' || payment.status === 'completed' ? 'bg-green-100 text-green-700' : 
                            payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            payment.status === 'refunded' ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'}`}>
                          {payment.status === 'paid' || payment.status === 'succeeded' || payment.status === 'completed' ? <Check className="h-5 w-5" /> : 
                           payment.status === 'pending' ? <Clock className="h-5 w-5" /> :
                           payment.status === 'refunded' ? <DollarSign className="h-5 w-5" /> :
                           <AlertCircle className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="font-medium">{payment.description}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(payment.date)} • {payment.childName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(payment.amount)}</p>
                        <p className="text-sm">{getStatusBadge(payment.status)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <a href="#all-payments">View All Payments</a>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* All Payments Tab */}
        <TabsContent value="all-payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>View and manage all your payments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search payments..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full md:w-36">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid / Succeeded</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading payment data...</p>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p>No payment records found</p>
                  {searchQuery && (
                    <p className="text-sm mt-2">Try adjusting your search or filters</p>
                  )}
                </div>
              ) : (
                <Table>
                  <TableCaption>A list of your payment history</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Child</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment: Payment, index: number) => (
                      <React.Fragment key={`payment-${payment.id}-${index}`}>
                        <TableRow>
                          <TableCell>{formatDate(payment.date)}</TableCell>
                          <TableCell className="font-medium">
                            {payment.description}
                            {payment.discountSnapshot && payment.discountSnapshot.discountTotal > 0 && (
                              <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800 text-xs">
                                Discount Applied
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{payment.childName}</TableCell>
                          <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                          <TableCell>{getStatusBadge(payment.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {payment.status === 'pending' && (
                                <Button 
                                  size="sm" 
                                  onClick={() => {
                                    setSelectedPaymentForDialog({
                                      id: payment.id,
                                      amount: payment.amount,
                                      description: payment.description,
                                      programName: payment.programName,
                                      childName: payment.childName,
                                      dueDate: payment.dueDate || payment.date
                                    });
                                    setPaymentDialogOpen(true);
                                  }}
                                  data-testid={`button-pay-now-${payment.id}`}
                                >
                                  Pay Now
                                </Button>
                              )}
                              
                              {(payment.status === 'paid' || payment.status === 'succeeded' || payment.status === 'completed') && payment.receiptUrl && (
                                <Button size="sm" variant="outline" asChild>
                                  <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                                    <FileText className="mr-2 h-4 w-4" />
                                    Receipt
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {payment.discountSnapshot && payment.discountSnapshot.discountTotal > 0 && (
                          <TableRow className="bg-green-50 hover:bg-green-100" data-testid={`discount-row-${payment.id}`}>
                            <TableCell colSpan={6} className="py-2">
                              <Collapsible>
                                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-800 cursor-pointer w-full" data-testid={`collapsible-trigger-discount-${payment.id}`}>
                                  <ChevronDown className="h-4 w-4 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                                  <span>Discounts Applied: -{formatCurrency(payment.discountSnapshot.discountTotal)}</span>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-2 ml-6">
                                  <div className="space-y-1 bg-green-100 p-3 rounded-md">
                                    <div className="flex justify-between items-center text-sm">
                                      <span className="text-gray-600">Original Subtotal</span>
                                      <span>{formatCurrency(payment.discountSnapshot.subtotal)}</span>
                                    </div>
                                    {payment.discountSnapshot.appliedDiscounts.map((discount: any, discountIndex: number) => (
                                      <div key={discountIndex} className="flex justify-between items-center text-sm text-green-700">
                                        <span className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-xs bg-green-100 border-green-300">
                                            {discount.source === 'promo' ? 'Promo' : 
                                             discount.source === 'sibling' ? 'Sibling' :
                                             discount.source === 'free_after_threshold' ? 'Family' :
                                             discount.source === 'bundle' ? 'Bundle' :
                                             discount.source === 'automatic' ? 'Auto' : 'Discount'}
                                          </Badge>
                                          {discount.name}
                                          {discount.code && <span className="text-xs text-gray-500">({discount.code})</span>}
                                        </span>
                                        <span className="font-medium">-{formatCurrency(discount.amount)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between items-center text-sm font-semibold border-t border-green-200 pt-2 mt-2">
                                      <span>Total Savings</span>
                                      <span className="text-green-700">-{formatCurrency(payment.discountSnapshot.discountTotal)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-semibold">
                                      <span>Amount Paid</span>
                                      <span>{formatCurrency(payment.amount)}</span>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </TableCell>
                          </TableRow>
                        )}
                        {(payment.metadata?.creditsApplied ?? 0) > 0 && (
                          <TableRow className="bg-purple-50 hover:bg-purple-100" data-testid={`credits-row-${payment.id}`}>
                            <TableCell colSpan={6} className="py-2">
                              <Collapsible>
                                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-800 cursor-pointer w-full">
                                  <ChevronDown className="h-4 w-4 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                                  <span>Credits Applied: -{formatCurrency(payment.metadata?.creditsApplied ?? 0)}</span>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-2 ml-6">
                                  <div className="space-y-1 bg-purple-100 p-3 rounded-md">
                                    {payment.metadata?.creditAllocation ? (
                                      <>
                                        {payment.metadata.creditAllocation.enrollmentCredits > 0 && (
                                          <div className="flex justify-between items-center text-sm text-purple-700">
                                            <span className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-xs bg-purple-100 border-purple-300">Classes</Badge>
                                              Enrollment Credits
                                            </span>
                                            <span className="font-medium">-{formatCurrency(payment.metadata.creditAllocation.enrollmentCredits)}</span>
                                          </div>
                                        )}
                                        {payment.metadata.creditAllocation.membershipCredits > 0 && (
                                          <div className="flex justify-between items-center text-sm text-purple-700">
                                            <span className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-xs bg-purple-100 border-purple-300">Membership</Badge>
                                              Membership Fee
                                            </span>
                                            <span className="font-medium">-{formatCurrency(payment.metadata.creditAllocation.membershipCredits)}</span>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="flex justify-between items-center text-sm text-purple-700">
                                        <span>Credits Used</span>
                                        <span className="font-medium">-{formatCurrency(payment.metadata?.creditsApplied ?? 0)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between items-center text-sm font-semibold border-t border-purple-200 pt-2 mt-2">
                                      <span>Total Credits Used</span>
                                      <span className="text-purple-700">-{formatCurrency(payment.metadata?.creditsApplied ?? 0)}</span>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stripe Payments Tab */}
        <TabsContent value="stripe-payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stripe Payment History</CardTitle>
              <CardDescription>View all payments processed through Stripe (membership subscriptions)</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingStripePayments ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading Stripe payment history...</p>
                </div>
              ) : stripePayments && stripePayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No Stripe payments found</p>
                  <p className="text-sm mt-2">Stripe payments will appear here once you have active subscriptions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Subscription ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stripePayments?.map((payment: any) => (
                      <TableRow key={payment.id} data-testid={`row-stripe-payment-${payment.id}`}>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                            {formatDate(payment.createdDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{payment.description || 'Stripe Payment'}</div>
                            {payment.paymentIntentId && (
                              <div className="text-xs text-muted-foreground mt-1">
                                ID: {payment.paymentIntentId}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground capitalize">
                            {payment.paymentMethod || 'Unknown'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{formatCurrency(payment.amount)}</span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(payment.status)}
                        </TableCell>
                        <TableCell>
                          {payment.subscriptionId ? (
                            <div className="text-xs text-muted-foreground font-mono">
                              {payment.subscriptionId}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Upcoming Payments Tab */}
        <TabsContent value="upcoming" className="space-y-4">
          {/* Auto Pay status strip */}
          {!autoPayStatusData ? (
            <div className="h-9 rounded-md border border-border bg-muted/30 animate-pulse" />
          ) : autoPayEnabled ? (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50/50 px-3 py-2 text-sm">
              <Zap className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-green-800 font-medium">Auto Pay is active</span>
              <span className="mx-1 text-green-600">·</span>
              <Link href="/payment-methods" className="text-green-700 underline underline-offset-2 hover:text-green-900">
                Manage in Payment Methods
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Payments are manual</span>
              <span className="mx-1 text-muted-foreground">·</span>
              <Link href="/payment-methods" className="text-primary underline underline-offset-2 hover:opacity-80">
                Enable Auto Pay
              </Link>
            </div>
          )}

          {isLoading || isLoadingDbScheduled || isLoadingGrouped ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading upcoming payments...</p>
            </div>
          ) : (() => {
            const groups = groupedPayments || [];
            const hasMultiplePaymentsInAnyGroup = groups.some((g: any) => g.paymentCount > 1);

            // Filter out enrollments that already have a scheduled installment row,
            // so we never double-show "What you owe" alongside the scheduled group.
            const scheduledEnrollmentIds = new Set<number>(
              (dbScheduledPayments || [])
                .map((p: any) => p.enrollmentId)
                .filter((id: any): id is number => typeof id === 'number'),
            );
            const unpaidWithoutScheduled = payOutstandingEnrollments.filter(
              (e) => !scheduledEnrollmentIds.has(e.id),
            );
            const unpaidTotalCents = unpaidWithoutScheduled.reduce(
              (sum, e) => sum + e.effectiveBalance,
              0,
            );

            if (groups.length === 0 && unpaidWithoutScheduled.length === 0) {
              return (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p>No upcoming payments scheduled</p>
                  <p className="text-sm mt-1">All your payments are currently up to date</p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {unpaidWithoutScheduled.length > 0 && (
                  <Card className="border-l-4 border-l-blue-500" data-testid="card-what-you-owe">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            What you owe
                          </CardTitle>
                          <CardDescription>
                            {unpaidWithoutScheduled.length} unpaid enrollment
                            {unpaidWithoutScheduled.length === 1 ? '' : 's'}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(unpaidTotalCents)}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {unpaidWithoutScheduled.map((e) => (
                          <div
                            key={e.id}
                            className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-muted/50 rounded-lg gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-orange-100 text-orange-700 shrink-0">
                                <DollarSign className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-medium text-sm truncate">
                                    {e.childName}
                                  </h4>
                                  <Badge
                                    variant="outline"
                                    className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                                  >
                                    Class Enrollment
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {e.className}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 sm:justify-end">
                              <p className="font-medium">
                                {formatCurrency(e.effectiveBalance)}
                              </p>
                              <Button
                                size="sm"
                                onClick={() => payOutstanding([e])}
                                data-testid={`button-pay-unpaid-enrollment-${e.id}`}
                              >
                                Pay Now
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {unpaidWithoutScheduled.length > 1 && (
                        <div className="mt-4">
                          <Button
                            className="w-full bg-green-600 hover:bg-green-700"
                            onClick={() => payOutstanding(unpaidWithoutScheduled)}
                            data-testid="button-pay-all-unpaid"
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Pay All ({formatCurrency(unpaidTotalCents)})
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {hasMultiplePaymentsInAnyGroup && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <Users className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-700">
                      <strong>Family Payments Available!</strong> You have multiple payments due on the same date. 
                      Use "Pay All" to combine them into a single transaction.
                    </AlertDescription>
                  </Alert>
                )}

                {groups.map((group: any) => (
                  <Card key={group.dueDate} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Due: {group.dueDateFormatted}
                          </CardTitle>
                          <CardDescription>
                            {group.paymentCount} payment{group.paymentCount > 1 ? 's' : ''} due
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(group.totalAmount)}
                          </div>
                          {group.paymentCount > 1 && (
                            <Badge variant="secondary" className="mt-1 bg-blue-100 text-blue-700">
                              <Users className="h-3 w-3 mr-1" />
                              Combined
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {group.payments.map((payment: any) => (
                          <div key={payment.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-blue-100 text-blue-700">
                                <Calendar className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-medium text-sm">{payment.childName || 'Child'}</h4>
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                    Class Enrollment
                                  </Badge>
                                  {autoPayEnabled && (
                                    <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                                      <Zap className="h-2.5 w-2.5 mr-1" />
                                      Auto
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {payment.className || 'Class'} - Installment {payment.installmentNumber}/{payment.totalInstallments}
                                  {payment.paymentPlan && <span> ({payment.paymentPlan})</span>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="font-medium">{formatCurrency(payment.amount)}</p>
                              {group.paymentCount === 1 && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPaymentForDialog({
                                      id: payment.id,
                                      amount: payment.amount,
                                      description: payment.description || `${payment.className} - ${payment.childName}`,
                                      programName: payment.className,
                                      childName: payment.childName,
                                      dueDate: group.dueDate,
                                      installmentNumber: payment.installmentNumber,
                                      totalInstallments: payment.totalInstallments,
                                      paymentPlan: payment.paymentPlan
                                    });
                                    setPaymentDialogOpen(true);
                                  }}
                                  data-testid={`button-pay-upcoming-${payment.id}`}
                                >
                                  Pay Now
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {group.paymentCount > 1 && (
                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                          <Button
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setSelectedCombinedGroup(group);
                              setSelectedCombinedPayments(group.payments);
                              setCombinedDialogOpen(true);
                            }}
                            data-testid={`button-pay-all-${group.dueDate}`}
                          >
                            <Users className="h-4 w-4 mr-2" />
                            Pay All Due {group.dueDateFormatted} ({formatCurrency(group.totalAmount)})
                          </Button>
                          {group.payments.map((payment: any) => (
                            <Button
                              key={payment.id}
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPaymentForDialog({
                                  id: payment.id,
                                  amount: payment.amount,
                                  description: payment.description || `${payment.className} - ${payment.childName}`,
                                  programName: payment.className,
                                  childName: payment.childName,
                                  dueDate: group.dueDate,
                                  installmentNumber: payment.installmentNumber,
                                  totalInstallments: payment.totalInstallments,
                                  paymentPlan: payment.paymentPlan
                                });
                                setPaymentDialogOpen(true);
                              }}
                              data-testid={`button-pay-individual-${payment.id}`}
                            >
                              Pay {payment.childName} Only
                            </Button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {/* Credits Tab */}
        <TabsContent value="credits" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-amber-600" />
                    Your Credits
                  </CardTitle>
                  <CardDescription>View and manage your credit balance</CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Available Balance</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {creditsData?.totalAvailableFormatted || '$0.00'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingCredits ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading credits...</p>
                </div>
              ) : !creditsData?.credits || creditsData.credits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Coins className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p>No credits on your account</p>
                  <p className="text-sm mt-2">Credits can be earned through volunteer work, referrals, and other activities.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditsData.credits.map((credit: any) => (
                        <TableRow key={credit.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {credit.creditType?.replace(/_/g, ' ') || 'Credit'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="font-medium truncate">{credit.title || 'Credit'}</p>
                          </TableCell>
                          <TableCell className="font-medium">{formatCurrency(credit.creditAmountCents)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {credit.usedAmountCents > 0 ? formatCurrency(credit.usedAmountCents) : '-'}
                          </TableCell>
                          <TableCell className={(credit.remainingCents || 0) > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                            {formatCurrency(credit.remainingCents || 0)}
                          </TableCell>
                          <TableCell>
                            {credit.status === 'approved' && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>}
                            {credit.status === 'partially_used' && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Partially Used</Badge>}
                            {credit.status === 'used' && <Badge variant="secondary">Fully Used</Badge>}
                            {credit.status === 'pending' && <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Pending Approval</Badge>}
                            {credit.status === 'expired' && <Badge variant="destructive">Expired</Badge>}
                            {credit.status === 'rejected' && <Badge variant="destructive">Rejected</Badge>}
                            {credit.status === 'revoked' && <Badge variant="destructive">Revoked</Badge>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {credit.expiresAt 
                              ? formatDate(credit.expiresAt)
                              : <span className="text-green-600">Never</span>}
                          </TableCell>
                        </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Stripe Payment Dialog */}
      {selectedPaymentForDialog && (
        <ScheduledPaymentDialog
          payment={selectedPaymentForDialog}
          isOpen={paymentDialogOpen}
          onClose={() => {
            setPaymentDialogOpen(false);
            setSelectedPaymentForDialog(null);
          }}
          onSuccess={() => {
            refetch();
            refetchDbScheduledPayments();
            refetchGrouped();
          }}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
      )}

      {/* Combined Payment Dialog */}
      {selectedCombinedGroup && (
        <CombinedPaymentDialog
          payments={selectedCombinedPayments}
          group={selectedCombinedGroup}
          isOpen={combinedDialogOpen}
          onClose={() => {
            setCombinedDialogOpen(false);
            setSelectedCombinedGroup(null);
            setSelectedCombinedPayments([]);
          }}
          onSuccess={() => {
            refetch();
            refetchDbScheduledPayments();
            refetchGrouped();
          }}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}

