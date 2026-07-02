import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/SupabaseProvider";
import { fetchParentMemberId, PARENT_MEMBER_ID_QUERY_KEY } from "@/lib/parent-member-id";
import { usePublicStoreCart } from "@/hooks/usePublicStoreCart";
import type { StoreCatalogItem } from "@/lib/store-catalog";
import { groupStoreCatalogItems } from "@/lib/store-catalog-display";
import { formatStoreCartMoney } from "@/lib/store-cart";
import { PublicStoreHeader } from "@/components/store/PublicStoreHeader";
import { PublicStoreMemberBanner } from "@/components/store/PublicStoreMemberBanner";
import { StoreCatalogCard } from "@/components/store/StoreCatalogCard";
import { useCaptureStoreShareReferral } from "@/hooks/useCaptureStoreShareReferral";
import { useStoreSharerUserId } from "@/hooks/useStoreSharerUserId";

export default function PublicStorePage() {
  const { schoolSlug = "" } = useParams<{ schoolSlug: string }>();
  const { isAuthenticated } = useAuth();
  useCaptureStoreShareReferral(schoolSlug);
  const sharerUserId = useStoreSharerUserId(isAuthenticated);
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
  const sections = groupStoreCatalogItems(items);
  const isMemberOfStore =
    isAuthenticated && memberData?.schoolId != null && memberData.schoolId === store?.schoolId;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <PublicStoreHeader
        storeName={store?.name}
        cartCount={cartCount}
        cartTotal={cartTotal}
        cartPulse={cartPulse}
        isAuthenticated={isAuthenticated}
        onCheckout={goToCheckout}
      />

      {isMemberOfStore && <PublicStoreMemberBanner items={items} />}

      <main className="mx-auto max-w-6xl px-4 py-8">
        {store?.description?.trim() && (
          <p
            className="mb-8 max-w-3xl text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
            data-testid="store-intro-description"
          >
            {store.description}
          </p>
        )}
        {catalogData && items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white px-6 py-16 text-center">
            <p className="text-lg font-medium text-slate-900">Nothing listed yet</p>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              This store is active, but no programs or products have been published. Check back
              soon, or contact the school if you expected to see something here.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {sections.map((section) => (
              <section key={section.id} aria-labelledby={`store-section-${section.id}`}>
                <div className="mb-6 max-w-2xl">
                  <h2
                    id={`store-section-${section.id}`}
                    className="text-xl font-semibold tracking-tight text-slate-900"
                  >
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                </div>
                <div
                  className={
                    section.id === "shop"
                      ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                      : "grid gap-5 md:grid-cols-2"
                  }
                >
                  {section.items.map((item) => (
                    <StoreCatalogCard
                      key={`${item.listingType}-${item.listingId}`}
                      item={item}
                      schoolSlug={schoolSlug}
                      sharerUserId={sharerUserId}
                      onAddProduct={addProduct}
                      onAddProgram={onAddProgram}
                    />
                  ))}
                </div>
              </section>
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
    </div>
  );
}
