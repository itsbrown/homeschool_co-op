import { useMutation, useQuery } from "@tanstack/react-query";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Plan = {
  id: string;
  name: string;
  description: string;
  monthlyUsd: number;
  purchasable: boolean;
  maxCampuses: number | null;
  maxStudents: number | null;
  familyPayments: boolean;
};

type Status = {
  plan: string;
  planName: string;
  status: string;
  familyPayments: boolean;
  familyPaymentsMessage: string | null;
  portalAvailable: boolean;
  limits: {
    maxCampuses: number | null;
    maxStudents: number | null;
    campuses: number;
    students: number;
  };
  catalog: Plan[];
};

export default function SchoolPlatformBillingPage() {
  const { toast } = useToast();
  const statusQuery = useQuery({
    queryKey: ["/api/platform-subscriptions/status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/platform-subscriptions/status");
      if (!response.ok) throw new Error("Could not load billing");
      return response.json() as Promise<Status>;
    },
  });

  const checkout = useMutation({
    mutationFn: async (planId: string) => {
      const response = await apiRequest("POST", "/api/platform-subscriptions/create", { planId });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Checkout did not start");
      if (body.sessionUrl) window.location.href = body.sessionUrl;
    },
    onError: (error: Error) => toast({ title: "Checkout", description: error.message, variant: "destructive" }),
  });

  const portal = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/platform-subscriptions/portal", {});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Portal is not available");
      if (body.url) window.location.href = body.url;
    },
    onError: (error: Error) => toast({ title: "Billing portal", description: error.message, variant: "destructive" }),
  });

  const data = statusQuery.data;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-semibold">Platform billing</h1>
        {statusQuery.isLoading && <p>Loading plan…</p>}
        {statusQuery.isError && <p>Billing details are not available yet.</p>}
        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{data.planName}</CardTitle>
                <CardDescription>Status: {data.status}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Campuses {data.limits.campuses}
                  {data.limits.maxCampuses != null ? ` of ${data.limits.maxCampuses}` : " (no cap)"}
                  {" · "}
                  Students {data.limits.students}
                  {data.limits.maxStudents != null ? ` of ${data.limits.maxStudents}` : " (no cap)"}
                </p>
                {data.familyPaymentsMessage && (
                  <p className="text-amber-800">{data.familyPaymentsMessage}</p>
                )}
                {data.plan === "internal" && (
                  <p>This school is on the internal plan. Family payments stay on, and there is no platform invoice.</p>
                )}
                {data.portalAvailable && data.plan !== "internal" && (
                  <Button onClick={() => portal.mutate()} disabled={portal.isPending}>Open Stripe customer portal</Button>
                )}
              </CardContent>
            </Card>
            {data.plan !== "internal" && (
              <div className="grid gap-3 md:grid-cols-3">
                {data.catalog.filter((plan) => plan.purchasable).map((plan) => (
                  <Card key={plan.id}>
                    <CardHeader>
                      <CardTitle>{plan.name}</CardTitle>
                      <CardDescription>${plan.monthlyUsd}/month</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm">{plan.description}</p>
                      <Button
                        variant={data.plan === plan.id ? "secondary" : "default"}
                        disabled={checkout.isPending || data.plan === plan.id}
                        onClick={() => checkout.mutate(plan.id)}
                      >
                        {data.plan === plan.id ? "Current plan" : "Choose"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
