import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/SupabaseProvider";
import { useLocation } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeParentChildrenResponse } from "@/lib/parent-children-api";
import { ArrowLeft, ArrowRight, Check, Calendar, Clock, DollarSign, User, ShoppingCart, Sun, Sunrise, Loader2, AlertCircle } from "lucide-react";
import type { EnrollmentSession as Session } from "@shared/schema";

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ["Select Children", "Choose Sessions", "Schedule Type", "Review & Enroll"];

export default function SessionEnrollmentPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [selectedChildIds, setSelectedChildIds] = useState<number[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<"half_day" | "full_day" | null>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery<any[]>({
    queryKey: ["/api/parent/children"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/parent/children");
      if (!response.ok) throw new Error("Failed to fetch children");
      const data = await response.json();
      return normalizeParentChildrenResponse(data) as any[];
    },
  });

  const { data: openSessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/admin/sessions/open"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/sessions/open");
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (data: { childIds: number[]; sessionIds: number[]; variant: string }) => {
      const response = await apiRequest("POST", "/api/session-enrollments", data);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Enrollment failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
      const count = data.enrollments?.length || 0;
      const skippedCount = data.skipped?.length || 0;

      if (count > 0) {
        toast({
          title: `${count} enrollment(s) added to cart`,
          description: skippedCount > 0 ? `${skippedCount} skipped (already enrolled or no pricing)` : undefined,
        });
        setLocation("/cart");
      } else {
        toast({
          title: "No new enrollments",
          description: data.skipped?.join("; ") || "All selected children are already enrolled",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Enrollment failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleChild = (id: number) => {
    setSelectedChildIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSession = (id: number) => {
    setSelectedSessionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedSessions = openSessions.filter((s) => selectedSessionIds.includes(s.id));
  const selectedChildren = children.filter((c: any) => selectedChildIds.includes(c.id));

  const totalPrice = useMemo(() => {
    if (!selectedVariant) return 0;
    return selectedSessions.reduce((sum, s) => {
      const price = selectedVariant === "half_day" ? s.halfDayPrice : s.fullDayPrice;
      return sum + (price || 0);
    }, 0) * selectedChildren.length;
  }, [selectedSessions, selectedChildren, selectedVariant]);

  const canProceed = () => {
    switch (step) {
      case 1: return selectedChildIds.length > 0;
      case 2: return selectedSessionIds.length > 0;
      case 3: return selectedVariant !== null;
      case 4: return true;
    }
  };

  const handleNext = () => {
    if (step < 4) setStep((step + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleEnroll = () => {
    if (!selectedVariant) return;
    enrollMutation.mutate({
      childIds: selectedChildIds,
      sessionIds: selectedSessionIds,
      variant: selectedVariant,
    });
  };

  const hasHalfDay = selectedSessions.some((s) => s.halfDayPrice != null && s.halfDayPrice > 0);
  const hasFullDay = selectedSessions.some((s) => s.fullDayPrice != null && s.fullDayPrice > 0);

  return (
    <ParentAppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/programs")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Enroll in Sessions</h1>
            <p className="text-muted-foreground text-sm">Select children, sessions, and schedule type</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {STEP_LABELS.map((label, i) => {
            const stepNum = (i + 1) as Step;
            const isActive = step === stepNum;
            const isCompleted = step > stepNum;
            return (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
                    isCompleted ? "bg-green-600 text-white" : isActive ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <span className={`text-xs hidden sm:block ${isActive ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
                {i < 3 && <div className="flex-1 h-px bg-border" />}
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Select Children
              </CardTitle>
              <CardDescription>Choose which children to enroll</CardDescription>
            </CardHeader>
            <CardContent>
              {childrenLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : children.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No children found. Please register a child first.</p>
                  <Button className="mt-4" onClick={() => setLocation("/children/register")}>
                    Register a Child
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {children.map((child: any) => (
                    <div
                      key={child.id}
                      onClick={() => toggleChild(child.id)}
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedChildIds.includes(child.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox checked={selectedChildIds.includes(child.id)} />
                      <div>
                        <p className="font-medium">{child.firstName} {child.lastName}</p>
                        {child.grade && <p className="text-sm text-muted-foreground">Grade {child.grade}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Choose Sessions
              </CardTitle>
              <CardDescription>Select one or more enrollment periods</CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : openSessions.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No sessions are currently open for enrollment.</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                    Your school admin must create a session, turn on Enrollment Open, and set half-day or
                    full-day pricing. If you just registered, check back once your school publishes a session.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {openSessions.map((session) => (
                    <div
                      key={session.id}
                      data-testid={`session-option-${session.id}`}
                      onClick={() => toggleSession(session.id)}
                      className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedSessionIds.includes(session.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox checked={selectedSessionIds.includes(session.id)} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{session.name}</p>
                        {session.description && <p className="text-sm text-muted-foreground mt-1">{session.description}</p>}
                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(session.startDate)} – {formatDate(session.endDate)}
                          </span>
                          {session.halfDayPrice != null && (
                            <span className="flex items-center gap-1">
                              <Sunrise className="h-3.5 w-3.5" />
                              Half Day: {formatCents(session.halfDayPrice)}
                            </span>
                          )}
                          {session.fullDayPrice != null && (
                            <span className="flex items-center gap-1">
                              <Sun className="h-3.5 w-3.5" />
                              Full Day: {formatCents(session.fullDayPrice)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Schedule Type
              </CardTitle>
              <CardDescription>Choose a schedule type — this applies to all selected sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hasHalfDay && (
                  <div
                    onClick={() => setSelectedVariant("half_day")}
                    className={`p-6 rounded-lg border-2 cursor-pointer transition-all text-center ${
                      selectedVariant === "half_day" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Sunrise className="h-10 w-10 mx-auto mb-3 text-amber-500" />
                    <h3 className="font-semibold text-lg">Half Day</h3>
                    <div className="text-sm text-muted-foreground mt-2 space-y-1">
                      {selectedSessions.map((s) => (
                        <div key={s.id} className="flex justify-between">
                          <span>{s.name}</span>
                          <span className="font-medium">{formatCents(s.halfDayPrice)}</span>
                        </div>
                      ))}
                    </div>
                    {selectedSessions[0]?.halfDayStartTime && (
                      <p className="text-xs text-muted-foreground mt-3">
                        {selectedSessions[0].halfDayStartTime} – {selectedSessions[0].halfDayEndTime}
                      </p>
                    )}
                  </div>
                )}
                {hasFullDay && (
                  <div
                    onClick={() => setSelectedVariant("full_day")}
                    className={`p-6 rounded-lg border-2 cursor-pointer transition-all text-center ${
                      selectedVariant === "full_day" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Sun className="h-10 w-10 mx-auto mb-3 text-orange-500" />
                    <h3 className="font-semibold text-lg">Full Day</h3>
                    <div className="text-sm text-muted-foreground mt-2 space-y-1">
                      {selectedSessions.map((s) => (
                        <div key={s.id} className="flex justify-between">
                          <span>{s.name}</span>
                          <span className="font-medium">{formatCents(s.fullDayPrice)}</span>
                        </div>
                      ))}
                    </div>
                    {selectedSessions[0]?.fullDayStartTime && (
                      <p className="text-xs text-muted-foreground mt-3">
                        {selectedSessions[0].fullDayStartTime} – {selectedSessions[0].fullDayEndTime}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {!hasHalfDay && !hasFullDay && (
                <div className="text-center py-8">
                  <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No pricing configured for the selected sessions.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Review & Enroll
              </CardTitle>
              <CardDescription>Confirm your selections and add to cart</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">CHILDREN</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedChildren.map((c: any) => (
                    <Badge key={c.id} variant="secondary" className="text-sm py-1 px-3">
                      {c.firstName} {c.lastName}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">SESSIONS</h4>
                <div className="space-y-2">
                  {selectedSessions.map((s) => {
                    const price = selectedVariant === "half_day" ? s.halfDayPrice : s.fullDayPrice;
                    return (
                      <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(s.startDate)} – {formatDate(s.endDate)}</p>
                        </div>
                        <span className="font-medium">{formatCents(price)} / child</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">SCHEDULE TYPE</h4>
                <Badge variant="outline" className="text-sm py-1 px-3">
                  {selectedVariant === "half_day" ? "Half Day" : "Full Day"}
                </Badge>
              </div>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold">Total</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedChildren.length} child{selectedChildren.length > 1 ? "ren" : ""} x{" "}
                      {selectedSessions.length} session{selectedSessions.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-2xl font-bold text-primary">{formatCents(totalPrice)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={handleBack} disabled={step === 1}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {step < 4 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleEnroll} disabled={enrollMutation.isPending}>
              {enrollMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enrolling...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Add to Cart & Checkout
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </ParentAppShell>
  );
}
