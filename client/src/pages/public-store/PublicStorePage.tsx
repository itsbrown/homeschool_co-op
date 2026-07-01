import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { fetchParentMemberId, PARENT_MEMBER_ID_QUERY_KEY } from "@/lib/parent-member-id";
import {
  loadStoreCart,
  saveStoreCart,
  addProductLine,
  addProgramLine,
  cartLineCount,
  cartSubtotalCents,
  formatStoreCartMoney,
} from "@/lib/store-cart";
import { StoreProductCardImage } from "@/components/store/StoreProductCardImage";
import { ToastAction } from "@/components/ui/toast";

type CatalogItem = {
  listingId: number;
  listingType: "product" | "session" | "class";
  sourceId: number;
  title: string;
  description?: string;
  priceCents?: number;
  halfDayPrice?: number;
  fullDayPrice?: number;
  imageUrl?: string | null;
  membersOnly: boolean;
  inStock?: boolean;
};

export default function PublicStorePage() {
  const { schoolSlug = "" } = useParams<{ schoolSlug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const { data: memberData } = useQuery({
    queryKey: PARENT_MEMBER_ID_QUERY_KEY,
    queryFn: fetchParentMemberId,
    enabled: isAuthenticated,
    retry: false,
  });
  const [cart, setCart] = useState(() => loadStoreCart(schoolSlug));
  const [cartPulse, setCartPulse] = useState(false);
  const [pendingProgram, setPendingProgram] = useState<{
    item: CatalogItem;
    variant: "half_day" | "full_day";
  } | null>(null);
  const [signInModalOpen, setSignInModalOpen] = useState(false);

  useEffect(() => {
    saveStoreCart(cart);
  }, [cart]);

  const cartCount = cartLineCount(cart);
  const cartTotal = cartSubtotalCents(cart);

  const notifyAdded = (title: string, nextCart: ReturnType<typeof loadStoreCart>) => {
    setCartPulse(true);
    window.setTimeout(() => setCartPulse(false), 600);
    toast({
      title: "Added to cart",
      description: `${title} · ${formatStoreCartMoney(cartSubtotalCents(nextCart))} total`,
      action: (
        <ToastAction altText="View cart" onClick={() => setLocation(`/store/${schoolSlug}/checkout`)}>
          View cart
        </ToastAction>
      ),
    });
  };

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
    const next = addProductLine(cart, {
      listingId: item.listingId,
      listingType: "product",
      sourceId: item.sourceId,
      title: item.title,
      unitPriceCents: item.priceCents,
    });
    setCart(next);
    notifyAdded(item.title, next);
  };

  const confirmAddProgram = (variant: "half_day" | "full_day") => {
    if (!pendingProgram) return;
    const { item } = pendingProgram;
    const price =
      variant === "half_day" ? item.halfDayPrice ?? 0 : item.fullDayPrice ?? item.priceCents ?? 0;
    const displayTitle = `${item.title}${
      item.listingType === "session"
        ? variant === "half_day"
          ? " — Half Day"
          : " — Full Day"
        : ""
    }`;
    const next = addProgramLine(cart, {
      listingId: item.listingId,
      listingType: item.listingType as "session" | "class",
      sourceId: item.sourceId,
      title: displayTitle,
      variant,
      unitPriceCents: price,
    });
    setCart(next);
    notifyAdded(displayTitle, next);
    setPendingProgram(null);
    setSignInModalOpen(false);
  };

  const onAddProgram = (item: CatalogItem, variant: "half_day" | "full_day") => {
    setPendingProgram({ item, variant });
    if (!isAuthenticated) setSignInModalOpen(true);
    else confirmAddProgram(variant);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-semibold">{store?.name ?? "Store"}</h1>
            {store?.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{store.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isAuthenticated ? (
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href={`/login?returnTo=${encodeURIComponent(`/store/${schoolSlug}`)}`}>
                  Sign in
                </Link>
              </Button>
            ) : null}
            <Button
              onClick={() => setLocation(`/store/${schoolSlug}/checkout`)}
              className={cartPulse ? "animate-pulse ring-2 ring-primary ring-offset-2" : undefined}
              data-testid="store-cart-button"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Cart ({cartCount})
              {cartTotal > 0 && (
                <span className="ml-1 opacity-90">· {formatStoreCartMoney(cartTotal)}</span>
              )}
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
          <Card
            key={`${item.listingType}-${item.listingId}`}
            className="overflow-hidden"
            data-testid={`store-catalog-item-${item.listingType}-${item.listingId}`}
          >
            <StoreProductCardImage
              src={item.imageUrl}
              alt={item.title}
              data-testid={
                item.listingType === "product"
                  ? "store-product-image"
                  : `store-${item.listingType}-image`
              }
            />
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
                  <Button
                    disabled={item.inStock === false}
                    onClick={() => addProduct(item)}
                    data-testid={`store-add-product-${item.listingId}`}
                  >
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

      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 p-4 sm:hidden">
          <Button
            className="w-full h-12"
            onClick={() => setLocation(`/store/${schoolSlug}/checkout`)}
            data-testid="store-cart-mobile-checkout"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            View cart ({cartCount}) · {formatStoreCartMoney(cartTotal)}
          </Button>
        </div>
      )}

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
