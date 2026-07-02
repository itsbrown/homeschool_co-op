import { Link } from "wouter";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { storeItemDetailPath, type StoreCatalogItem } from "@/lib/store-catalog";
import {
  formatStoreListingDateRange,
  formatStoreListingPrice,
  storeListingTypeLabel,
} from "@/lib/store-catalog-display";
import { StoreProductCardImage } from "@/components/store/StoreProductCardImage";
import { StoreCatalogItemActions } from "@/components/store/StoreCatalogItemActions";
import { StoreItemShareButton } from "@/components/store/StoreItemShareButton";

type StoreCatalogCardProps = {
  item: StoreCatalogItem;
  schoolSlug: string;
  sharerUserId?: number | null;
  onAddProduct: (item: StoreCatalogItem) => void;
  onAddProgram: (item: StoreCatalogItem, variant: "half_day" | "full_day") => void;
};

export function StoreCatalogCard({
  item,
  schoolSlug,
  sharerUserId = null,
  onAddProduct,
  onAddProgram,
}: StoreCatalogCardProps) {
  const detailPath = storeItemDetailPath(schoolSlug, item);
  const priceLine = formatStoreListingPrice(item);
  const dateRange = formatStoreListingDateRange(item.startDate, item.endDate);
  const hasDescription = Boolean(item.description?.trim());

  return (
    <Card
      className="overflow-hidden flex flex-col h-full border-slate-200/80 shadow-sm hover:shadow-md transition-shadow"
      data-testid={`store-catalog-item-${item.listingType}-${item.listingId}`}
    >
      <Link href={detailPath} className="block group">
        <StoreProductCardImage
          src={item.imageUrl}
          alt={item.title}
          className="group-hover:opacity-95 transition-opacity"
          data-testid={
            item.listingType === "product" ? "store-product-image" : `store-${item.listingType}-image`
          }
        />
      </Link>

      <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal text-xs">
            {storeListingTypeLabel(item.listingType)}
          </Badge>
          {item.membersOnly && <Badge variant="secondary">Members only</Badge>}
          {item.listingType === "product" && item.inStock === false && (
            <Badge variant="destructive">Out of stock</Badge>
          )}
        </div>

        <div className="space-y-1">
          <Link
            href={detailPath}
            className="block text-lg font-semibold leading-snug text-slate-900 hover:text-primary hover:underline"
            data-testid={`store-item-link-${item.listingId}`}
          >
            {item.title}
          </Link>
          {priceLine && (
            <p className="text-base font-medium tabular-nums text-slate-900" data-testid={`store-item-price-${item.listingId}`}>
              {priceLine}
            </p>
          )}
          {dateRange && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {dateRange}
            </p>
          )}
        </div>

        {hasDescription && (
          <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={detailPath}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            data-testid={`store-view-details-${item.listingId}`}
          >
            {item.listingType === "product" ? "View product details" : "View program details"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <StoreItemShareButton
            item={item}
            schoolSlug={schoolSlug}
            sharerUserId={sharerUserId}
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-primary"
          />
        </div>

        <div className="mt-auto pt-1">
          <StoreCatalogItemActions
            item={item}
            onAddProduct={onAddProduct}
            onAddProgram={onAddProgram}
          />
        </div>
      </CardContent>
    </Card>
  );
}
