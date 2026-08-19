import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, Printer, ShoppingBag } from "lucide-react";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  PARENT_SUPPLY_LIST_QUERY_KEY,
  supplyListProductAction,
  type ParentSupplyListResponse,
} from "@/lib/parent-supply-list";
import { StoreOutboundProductLink } from "@/components/store/StoreOutboundProductLink";
import { DimensionsMathPlacementCard } from "@/components/parent/DimensionsMathPlacementCard";
import { householdNeedsDimensionsMathPlacement } from "@shared/supply-list";

type ViewMode = "shopping" | "child" | "class";

function attributionLabel(row: ParentSupplyListResponse["items"][number]): string {
  return row.for
    .map((entry) => `${entry.childName} (${entry.ownerName})`)
    .join(" · ");
}

function SupplyBuyActions({
  row,
  storeSlug,
}: {
  row: ParentSupplyListResponse["items"][number];
  storeSlug: string | null;
}) {
  const action = supplyListProductAction(row.product, storeSlug);
  if (!action) return null;
  if (action.kind === "outbound") {
    const testId =
      action.cta.kind === "amazon"
        ? `supply-buy-amazon-${action.productId}`
        : `supply-view-product-${action.productId}`;
    return (
      <StoreOutboundProductLink url={action.cta.href} className="min-h-11" testId={testId} />
    );
  }
  return (
    <Button asChild variant="outline" className="min-h-11" data-testid={`supply-view-shop-${action.productId}`}>
      <Link href={action.href}>View in shop</Link>
    </Button>
  );
}

export default function ParentSupplyListPage() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>("shopping");
  const { data, isLoading, error } = useQuery<ParentSupplyListResponse>({
    queryKey: PARENT_SUPPLY_LIST_QUERY_KEY,
  });

  const checkMutation = useMutation({
    mutationFn: async ({ supplyItemIds, checked }: { supplyItemIds: number[]; checked: boolean }) => {
      const res = await apiRequest("PATCH", "/api/parent/supply-list/checks", {
        supplyItemIds,
        checked,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not update checklist");
      }
      return res.json() as Promise<ParentSupplyListResponse>;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(PARENT_SUPPLY_LIST_QUERY_KEY, next);
    },
    onError: (err: Error) => {
      toast({ title: "Could not update", description: err.message, variant: "destructive" });
    },
  });

  const items = data?.items ?? [];

  const grouped = useMemo(() => {
    if (view === "shopping") return [{ key: "all", title: "Shopping list", rows: items }];
    if (view === "child") {
      const byChild = new Map<string, ParentSupplyListResponse["items"]>();
      for (const row of items) {
        const names = [...new Set(row.for.map((f) => f.childName))];
        for (const name of names) {
          const list = byChild.get(name) ?? [];
          list.push(row);
          byChild.set(name, list);
        }
      }
      return [...byChild.entries()].map(([title, rows]) => ({ key: title, title, rows }));
    }
    const byOwner = new Map<string, ParentSupplyListResponse["items"]>();
    for (const row of items) {
      const owners = [...new Set(row.for.map((f) => f.ownerName))];
      for (const name of owners) {
        const list = byOwner.get(name) ?? [];
        list.push(row);
        byOwner.set(name, list);
      }
    }
    return [...byOwner.entries()].map(([title, rows]) => ({ key: title, title, rows }));
  }, [items, view]);

  return (
    <ParentAppShell>
      <div className="p-4 md:p-6 space-y-6 print:p-0">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Supply list</h1>
            <p className="text-muted-foreground mt-1">
              One shopping list for every enrolled child. Check off what you already have.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => window.print()}
            data-testid="button-print-supply-list"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <p className="text-destructive">Could not load your supply list. Try again in a moment.</p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <Card data-testid="parent-supply-list-empty">
            <CardContent className="py-12 text-center">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">No supplies yet</h2>
              <p className="text-muted-foreground mb-4">
                When your school publishes class or session lists, they will show up here.
              </p>
              <Button asChild variant="outline">
                <Link href="/parent/home">Back to dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {items.length > 0 && (
          <>
            {householdNeedsDimensionsMathPlacement(items) && <DimensionsMathPlacementCard />}
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as ViewMode)}
              className="print:hidden"
            >
              <TabsList>
                <TabsTrigger value="shopping" data-testid="supply-view-shopping">
                  Shopping list
                </TabsTrigger>
                <TabsTrigger value="child" data-testid="supply-view-child">
                  By child
                </TabsTrigger>
                <TabsTrigger value="class" data-testid="supply-view-class">
                  By class
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-6" data-testid="parent-supply-list">
              {grouped.map((group) => (
                <Card key={group.key}>
                  {view !== "shopping" && (
                    <CardHeader>
                      <CardTitle>{group.title}</CardTitle>
                    </CardHeader>
                  )}
                  <CardContent className={view === "shopping" ? "pt-6" : undefined}>
                    <ul className="space-y-4">
                      {group.rows.map((row) => (
                        <li
                          key={`${group.key}-${row.mergeKey}`}
                          className="flex flex-col sm:flex-row sm:items-start gap-3 border-b pb-4 last:border-0 last:pb-0"
                          data-testid={`supply-row-${row.mergeKey}`}
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Checkbox
                              className="mt-1 h-5 w-5 print:hidden"
                              checked={row.checked}
                              onCheckedChange={(checked) =>
                                checkMutation.mutate({
                                  supplyItemIds: row.supplyItemIds,
                                  checked: checked === true,
                                })
                              }
                              aria-label={`Got ${row.name}`}
                              data-testid={`supply-check-${row.mergeKey}`}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                  {row.name}
                                  {row.quantity > 1 ? ` ×${row.quantity}` : ""}
                                  {row.unit ? ` ${row.unit}` : ""}
                                </span>
                                <Badge variant={row.required ? "default" : "secondary"}>
                                  {row.required ? "Required" : "Optional"}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {attributionLabel(row)}
                              </p>
                              {row.notes && (
                                <p className="text-sm text-muted-foreground mt-1">{row.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="print:hidden sm:shrink-0">
                            <SupplyBuyActions row={row} storeSlug={data?.storeSlug ?? null} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </ParentAppShell>
  );
}
