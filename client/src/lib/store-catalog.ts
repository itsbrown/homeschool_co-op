export type StoreCatalogItem = {
  listingId: number;
  listingType: "product" | "session" | "class";
  sourceId: number;
  title: string;
  description?: string | null;
  priceCents?: number;
  halfDayPrice?: number;
  fullDayPrice?: number;
  imageUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  membersOnly: boolean;
  inStock?: boolean;
};

export function storeItemDetailPath(schoolSlug: string, listingId: number): string {
  return `/store/${schoolSlug}/item/${listingId}`;
}
