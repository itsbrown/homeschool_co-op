import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/config/stripe";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditCard, Plus, Star, Trash2, Loader2, CheckCircle, Zap } from "lucide-react";

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | undefined;
  expYear: number | undefined;
  isDefault: boolean;
}

interface CardManagementPanelProps {
  targetUserId?: number;
  targetUserName?: string;
  onCardsChanged?: () => void;
}

function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !ready) return;
    setIsSubmitting(true);

    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (error) {
      toast({ title: "Card not saved", description: error.message || "Failed to save card.", variant: "destructive" });
      setIsSubmitting(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement onReady={() => setReady(true)} onLoadError={() => setReady(false)} />
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || isSubmitting} className="flex-1">
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
          ) : (
            <><CheckCircle className="h-4 w-4 mr-2" />Save Card</>
          )}
        </Button>
      </div>
    </form>
  );
}

export default function CardManagementPanel({
  targetUserId,
  targetUserName,
  onCardsChanged,
}: CardManagementPanelProps) {
  const { toast } = useToast();
  const isAdminMode = targetUserId !== undefined;

  const listQueryKey = isAdminMode
    ? ["/api/admin/users", targetUserId, "payment-methods"]
    : ["/api/user/payment-methods"];

  const setupIntentEndpoint = isAdminMode
    ? `/api/admin/users/${targetUserId}/setup-intent`
    : "/api/user/setup-intent";

  const { data, isLoading } = useQuery<{
    paymentMethods: SavedCard[];
    defaultPaymentMethodId: string | null;
  }>({
    queryKey: listQueryKey,
  });

  const [addCardOpen, setAddCardOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingSetupIntent, setLoadingSetupIntent] = useState(false);

  const openAddCard = async () => {
    setLoadingSetupIntent(true);
    try {
      const res = await apiRequest("POST", setupIntentEndpoint, {});
      const data = await res.json();
      if (!data.clientSecret) throw new Error("No client secret returned");
      setClientSecret(data.clientSecret);
      setAddCardOpen(true);
    } catch (err: any) {
      toast({ title: "Could not open card form", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoadingSetupIntent(false);
    }
  };

  const handleCardAdded = () => {
    setAddCardOpen(false);
    setClientSecret(null);
    queryClient.invalidateQueries({ queryKey: listQueryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/user/payment-method"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user/auto-pay-status"] });
    toast({ title: "Card saved successfully" });
    onCardsChanged?.();
  };

  const handleAddCardClose = () => {
    setAddCardOpen(false);
    setClientSecret(null);
  };

  const removeMutation = useMutation({
    mutationFn: (pmId: string) => {
      const endpoint = isAdminMode
        ? `/api/admin/users/${targetUserId}/payment-methods/${pmId}`
        : `/api/user/payment-methods/${pmId}`;
      return apiRequest("DELETE", endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/user/payment-method"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/auto-pay-status"] });
      toast({ title: "Card removed" });
      onCardsChanged?.();
    },
    onError: (err: any) => {
      toast({ title: "Remove failed", description: err?.message || "Failed to remove card", variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (pmId: string) => {
      const endpoint = isAdminMode
        ? `/api/admin/users/${targetUserId}/payment-methods/${pmId}/default`
        : `/api/user/payment-methods/${pmId}/default`;
      return apiRequest("PATCH", endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/user/payment-method"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/auto-pay-status"] });
      toast({ title: "Default card updated" });
      onCardsChanged?.();
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message || "Failed to update default card", variant: "destructive" });
    },
  });

  const autoPayQueryKey = ['/api/user/auto-pay-status'];

  const { data: autoPayStatusData, isLoading: isLoadingAutoPay } = useQuery<{ autoPayEnabled: boolean }>({
    queryKey: autoPayQueryKey,
    enabled: !isAdminMode,
  });

  const toggleAutoPayMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest('PATCH', '/api/user/auto-pay', { enabled }),
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: autoPayQueryKey });
      toast({ title: enabled ? 'Auto Pay enabled' : 'Auto Pay disabled' });
    },
    onError: async (err: any) => {
      let message = 'Unable to update auto-pay setting.';
      try {
        const body = await err.json?.();
        if (body?.error) message = body.error;
        else if (body?.message) message = body.message;
      } catch {}
      toast({ title: 'Auto Pay update failed', description: message, variant: 'destructive' });
    },
  });

  const cards = data?.paymentMethods ?? [];
  const isMutating = removeMutation.isPending || setDefaultMutation.isPending;
  const defaultCard = cards.find((c) => c.isDefault) ?? null;
  const autoPayEnabled = autoPayStatusData?.autoPayEnabled ?? false;

  return (
    <div className="space-y-3">
      {isAdminMode && targetUserName && (
        <p className="text-sm text-muted-foreground">
          Managing cards for <span className="font-medium">{targetUserName}</span>
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : cards.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <CreditCard className="h-4 w-4 shrink-0" />
          <span>No saved cards yet.</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {cards.map((card) => (
            <li
              key={card.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                card.isDefault
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-background"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium capitalize">
                    {card.brand} ···· {card.last4}
                  </span>
                  {card.expMonth && card.expYear && (
                    <span className="text-xs text-muted-foreground ml-2">
                      Expires {card.expMonth}/{card.expYear}
                    </span>
                  )}
                </div>
                {card.isDefault && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs shrink-0">
                    <Star className="h-3 w-3 mr-1" />
                    Default
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                {!card.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={isMutating}
                    onClick={() => setDefaultMutation.mutate(card.id)}
                    title="Set as default"
                  >
                    {setDefaultMutation.isPending && setDefaultMutation.variables === card.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Star className="h-3 w-3" />
                    )}
                    <span className="ml-1 hidden sm:inline">Default</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  disabled={isMutating}
                  onClick={() => removeMutation.mutate(card.id)}
                  title="Remove card"
                >
                  {removeMutation.isPending && removeMutation.variables === card.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={openAddCard}
        disabled={loadingSetupIntent || isMutating}
        className="w-full"
      >
        {loadingSetupIntent ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Add Card
      </Button>

      {!isAdminMode && (
        <>
          <Separator className="my-1" />
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Auto Pay</span>
              {autoPayEnabled ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Off</Badge>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground leading-snug">
                Automatically charge your default card on each installment's due date.
              </p>
              {isLoadingAutoPay ? (
                <Skeleton className="h-5 w-9 rounded-full shrink-0" />
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="shrink-0">
                        <Switch
                          checked={autoPayEnabled}
                          onCheckedChange={(checked) => toggleAutoPayMutation.mutate(checked)}
                          disabled={(!defaultCard && !autoPayEnabled) || toggleAutoPayMutation.isPending}
                          aria-label="Toggle Auto Pay"
                        />
                      </span>
                    </TooltipTrigger>
                    {!defaultCard && !autoPayEnabled && (
                      <TooltipContent>
                        <p>Set a default card above to enable auto-pay</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {defaultCard && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                <span className="capitalize">{defaultCard.brand} ···· {defaultCard.last4}</span>
                {defaultCard.expMonth && defaultCard.expYear && (
                  <span>· Expires {defaultCard.expMonth}/{defaultCard.expYear}</span>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={addCardOpen} onOpenChange={(open) => !open && handleAddCardClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Card</DialogTitle>
            <DialogDescription>
              {isAdminMode && targetUserName
                ? `Add a saved card for ${targetUserName}. No charge will be made now.`
                : "Save a card for future payments. No charge will be made now."}
            </DialogDescription>
          </DialogHeader>

          {clientSecret ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: { theme: "stripe", variables: { colorPrimary: "#1e3a5f" } },
              }}
            >
              <AddCardForm onSuccess={handleCardAdded} onCancel={handleAddCardClose} />
            </Elements>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
