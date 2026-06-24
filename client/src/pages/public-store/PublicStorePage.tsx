import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/SupabaseProvider";
import { fetchParentMemberId, PARENT_MEMBER_ID_QUERY_KEY } from "@/lib/parent-member-id";
import { loadStoreCart, saveStoreCart, newLineId } from "@/lib/store-cart";

type CatalogItem = {
  listingId: number;
  listingType: "product" | "session" | "class";
  sourceId: number;
  title: string;
  description?: string;
  priceCents?: number;
  halfDayPrice?: number;
  fullDayPrice?: number;
  membersOnly: boolean;
  inStock?: boolean;
};

export default function PublicStorePage() {
  const { schoolSlug = "" } = useParams<{ schoolSlug: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: memberData } = useQuery({
    queryKey: PARENT_MEMBER_ID_QUERY_KEY,
    queryFn: fetchParentMemberId,
    enabled: isAuthenticated,
    retry: false,
  });
  const [cart, setCart] = useState(() => loadStoreCart(schoolSlug));
  const [pendingProgram, setPendingProgram] = useState<{
    item: CatalogItem;
    variant: "half_day" | "full_day";
  } | null>(null);
  const [signInModalOpen, setSignInModalOpen] = useState(false);

  useEffect(() => {
    saveStoreCart(cart);
  }, [cart]);

  const { data: store } = useQuery({
    queryKey: ["/api/public/store", schoolSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}`);
      if (!res.ok) throw new Error("Store not found");
      return res.json();
    },
  });

  const { data: catalogData } = useQuery({
    queryKey: ["/api/public/store", schoolSlug, "catalog"],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}/catalog`);
      if (!res.ok) throw new Error("Catalog unavailable");
      return res.json() as Promise<{ items: CatalogItem[] }>;
    },
    enabled: !!store,
  });

  const items = catalogData?.items ?? [];
  const isMemberOfStore =
    isAuthenticated && memberData?.schoolId != null && memberData.schoolId === store?.schoolId;

  const addProduct = (item: CatalogItem) => {
    setCart((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          lineId: newLineId(),
          listingId: item.listingId,
          listingType: "product",
          sourceId: item.sourceId,
          title: item.title,
          quantity: 1,
          unitPriceCents: item.priceCents,
        },
      ],
    }));
  };

  const confirmAddProgram = (variant: "half_day" | "full_day") => {
    if (!pendingProgram) return;
    const { item } = pendingProgram;
    const price =
      variant === "half_day" ? item.halfDayPrice ?? 0 : item.fullDayPrice ?? item.priceCents ?? 0;
    setCart((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          lineId: newLineId(),
          listingId: item.listingId,
          listingType: item.listingType as "session" | "class",
          sourceId: item.sourceId,
          title: `${item.title}${item.listingType === "session" ? (variant === "half_day" ? " — Half Day" : " — Full Day") : ""}`,
          quantity: 1,
          variant,
          unitPriceCents: price,
        },
      ],
    }));
    setPendingProgram(null);
    setSignInModalOpen(false);
  };

  const onAddProgram = (item: CatalogItem, variant: "half_day" | "full_day") => {
    setPendingProgram({ item, variant });
    if (!isAuthenticated) setSignInModalOpen(true);
    else confirmAddProgram(variant);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-semibold">{store?.name ?? "Store"}</h1>
            {store?.description && (
              <p className="text-sm text-muted-foreground mt-1">{store.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isAuthenticated ? (
              <Button variant="outline" asChild>
                <Link href={`/login?returnTo=${encodeURIComponent(`/store/${schoolSlug}`)}`}>
                  Already a member? Sign in
                </Link>
              </Button>
            ) : null}
            <Button onClick={() => setLocation(`/store/${schoolSlug}/checkout`)}>
              Cart ({cart.lines.length})
            </Button>
          </div>
        </div>
      </header>

      {isMemberOfStore && (
        <div className="bg-blue-50 border-b border-blue-100">
          <div className="mx-auto max-w-5xl px-4 py-3 text-sm flex flex-wrap gap-3 items-center">
            <span>You&apos;re a member — you can also enroll via the member portal:</span>
            <Link href="/parent/programs" className="text-blue-700 underline">
              My Programs
            </Link>
            <Link href="/enroll" className="text-blue-700 underline">
              Enroll
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-8 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Card key={`${item.listingType}-${item.listingId}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{item.title}</CardTitle>
                {item.membersOnly && <Badge variant="secondary">Members only</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {item.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{item.description}</p>
              )}
              {item.listingType === "product" && (
                <>
                  <p className="font-medium">${((item.priceCents ?? 0) / 100).toFixed(2)}</p>
                  <Button disabled={item.inStock === false} onClick={() => addProduct(item)}>
                    Add to cart
                  </Button>
                </>
              )}
              {item.listingType === "session" && (
                <div className="flex flex-wrap gap-2">
                  {item.halfDayPrice != null && (
                    <Button variant="outline" onClick={() => onAddProgram(item, "half_day")}>
                      Half day — ${(item.halfDayPrice / 100).toFixed(2)}
                    </Button>
                  )}
                  {item.fullDayPrice != null && (
                    <Button onClick={() => onAddProgram(item, "full_day")}>
                      Full day — ${(item.fullDayPrice / 100).toFixed(2)}
                    </Button>
                  )}
                </div>
              )}
              {item.listingType === "class" && (
                <Button onClick={() => onAddProgram(item, "full_day")}>
                  Add — ${((item.priceCents ?? 0) / 100).toFixed(2)}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </main>

      <Dialog open={signInModalOpen} onOpenChange={setSignInModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in or continue as guest</DialogTitle>
            <DialogDescription>
              Signing in lets you pick saved children at checkout. You can also continue as a guest.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" asChild>
              <Link href={`/login?returnTo=${encodeURIComponent(`/store/${schoolSlug}`)}`}>
                Sign in (recommended)
              </Link>
            </Button>
            <Button onClick={() => pendingProgram && confirmAddProgram(pendingProgram.variant)}>
              Continue as guest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
