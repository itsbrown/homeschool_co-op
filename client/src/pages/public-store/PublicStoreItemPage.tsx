import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/SupabaseProvider";
import { fetchParentMemberId, PARENT_MEMBER_ID_QUERY_KEY } from "@/lib/parent-member-id";
import { usePublicStoreCart } from "@/hooks/usePublicStoreCart";
import type { StoreCatalogItem } from "@/lib/store-catalog";
import { PublicStoreHeader } from "@/components/store/PublicStoreHeader";
import { PublicStoreMemberBanner } from "@/components/store/PublicStoreMemberBanner";
import { StoreItemDetailView } from "@/components/store/StoreItemDetailView";
import { formatStoreCartMoney } from "@/lib/store-cart";

export default function PublicStoreItemPage() {
  const { schoolSlug = "", itemSlug = "" } = useParams<{ schoolSlug: string; itemSlug: string }>();
  const { isAuthenticated } = useAuth();
  const {
    cartCount,
    cartTotal,
    cartPulse,
    addProduct,
    onAddProgram,
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

  const { data: catalogData } = useQuery({
    queryKey: ["/api/public/store", schoolSlug, "catalog"],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}/catalog`);
      if (!res.ok) throw new Error("Catalog unavailable");
      return res.json() as Promise<{ items: StoreCatalogItem[] }>;
    },
    enabled: !!schoolSlug && !!store,
  });

  const { data, isLoading, isError } = useQuery<{ item: StoreCatalogItem }>({
    queryKey: ["/api/public/store", schoolSlug, "catalog", itemSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}/catalog/${itemSlug}`);
      if (!res.ok) throw new Error("Item not found");
      return res.json();
    },
    enabled: !!schoolSlug && !!itemSlug,
  });

  const item = data?.item;
  const catalogItems = catalogData?.items ?? [];
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
        <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Loading…</main>
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
        <main className="mx-auto max-w-6xl px-4 py-12 space-y-4 text-center">
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
        cartCount={cartCount}
        cartTotal={cartTotal}
        cartPulse={cartPulse}
        isAuthenticated={isAuthenticated}
        onCheckout={goToCheckout}
      />

      {isMemberOfStore && (
        <PublicStoreMemberBanner items={catalogItems} containerClassName="max-w-6xl" />
      )}

      <main className="mx-auto max-w-6xl px-4 py-6">
        <StoreItemDetailView
          item={item}
          schoolSlug={schoolSlug}
          onAddProduct={addProduct}
          onAddProgram={onAddProgram}
        />
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
    </div>
  );
}
