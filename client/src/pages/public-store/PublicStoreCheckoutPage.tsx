import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/SupabaseProvider";
import { useToast } from "@/hooks/use-toast";
import { loadStoreCart, saveStoreCart, type StoreCartState } from "@/lib/store-cart";
import { StoreCartReview } from "@/components/store/StoreCartReview";
import { normalizeParentChildrenResponse } from "@/lib/parent-children-api";

type SnapshotLine = {
  lineId: string;
  title: string;
  fulfillment: "paid" | "waitlist";
  lineTotalCents: number;
  waitlistPosition?: number | null;
  listingType: string;
};

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

  const [parent, setParent] = useState({
    firstName: (user as any)?.firstName ?? "",
    lastName: (user as any)?.lastName ?? "",
    email: user?.email ?? "",
    phone: "",
  });

  const [childAssignments, setChildAssignments] = useState<
    Record<string, { childId?: number; draft?: { firstName: string; lastName: string; birthdate: string; gradeLevel: string } }>
  >({});

  const programLines = cart.lines.filter((l) => l.listingType !== "product");

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <Link href={`/store/${schoolSlug}`} className="text-sm text-blue-700 underline">
            Back to store
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">
          Step {step} of {maxStep}
        </p>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Cart review</CardTitle>
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
              <CardTitle>Parent contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First name</Label>
                  <Input
                    value={parent.firstName}
                    onChange={(e) => setParent({ ...parent, firstName: e.target.value })}
                    data-testid="store-checkout-parent-first-name"
                  />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input
                    value={parent.lastName}
                    onChange={(e) => setParent({ ...parent, lastName: e.target.value })}
                    data-testid="store-checkout-parent-last-name"
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={parent.email}
                  onChange={(e) => setParent({ ...parent, email: e.target.value })}
                  data-testid="store-checkout-parent-email"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={parent.phone}
                  onChange={(e) => setParent({ ...parent, phone: e.target.value })}
                  data-testid="store-checkout-parent-phone"
                />
              </div>
              <Button className="w-full" onClick={() => setStep(hasPrograms ? 3 : maxStep)} data-testid="store-checkout-step2-continue">
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 3 && hasPrograms && (
          <Card>
            <CardHeader>
              <CardTitle>Children</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {!isAuthenticated && (
                <p className="text-sm">
                  <Link
                    href={`/login?returnTo=${encodeURIComponent(`/store/${schoolSlug}/checkout`)}`}
                    className="text-blue-700 underline"
                  >
                    Sign in to use saved children
                  </Link>
                </p>
              )}
              {programLines.map((line) => (
                <div key={line.lineId} className="border rounded-lg p-4 space-y-3">
                  <p className="font-medium text-sm">{line.title}</p>
                  {isAuthenticated && children.length > 0 ? (
                    <Select
                      value={childAssignments[line.lineId]?.childId?.toString() ?? ""}
                      onValueChange={(v) =>
                        setChildAssignments((prev) => ({
                          ...prev,
                          [line.lineId]: { childId: parseInt(v, 10) },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select child" />
                      </SelectTrigger>
                      <SelectContent>
                        {children.map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.firstName} {c.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="First name"
                        data-testid="store-checkout-child-first-name"
                        onChange={(e) =>
                          setChildAssignments((prev) => ({
                            ...prev,
                            [line.lineId]: {
                              ...prev[line.lineId],
                              draft: {
                                ...(prev[line.lineId]?.draft ?? {
                                  firstName: "",
                                  lastName: "",
                                  birthdate: "",
                                  gradeLevel: "",
                                }),
                                firstName: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                      <Input
                        placeholder="Last name"
                        data-testid="store-checkout-child-last-name"
                        onChange={(e) =>
                          setChildAssignments((prev) => ({
                            ...prev,
                            [line.lineId]: {
                              ...prev[line.lineId],
                              draft: {
                                ...(prev[line.lineId]?.draft ?? {
                                  firstName: "",
                                  lastName: "",
                                  birthdate: "",
                                  gradeLevel: "",
                                }),
                                lastName: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                      <Input
                        type="date"
                        placeholder="Birthdate"
                        data-testid="store-checkout-child-birthdate"
                        onChange={(e) =>
                          setChildAssignments((prev) => ({
                            ...prev,
                            [line.lineId]: {
                              ...prev[line.lineId],
                              draft: {
                                ...(prev[line.lineId]?.draft ?? {
                                  firstName: "",
                                  lastName: "",
                                  birthdate: "",
                                  gradeLevel: "",
                                }),
                                birthdate: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                      <Input
                        placeholder="Grade"
                        data-testid="store-checkout-child-grade"
                        onChange={(e) =>
                          setChildAssignments((prev) => ({
                            ...prev,
                            [line.lineId]: {
                              ...prev[line.lineId],
                              draft: {
                                ...(prev[line.lineId]?.draft ?? {
                                  firstName: "",
                                  lastName: "",
                                  birthdate: "",
                                  gradeLevel: "",
                                }),
                                gradeLevel: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button className="w-full" onClick={() => setStep(4)} data-testid="store-checkout-step3-continue">
                Continue to payment
              </Button>
            </CardContent>
          </Card>
        )}

        {step === maxStep && (
          <Card>
            <CardHeader>
              <CardTitle>Pay in full</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(snapshot?.lines as SnapshotLine[] | undefined)?.map((line) => (
                <div key={line.lineId} className="flex justify-between text-sm">
                  <span>
                    {line.title}
                    {line.fulfillment === "waitlist" && (
                      <span className="text-amber-700 ml-1">(Waitlist — no charge)</span>
                    )}
                  </span>
                  <span>${(line.lineTotalCents / 100).toFixed(2)}</span>
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
