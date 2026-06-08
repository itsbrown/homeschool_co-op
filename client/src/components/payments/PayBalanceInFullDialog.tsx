import React, { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2, CreditCard } from "lucide-react";
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

export type PayInFullTarget = {
  enrollmentIds: number[];
  totalAmountCents: number;
  title: string;
  subtitle?: string;
};

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
              Pay ${(amountCents / 100).toFixed(2)}
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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !target) {
      setClientSecret(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      setClientSecret(null);
      try {
        const response = await apiRequest("POST", "/api/billing/pay-balance", {
          enrollmentIds: target.enrollmentIds,
          paymentPlan: "full_payment",
          totalAmount: target.totalAmountCents,
        });
        const data = await response.json();
        if (!response.ok || !data.clientSecret) {
          throw new Error(data.error || data.message || "Could not start payment");
        }
        if (!cancelled) setClientSecret(data.clientSecret);
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
  }, [isOpen, target?.enrollmentIds.join(","), target?.totalAmountCents]);

  const handleSuccess = () => {
    toast({
      title: "Payment successful",
      description: "Your balance has been paid in full. Remaining installments were cleared.",
    });
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
              ? ` · One payment of $${(target.totalAmountCents / 100).toFixed(2)} closes the balance and clears future installments on this plan.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Preparing secure checkout…
          </div>
        )}

        {error && !isLoading && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {clientSecret && !isLoading && !error && target && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PayInFullForm
              amountCents={target.totalAmountCents}
              enrollmentIds={target.enrollmentIds}
              onSuccess={handleSuccess}
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
