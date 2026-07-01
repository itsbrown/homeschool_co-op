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
import { fetchParentMemberId, PARENT_MEMBER_ID_QUERY_KEY } from "@/lib/parent-member-id";
import { usePublicStoreCart } from "@/hooks/usePublicStoreCart";
import { storeItemDetailPath, type StoreCatalogItem } from "@/lib/store-catalog";
import { formatStoreCartMoney } from "@/lib/store-cart";
import { StoreProductCardImage } from "@/components/store/StoreProductCardImage";
import { PublicStoreHeader } from "@/components/store/PublicStoreHeader";
import { StoreCatalogItemActions } from "@/components/store/StoreCatalogItemActions";

export default function PublicStorePage() {
  const { schoolSlug = "" } = useParams<{ schoolSlug: string }>();
  const { isAuthenticated } = useAuth();
  const {
    cartCount,
    cartTotal,
    cartPulse,
    signInModalOpen,
    setSignInModalOpen,
    pendingProgram,
    addProduct,
    onAddProgram,
    confirmAddProgram,
    goToCheckout,
  } = usePublicStoreCart(schoolSlug);

  const { data: memberData } = useQuery({
    queryKey: PARENT_MEMBER_ID_QUERY_KEY,
    queryFn: fetchParentMemberId,
    enabled: isAuthenticated,
    retry: false,
  });

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
      return res.json() as Promise<{ items: StoreCatalogItem[] }>;
    },
    enabled: !!store,
  });

  const items = catalogData?.items ?? [];
  const isMemberOfStore =
    isAuthenticated && memberData?.schoolId != null && memberData.schoolId === store?.schoolId;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <PublicStoreHeader
        storeName={store?.name}
        storeDescription={store?.description}
        cartCount={cartCount}
        cartTotal={cartTotal}
        cartPulse={cartPulse}
        isAuthenticated={isAuthenticated}
        onCheckout={goToCheckout}
      />

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

      <main className="mx-auto max-w-5xl px-4 py-8">
        {catalogData && items.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white px-6 py-16 text-center">
            <p className="text-lg font-medium text-slate-900">Nothing listed yet</p>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              This store is active, but no programs or products have been published. Check back
              soon, or contact the school if you expected to see something here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
          <Card
            key={`${item.listingType}-${item.listingId}`}
            className="overflow-hidden flex flex-col"
            data-testid={`store-catalog-item-${item.listingType}-${item.listingId}`}
          >
            <Link href={storeItemDetailPath(schoolSlug, item.listingId)} className="block group">
              <StoreProductCardImage
                src={item.imageUrl}
                alt={item.title}
                className="group-hover:opacity-95 transition-opacity"
                data-testid={
                  item.listingType === "product"
                    ? "store-product-image"
                    : `store-${item.listingType}-image`
                }
              />
            </Link>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">
                  <Link
                    href={storeItemDetailPath(schoolSlug, item.listingId)}
                    className="hover:text-primary hover:underline"
                    data-testid={`store-item-link-${item.listingId}`}
                  >
                    {item.title}
                  </Link>
                </CardTitle>
                {item.membersOnly && <Badge variant="secondary">Members only</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 flex-1 flex flex-col">
              {item.description && (
                <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{item.description}</p>
              )}
              <div className="flex flex-col gap-3 mt-auto w-full pt-1">
                <StoreCatalogItemActions
                  item={item}
                  onAddProduct={addProduct}
                  onAddProgram={(programItem, variant) =>
                    onAddProgram(programItem, variant, isAuthenticated)
                  }
                />
                <Button
                  variant="outline"
                  className="w-full min-h-11"
                  asChild
                  data-testid={`store-view-details-${item.listingId}`}
                >
                  <Link href={storeItemDetailPath(schoolSlug, item.listingId)}>View details</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
            ))}
          </div>
        )}
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 p-4 sm:hidden">
          <Button
            className="w-full h-12"
            onClick={goToCheckout}
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
            <Button
              onClick={() => pendingProgram && confirmAddProgram(pendingProgram.variant)}
            >
              Continue as guest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
