export type StoreCatalogItem = {
  listingId: number;
  listingType: "product" | "session" | "class";
  sourceId: number;
  title: string;
  slug: string;
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

export function storeItemDetailPath(
  schoolSlug: string,
  item: Pick<StoreCatalogItem, "slug"> | string,
): string {
  const slug = typeof item === "string" ? item : item.slug;
  return `/store/${schoolSlug}/${slug}`;
}

/** @deprecated Legacy `/item/:id` URLs — prefer slug paths from catalog API. */
export function legacyStoreItemDetailPath(schoolSlug: string, listingId: number): string {
  return `/store/${schoolSlug}/item/${listingId}`;
}
