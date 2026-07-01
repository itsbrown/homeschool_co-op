import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { StoreCatalogItem } from "@/lib/store-catalog";
import { PublicStoreHeader } from "@/components/store/PublicStoreHeader";
import { StoreCatalogItemActions } from "@/components/store/StoreCatalogItemActions";
import { StoreProductCardImage } from "@/components/store/StoreProductCardImage";
import { formatStoreCartMoney } from "@/lib/store-cart";
import { ShoppingCart } from "lucide-react";
import { safeFormatDate } from "@/utils/safeFormatDate";

const STORE_DATE_FORMAT = "MMM d, yyyy";

function formatDateRange(start?: string | null, end?: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) {
    return `${safeFormatDate(start, STORE_DATE_FORMAT)} – ${safeFormatDate(end, STORE_DATE_FORMAT)}`;
  }
  if (start) return `Starts ${safeFormatDate(start, STORE_DATE_FORMAT)}`;
  return `Through ${safeFormatDate(end!, STORE_DATE_FORMAT)}`;
}

export default function PublicStoreItemPage() {
  const { schoolSlug = "", listingId = "" } = useParams<{ schoolSlug: string; listingId: string }>();
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
    enabled: !!schoolSlug,
  });

  const { data, isLoading, isError } = useQuery<{ item: StoreCatalogItem }>({
    queryKey: ["/api/public/store", schoolSlug, "catalog", listingId],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}/catalog/${listingId}`);
      if (!res.ok) throw new Error("Item not found");
      return res.json();
    },
    enabled: !!schoolSlug && !!listingId,
  });

  const item = data?.item;
  const dateRange = item ? formatDateRange(item.startDate, item.endDate) : null;
  const isMemberOfStore =
    isAuthenticated && memberData?.schoolId != null && memberData.schoolId === (store as { schoolId?: number })?.schoolId;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicStoreHeader
          storeName={(store as { name?: string })?.name}
          cartCount={cartCount}
          cartTotal={cartTotal}
          isAuthenticated={isAuthenticated}
          onCheckout={goToCheckout}
        />
        <main className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">Loading…</main>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicStoreHeader
          storeName={(store as { name?: string })?.name}
          cartCount={cartCount}
          cartTotal={cartTotal}
          isAuthenticated={isAuthenticated}
          onCheckout={goToCheckout}
        />
        <main className="mx-auto max-w-3xl px-4 py-12 space-y-4 text-center">
          <p className="text-muted-foreground">This item is not available.</p>
          <Button asChild variant="outline">
            <Link href={`/store/${schoolSlug}`}>Back to store</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <PublicStoreHeader
        storeName={(store as { name?: string })?.name}
        storeDescription={(store as { description?: string })?.description}
        cartCount={cartCount}
        cartTotal={cartTotal}
        cartPulse={cartPulse}
        isAuthenticated={isAuthenticated}
        onCheckout={goToCheckout}
      />

      {isMemberOfStore && (
        <div className="bg-blue-50 border-b border-blue-100">
          <div className="mx-auto max-w-3xl px-4 py-3 text-sm flex flex-wrap gap-3 items-center">
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

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6" data-testid="store-item-detail">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/store/${schoolSlug}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to store
          </Link>
        </Button>

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <StoreProductCardImage
            src={item.imageUrl}
            alt={item.title}
            className="rounded-none aspect-[16/10] sm:aspect-[2/1]"
            data-testid={
              item.listingType === "product" ? "store-product-image" : `store-${item.listingType}-image`
            }
          />

          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight" data-testid="store-item-title">
                {item.title}
              </h2>
              {item.membersOnly && <Badge variant="secondary">Members only</Badge>}
            </div>

            {dateRange && (
              <p className="text-sm text-muted-foreground" data-testid="store-item-dates">
                {dateRange}
              </p>
            )}

            {item.listingType === "product" && item.priceCents != null && (
              <p className="text-xl font-medium tabular-nums">
                ${(item.priceCents / 100).toFixed(2)}
              </p>
            )}

            {item.description ? (
              <div
                className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap"
                data-testid="store-item-description"
              >
                {item.description}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No description provided.</p>
            )}

            <div className="pt-2 border-t">
              <StoreCatalogItemActions
                item={item}
                layout="detail"
                onAddProduct={addProduct}
                onAddProgram={(programItem, variant) =>
                  onAddProgram(programItem, variant, isAuthenticated)
                }
              />
            </div>
          </div>
        </div>
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
              <Link href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}>
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
