import { Button } from "@/components/ui/button";
import type { StoreCatalogItem } from "@/lib/store-catalog";

type StoreCatalogItemActionsProps = {
  item: StoreCatalogItem;
  onAddProduct: (item: StoreCatalogItem) => void;
  onAddProgram: (item: StoreCatalogItem, variant: "half_day" | "full_day") => void;
  layout?: "card" | "detail";
};

export function StoreCatalogItemActions({
  item,
  onAddProduct,
  onAddProgram,
  layout = "card",
}: StoreCatalogItemActionsProps) {
  const isCard = layout === "card";
  const buttonClass = isCard
    ? "w-full min-h-11"
    : "w-full min-h-11 sm:w-auto sm:min-w-[10rem]";
  const groupClass = isCard
    ? "flex flex-col gap-2 w-full"
    : "flex flex-col sm:flex-row flex-wrap gap-2 w-full";

  if (item.listingType === "product") {
    return (
      <Button
        disabled={item.inStock === false}
        onClick={() => onAddProduct(item)}
        className={buttonClass}
        data-testid={`store-add-product-${item.listingId}`}
      >
        {item.inStock === false ? "Out of stock" : "Add to cart"}
      </Button>
    );
  }

  if (item.listingType === "session") {
    return (
      <div className={groupClass}>
        {item.halfDayPrice != null && (
          <Button
            variant="outline"
            className={buttonClass}
            onClick={() => onAddProgram(item, "half_day")}
            data-testid={`store-add-session-half-${item.listingId}`}
          >
            Half day — ${(item.halfDayPrice / 100).toFixed(2)}
          </Button>
        )}
        {item.fullDayPrice != null && (
          <Button
            className={buttonClass}
            onClick={() => onAddProgram(item, "full_day")}
            data-testid={`store-add-session-full-${item.listingId}`}
          >
            Full day — ${(item.fullDayPrice / 100).toFixed(2)}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      className={buttonClass}
      onClick={() => onAddProgram(item, "full_day")}
      data-testid={`store-add-class-${item.listingId}`}
    >
      Add — ${((item.priceCents ?? 0) / 100).toFixed(2)}
    </Button>
  );
}
