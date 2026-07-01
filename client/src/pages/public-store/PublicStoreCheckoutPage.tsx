import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/SupabaseProvider";
import { useToast } from "@/hooks/use-toast";
import { loadStoreCart, saveStoreCart, type StoreCartState } from "@/lib/store-cart";
import { StoreCartReview } from "@/components/store/StoreCartReview";
import { StoreCheckoutChildFields } from "@/components/store/StoreCheckoutChildFields";
import { normalizeParentChildrenResponse } from "@/lib/parent-children-api";
import {
  isChildDraftComplete,
  isEmergencyContactComplete,
  isParentContactComplete,
  type StoreChildAssignment,
  type StoreEmergencyContact,
  type StoreParentContact,
} from "@/lib/store-checkout";

type SnapshotLine = {
  lineId: string;
  title: string;
  fulfillment: "paid" | "waitlist";
  lineTotalCents: number;
  waitlistPosition?: number | null;
  listingType: string;
};

type StoreInfo = {
  name: string;
  logo?: string | null;
};

const STEP_LABELS: Record<number, string> = {
  1: "Cart",
  2: "Contact",
  3: "Children",
  4: "Payment",
};

function CheckoutStepIndicator({ step, maxStep }: { step: number; maxStep: number }) {
  const labels =
    maxStep === 3
      ? ["Cart", "Contact", "Payment"]
      : ["Cart", "Contact", "Children", "Payment"];

  return (
    <ol className="flex items-center gap-2 text-xs sm:text-sm" aria-label="Checkout progress">
      {labels.map((label, index) => {
        const stepNum = index + 1;
        const active = step === stepNum;
        const done = step > stepNum;
        return (
          <li key={label} className="flex items-center gap-2 min-w-0">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                done
                  ? "bg-green-600 text-white"
                  : active
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {done ? "✓" : stepNum}
            </span>
            <span className={`truncate ${active ? "font-medium" : "text-muted-foreground"}`}>
              {label}
            </span>
            {index < labels.length - 1 && (
              <span className="hidden sm:inline text-muted-foreground">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function PublicStoreCheckoutPage() {
  const { schoolSlug = "" } = useParams<{ schoolSlug: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [cart, setCart] = useState<StoreCartState>(() => loadStoreCart(schoolSlug));

  useEffect(() => {
    saveStoreCart(cart);
  }, [cart]);

  const hasPrograms = cart.lines.some((l) => l.listingType !== "product");
  const [step, setStep] = useState(1);
  const maxStep = hasPrograms ? 4 : 3;

  const [parent, setParent] = useState<StoreParentContact>({
    firstName: (user as any)?.firstName ?? "",
    lastName: (user as any)?.lastName ?? "",
    email: user?.email ?? "",
    phone: "",
  });

  const [emergencyContact, setEmergencyContact] = useState<StoreEmergencyContact>({
    firstName: "",
    lastName: "",
    phone: "",
    relationship: "",
  });

  const [childAssignments, setChildAssignments] = useState<Record<string, StoreChildAssignment>>({});

  const programLines = cart.lines.filter((l) => l.listingType !== "product");

  const { data: store } = useQuery<StoreInfo>({
    queryKey: ["/api/public/store", schoolSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}`);
      if (!res.ok) throw new Error("Store not found");
      return res.json();
    },
  });

  const { data: children = [] } = useQuery({
    queryKey: ["/api/parent/children"],
    queryFn: async () => {
      const token = localStorage.getItem("supabase_token");
      const res = await fetch("/api/parent/children", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) return [];
      return normalizeParentChildrenResponse(await res.json());
    },
    enabled: isAuthenticated && hasPrograms,
  });

  const cartPayload = useMemo(
    () =>
      cart.lines.map((l) => ({
        lineId: l.lineId,
        listingId: l.listingId,
        listingType: l.listingType,
        sourceId: l.sourceId,
        quantity: l.quantity,
        variant: l.variant,
      })),
    [cart.lines],
  );

  const { data: snapshot, refetch: refetchSnapshot } = useQuery({
    queryKey: ["/api/public/store", schoolSlug, "snapshot", cartPayload],
    queryFn: async () => {
      const token = localStorage.getItem("supabase_token");
      const res = await fetch(`/api/public/store/${schoolSlug}/snapshot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cart: cartPayload }),
      });
      if (!res.ok) throw new Error("Failed to load totals");
      return res.json();
    },
    enabled: cart.lines.length > 0,
  });

  useEffect(() => {
    if (step === maxStep) refetchSnapshot();
  }, [step, maxStep, refetchSnapshot]);

  const setChildAssignment = (lineId: string, value: StoreChildAssignment) => {
    setChildAssignments((prev) => ({ ...prev, [lineId]: value }));
  };

  const copyFirstChildToAll = () => {
    const firstLineId = programLines[0]?.lineId;
    if (!firstLineId) return;
    const source = childAssignments[firstLineId];
    if (!source) return;
    const next: Record<string, StoreChildAssignment> = {};
    for (const line of programLines) {
      next[line.lineId] = { ...source };
    }
    setChildAssignments(next);
    toast({ title: "Applied to all programs", description: "The same child is assigned to each program." });
  };

  const validateStep2 = (): boolean => {
    if (!isParentContactComplete(parent)) {
      toast({
        title: "Contact information incomplete",
        description: "Please fill in your name, email, and phone number.",
        variant: "destructive",
      });
      return false;
    }
    if (hasPrograms && !isEmergencyContactComplete(emergencyContact)) {
      toast({
        title: "Emergency contact required",
        description: "Please provide an emergency contact for program enrollment.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    for (const line of programLines) {
      const assignment = childAssignments[line.lineId];
      if (assignment?.childId) continue;
      if (!isChildDraftComplete(assignment?.draft)) {
        toast({
          title: "Child information incomplete",
          description: `Please complete child details for ${line.title}.`,
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const submitCheckout = async () => {
    const token = localStorage.getItem("supabase_token");
    const assignments = programLines.map((line) => ({
      lineId: line.lineId,
      childId: childAssignments[line.lineId]?.childId,
      childDraft: childAssignments[line.lineId]?.draft,
    }));

    const res = await fetch(`/api/public/store/${schoolSlug}/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        cart: cartPayload,
        parent,
        emergencyContact: hasPrograms ? emergencyContact : undefined,
        childAssignments: assignments,
      }),
    });

    const data = await res.json();
    if (res.status === 409) {
      toast({
        title: "Sign in required",
        description: data.message,
        variant: "destructive",
      });
      setLocation(`/login?returnTo=${encodeURIComponent(`/store/${schoolSlug}/checkout`)}`);
      return;
    }
    if (!res.ok) {
      toast({ title: "Checkout failed", description: data.message, variant: "destructive" });
      return;
    }

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    if (data.successUrl) {
      setLocation(data.successUrl);
    }
  };

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p>Your cart is empty.</p>
        <Button asChild className="mt-4">
          <Link href={`/store/${schoolSlug}`}>Back to store</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-2xl px-4 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {store?.logo && (
              <img
                src={store.logo}
                alt=""
                className="h-10 w-10 rounded-full object-cover shrink-0"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold truncate">Checkout</h1>
              {store?.name && (
                <p className="text-sm text-muted-foreground truncate">{store.name}</p>
              )}
            </div>
          </div>
          <Link href={`/store/${schoolSlug}`} className="text-sm text-blue-700 underline shrink-0">
            Back to store
          </Link>
        </div>

        <CheckoutStepIndicator step={step} maxStep={maxStep} />
        <p className="text-sm text-muted-foreground">
          Step {step} of {maxStep}
          {STEP_LABELS[step] ? ` — ${STEP_LABELS[step]}` : ""}
        </p>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Review your cart</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StoreCartReview cart={cart} onCartChange={setCart} />
              <Button
                className="w-full"
                onClick={() => setStep(2)}
                disabled={cart.lines.length === 0}
                data-testid="store-checkout-step1-continue"
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Parent / guardian contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="store-checkout-parent-first-name">First name</Label>
                    <Input
                      id="store-checkout-parent-first-name"
                      value={parent.firstName}
                      onChange={(e) => setParent({ ...parent, firstName: e.target.value })}
                      autoComplete="given-name"
                      data-testid="store-checkout-parent-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="store-checkout-parent-last-name">Last name</Label>
                    <Input
                      id="store-checkout-parent-last-name"
                      value={parent.lastName}
                      onChange={(e) => setParent({ ...parent, lastName: e.target.value })}
                      autoComplete="family-name"
                      data-testid="store-checkout-parent-last-name"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="store-checkout-parent-email">Email</Label>
                  <Input
                    id="store-checkout-parent-email"
                    type="email"
                    value={parent.email}
                    onChange={(e) => setParent({ ...parent, email: e.target.value })}
                    autoComplete="email"
                    data-testid="store-checkout-parent-email"
                  />
                </div>
                <div>
                  <Label htmlFor="store-checkout-parent-phone">Phone</Label>
                  <Input
                    id="store-checkout-parent-phone"
                    type="tel"
                    value={parent.phone}
                    onChange={(e) => setParent({ ...parent, phone: e.target.value })}
                    autoComplete="tel"
                    data-testid="store-checkout-parent-phone"
                  />
                </div>
              </div>

              {hasPrograms && (
                <div className="space-y-3 pt-2 border-t">
                  <div>
                    <h3 className="font-medium">Emergency contact</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Required for program enrollment. This person can be reached if we cannot
                      reach you during an activity.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="store-checkout-emergency-first-name">First name</Label>
                      <Input
                        id="store-checkout-emergency-first-name"
                        value={emergencyContact.firstName}
                        onChange={(e) =>
                          setEmergencyContact({ ...emergencyContact, firstName: e.target.value })
                        }
                        data-testid="store-checkout-emergency-first-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="store-checkout-emergency-last-name">Last name</Label>
                      <Input
                        id="store-checkout-emergency-last-name"
                        value={emergencyContact.lastName}
                        onChange={(e) =>
                          setEmergencyContact({ ...emergencyContact, lastName: e.target.value })
                        }
                        data-testid="store-checkout-emergency-last-name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="store-checkout-emergency-phone">Phone</Label>
                      <Input
                        id="store-checkout-emergency-phone"
                        type="tel"
                        value={emergencyContact.phone}
                        onChange={(e) =>
                          setEmergencyContact({ ...emergencyContact, phone: e.target.value })
                        }
                        data-testid="store-checkout-emergency-phone"
                      />
                    </div>
                    <div>
                      <Label htmlFor="store-checkout-emergency-relationship">Relationship</Label>
                      <Input
                        id="store-checkout-emergency-relationship"
                        placeholder="e.g. Parent, Grandparent, Aunt"
                        value={emergencyContact.relationship}
                        onChange={(e) =>
                          setEmergencyContact({ ...emergencyContact, relationship: e.target.value })
                        }
                        data-testid="store-checkout-emergency-relationship"
                      />
                    </div>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => {
                  if (!validateStep2()) return;
                  setStep(hasPrograms ? 3 : maxStep);
                }}
                data-testid="store-checkout-step2-continue"
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 3 && hasPrograms && (
          <Card>
            <CardHeader>
              <CardTitle>Register children</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                {programLines.length === 1
                  ? "Tell us who will attend this program."
                  : "Each program needs its own child assignment. You can register a different child for each program, or use the same child for all."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAuthenticated && (
                <p className="text-sm rounded-md bg-blue-50 border border-blue-100 p-3">
                  <Link
                    href={`/login?returnTo=${encodeURIComponent(`/store/${schoolSlug}/checkout`)}`}
                    className="text-blue-700 underline font-medium"
                  >
                    Sign in
                  </Link>{" "}
                  to use children you have already registered.
                </p>
              )}
              {programLines.map((line, index) => (
                <StoreCheckoutChildFields
                  key={line.lineId}
                  lineId={line.lineId}
                  programTitle={line.title}
                  isAuthenticated={isAuthenticated}
                  children={children}
                  assignment={childAssignments[line.lineId]}
                  onChange={setChildAssignment}
                  showCopyHint={programLines.length > 1 && index === 0}
                  onCopyToAll={copyFirstChildToAll}
                />
              ))}
              <Button
                className="w-full"
                onClick={() => {
                  if (!validateStep3()) return;
                  setStep(4);
                }}
                data-testid="store-checkout-step3-continue"
              >
                Continue to payment
              </Button>
            </CardContent>
          </Card>
        )}

        {step === maxStep && (
          <Card>
            <CardHeader>
              <CardTitle>Payment summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(snapshot?.lines as SnapshotLine[] | undefined)?.map((line) => (
                <div key={line.lineId} className="flex justify-between text-sm gap-4">
                  <span>
                    {line.title}
                    {line.fulfillment === "waitlist" && (
                      <span className="text-amber-700 ml-1">(Waitlist — no charge)</span>
                    )}
                  </span>
                  <span className="shrink-0">${(line.lineTotalCents / 100).toFixed(2)}</span>
                </div>
              ))}
              {snapshot?.membershipTotalCents > 0 && (
                <div className="flex justify-between text-sm font-medium">
                  <span>Membership</span>
                  <span>${(snapshot.membershipTotalCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Total due today</span>
                <span>${((snapshot?.amountDueCents ?? 0) / 100).toFixed(2)}</span>
              </div>
              <Button className="w-full" onClick={submitCheckout} data-testid="store-checkout-submit">
                {snapshot?.amountDueCents > 0 ? "Pay with Stripe" : "Complete registration"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
