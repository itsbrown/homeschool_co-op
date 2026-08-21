import type { HouseholdSupplyRow } from "@shared/supply-list";
import { storeProductCta, type StoreProductCta } from "@shared/store-product-cta";
import { storeItemDetailPath } from "@/lib/store-catalog";

export type HouseholdSupplyProduct = {
  id: number;
  name: string;
  productKind: "owned" | "affiliate";
  affiliateUrl: string | null;
  listingSlug: string | null;
  purchasableInCart: false;
  pickupOnly?: boolean;
};

export type ParentSupplyListResponse = {
  items: Array<HouseholdSupplyRow & { product: HouseholdSupplyProduct | null }>;
  storeSlug: string | null;
  classCount: number;
  sessionCount: number;
};

export const PARENT_SUPPLY_LIST_QUERY_KEY = ["/api/parent/supply-list"] as const;

export type SupplyProductAction =
  | { kind: "outbound"; productId: number; cta: Extract<StoreProductCta, { kind: "amazon" | "external" }> }
  | { kind: "shop"; productId: number; href: string };

export function supplyListProductAction(
  product: HouseholdSupplyProduct | null,
  storeSlug: string | null,
): SupplyProductAction | null {
  if (!product) return null;
  const cta = storeProductCta({ affiliateUrl: product.affiliateUrl });
  if (cta.kind === "amazon" || cta.kind === "external") {
    return { kind: "outbound", productId: product.id, cta };
  }
  if (storeSlug && product.listingSlug) {
    return { kind: "shop", productId: product.id, href: storeItemDetailPath(storeSlug, product.listingSlug) };
  }
  return null;
}
