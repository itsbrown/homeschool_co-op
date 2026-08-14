import type { HouseholdSupplyRow } from "@shared/supply-list";

export type HouseholdSupplyProduct = {
  id: number;
  name: string;
  productKind: "owned" | "affiliate";
  affiliateUrl: string | null;
  listingSlug: string | null;
  purchasableInCart: false;
};

export type ParentSupplyListResponse = {
  items: Array<HouseholdSupplyRow & { product: HouseholdSupplyProduct | null }>;
  storeSlug: string | null;
  classCount: number;
  sessionCount: number;
};

export const PARENT_SUPPLY_LIST_QUERY_KEY = ["/api/parent/supply-list"] as const;
