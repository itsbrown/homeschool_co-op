import { Link } from "wouter";
import { ArrowLeft, CalendarDays, Package, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StoreCatalogItem } from "@/lib/store-catalog";
import {
  formatStoreListingDateRange,
  formatStoreListingPrice,
  storeListingDetailHeading,
  storeListingTypeLabel,
} from "@/lib/store-catalog-display";
import { StoreProductCardImage } from "@/components/store/StoreProductCardImage";
import { StoreCatalogItemActions } from "@/components/store/StoreCatalogItemActions";
import { StoreItemShareButton } from "@/components/store/StoreItemShareButton";

type StoreItemDetailViewProps = {
  item: StoreCatalogItem;
  schoolSlug: string;
  sharerUserId?: number | null;
  onAddProduct: (item: StoreCatalogItem) => void;
  onAddProgram: (item: StoreCatalogItem, variant: "half_day" | "full_day") => void;
};

export function StoreItemDetailView({
  item,
  schoolSlug,
  sharerUserId = null,
  onAddProduct,
  onAddProgram,
}: StoreItemDetailViewProps) {
  const dateRange = formatStoreListingDateRange(item.startDate, item.endDate);
  const priceLine = formatStoreListingPrice(item);
  const isProduct = item.listingType === "product";

  return (
    <div className="space-y-6" data-testid="store-item-detail">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/store/${schoolSlug}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to store
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <StoreProductCardImage
              src={item.imageUrl}
              alt={item.title}
              className="rounded-none aspect-square sm:aspect-[4/3] lg:aspect-square max-h-[min(70vh,520px)]"
              data-testid={
                isProduct ? "store-product-image" : `store-${item.listingType}-image`
              }
            />
          </div>

          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {storeListingDetailHeading(item.listingType)}
            </h3>
            {item.description ? (
              <div
                className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap mt-3"
                data-testid="store-item-description"
              >
                {item.description}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-3">
                {isProduct
                  ? "No product description has been added yet."
                  : "No program description has been added yet."}
              </p>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 space-y-4">
          <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{storeListingTypeLabel(item.listingType)}</Badge>
              {item.membersOnly && <Badge variant="secondary">Members only</Badge>}
              {isProduct && item.inStock === false && (
                <Badge variant="destructive">Out of stock</Badge>
              )}
              {isProduct && item.inStock !== false && (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                  In stock
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" data-testid="store-item-title">
                {item.title}
              </h1>
              {isProduct ? (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Package className="h-4 w-4 shrink-0" aria-hidden />
                  Choose pickup or shipping at checkout.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                  Enrollment includes child assignment at checkout.
                </p>
              )}
            </div>

            {dateRange && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="store-item-dates">
                <CalendarDays className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                <span>{dateRange}</span>
              </p>
            )}

            {priceLine && (
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{priceLine}</p>
            )}

            <Separator />

            <StoreCatalogItemActions
              item={item}
              layout="detail"
              onAddProduct={onAddProduct}
              onAddProgram={onAddProgram}
            />

            <StoreItemShareButton
              item={item}
              schoolSlug={schoolSlug}
              sharerUserId={sharerUserId}
              variant="outline"
              size="default"
              className="w-full"
            />
          </div>

          <p className="text-xs text-muted-foreground px-1">
            {isProduct
              ? "Browse photos and full item details on this page. Add to cart when you are ready — checkout works for guests and members."
              : "Full schedule and program details are on this page. Choose half or full day when adding sessions, then assign a child at checkout."}
          </p>
        </aside>
      </div>
    </div>
  );
}
