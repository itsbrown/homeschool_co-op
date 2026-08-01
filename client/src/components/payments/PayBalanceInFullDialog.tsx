import React, { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2, CreditCard, Gift } from "lucide-react";
import { stripePromise } from "@/config/stripe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { finalizePaymentAfterStripeSuccess } from "@/lib/finalizePaymentAfterStripeSuccess";
import { useParentCredits } from "@/hooks/useParentCredits";
import { computeManualPayDisplay } from "@/utils/parentBalance";
import { refreshPostPaymentState } from "@/lib/postPaymentRefresh";

export type PayInFullTarget = {
  enrollmentIds: number[];
  totalAmountCents: number;
  title: string;
  subtitle?: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function PayInFullForm({
  amountCents,
  enrollmentIds,
  onSuccess,
  onCancel,
  onError,
}: {
  amountCents: number;
  enrollmentIds: number[];
  onSuccess: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || !elementsReady) return;
    setIsProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/payments` },
        redirect: "if_required",
      });
      if (error) {
        onError(error.message || "Payment failed");
        return;
      }
      if (paymentIntent?.status === "succeeded") {
        await finalizePaymentAfterStripeSuccess(queryClient, {
          paymentIntentId: paymentIntent.id,
          enrollmentIds,
        });
        onSuccess();
      } else {
        onError("Payment did not complete. Check your payment history.");
      }
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement onReady={() => setElementsReady(true)} />
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || !elementsReady || isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay {formatCurrency(amountCents)}
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

type PayBalanceInFullDialogProps = {
  target: PayInFullTarget | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function PayBalanceInFullDialog({
  target,
  isOpen,
  onClose,
  onSuccess,
}: PayBalanceInFullDialogProps) {
  const { toast } = useToast();
  const { totalAvailableCents } = useParentCredits();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [chargeAmountCents, setChargeAmountCents] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyCredits, setApplyCredits] = useState(true);
  const [creditsOnlySuccess, setCreditsOnlySuccess] = useState(false);
  const dialogSessionKeyRef = React.useRef<string | null>(null);

  const payDisplay = computeManualPayDisplay({
    amount: target?.totalAmountCents ?? 0,
    availableCredits: totalAvailableCents,
    applyCredits: totalAvailableCents > 0 ? applyCredits : false,
  });

  useEffect(() => {
    if (!isOpen || !target) {
      dialogSessionKeyRef.current = null;
      setClientSecret(null);
      setError(null);
      setCreditsOnlySuccess(false);
      return;
    }
    const key = target.enrollmentIds.join(",");
    if (dialogSessionKeyRef.current !== key) {
      dialogSessionKeyRef.current = key;
      setApplyCredits(totalAvailableCents > 0);
      setCreditsOnlySuccess(false);
      setClientSecret(null);
      setError(null);
    }
  }, [isOpen, target, totalAvailableCents]);

  useEffect(() => {
    if (!isOpen || !target || creditsOnlySuccess) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      setClientSecret(null);
      try {
        const display = computeManualPayDisplay({
          amount: target.totalAmountCents,
          availableCredits: totalAvailableCents,
          applyCredits: totalAvailableCents > 0 ? applyCredits : false,
        });

        const response = await apiRequest("POST", "/api/billing/pay-balance", {
          enrollmentIds: target.enrollmentIds,
          paymentPlan: "full_payment",
          totalAmount: target.totalAmountCents,
          applyCredits: totalAvailableCents > 0 ? applyCredits : false,
          expectedChargeAmount: display.amountAfterCredits,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || data.message || "Could not start payment");
        }

        if (data.mode === "credits_only") {
          if (!cancelled) {
            setCreditsOnlySuccess(true);
            setChargeAmountCents(0);
          }
          return;
        }

        if (!data.clientSecret) {
          throw new Error(data.error || data.message || "Could not start payment");
        }
        if (!cancelled) {
          setClientSecret(data.clientSecret);
          setChargeAmountCents(display.amountAfterCredits);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Could not start payment";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    target?.enrollmentIds.join(","),
    target?.totalAmountCents,
    applyCredits,
    totalAvailableCents,
    creditsOnlySuccess,
  ]);

  const handleSuccess = async () => {
    toast({
      title: creditsOnlySuccess ? "Paid with credits" : "Payment successful",
      description: creditsOnlySuccess
        ? "Your balance was fully covered by available credits. Remaining installments were cleared."
        : "Your balance has been paid in full. Remaining installments were cleared.",
    });
    await refreshPostPaymentState(queryClient);
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay in full</DialogTitle>
          <DialogDescription>
            {target?.title}
            {target?.subtitle ? ` — ${target.subtitle}` : ""}
            {target
              ? ` · Balance of ${formatCurrency(target.totalAmountCents)} — close it in one payment and clear future installments on this plan.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Balance due</span>
              <span className="font-medium">{formatCurrency(target.totalAmountCents)}</span>
            </div>
            {totalAvailableCents > 0 && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <label htmlFor="pay-in-full-apply-credits" className="cursor-pointer flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-emerald-700" />
                  Apply available credits ({formatCurrency(totalAvailableCents)})
                </label>
                <input
                  id="pay-in-full-apply-credits"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={applyCredits}
                  onChange={(e) => setApplyCredits(e.target.checked)}
                  data-testid="checkbox-pay-in-full-apply-credits"
                />
              </div>
            )}
            {payDisplay.creditsToApply > 0 && (
              <div className="space-y-1 pt-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Credits applied</span>
                  <span className="text-emerald-800 font-medium">
                    −{formatCurrency(payDisplay.creditsToApply)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Card charge</span>
                  <span>{formatCurrency(payDisplay.amountAfterCredits)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {creditsOnlySuccess && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Paid with credits</p>
            <p className="mt-1">
              This balance was fully covered by your available credits. No card charge was required.
            </p>
            <Button className="mt-4 w-full" type="button" onClick={() => void handleSuccess()}>
              Done
            </Button>
          </div>
        )}

        {isLoading && !creditsOnlySuccess && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Preparing secure checkout…
          </div>
        )}

        {error && !isLoading && !creditsOnlySuccess && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {clientSecret && !isLoading && !error && !creditsOnlySuccess && target && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PayInFullForm
              amountCents={chargeAmountCents}
              enrollmentIds={target.enrollmentIds}
              onSuccess={() => void handleSuccess()}
              onCancel={onClose}
              onError={(message) => {
                setError(message);
                toast({ title: "Payment failed", description: message, variant: "destructive" });
              }}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
