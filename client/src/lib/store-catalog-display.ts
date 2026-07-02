import type { StoreCatalogItem } from "@/lib/store-catalog";
import { safeFormatDate } from "@/utils/safeFormatDate";

const STORE_DATE_FORMAT = "MMM d, yyyy";

export type StoreCatalogSection = {
  id: "programs" | "shop";
  title: string;
  description: string;
  items: StoreCatalogItem[];
};

export function storeListingTypeLabel(listingType: StoreCatalogItem["listingType"]): string {
  switch (listingType) {
    case "product":
      return "Merch";
    case "session":
      return "Session";
    case "class":
      return "Program";
  }
}

export function formatStoreListingDateRange(
  start?: string | null,
  end?: string | null,
): string | null {
  if (!start && !end) return null;
  if (start && end) {
    return `${safeFormatDate(start, STORE_DATE_FORMAT)} – ${safeFormatDate(end, STORE_DATE_FORMAT)}`;
  }
  if (start) return `Starts ${safeFormatDate(start, STORE_DATE_FORMAT)}`;
  return `Through ${safeFormatDate(end!, STORE_DATE_FORMAT)}`;
}

export function formatStoreMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Primary price line for catalog cards and detail headers. */
export function formatStoreListingPrice(item: StoreCatalogItem): string | null {
  if (item.listingType === "product" && item.priceCents != null) {
    return formatStoreMoney(item.priceCents);
  }
  if (item.listingType === "class" && item.priceCents != null) {
    return formatStoreMoney(item.priceCents);
  }
  if (item.listingType === "session") {
    const parts: string[] = [];
    if (item.halfDayPrice != null) parts.push(`Half ${formatStoreMoney(item.halfDayPrice)}`);
    if (item.fullDayPrice != null) parts.push(`Full ${formatStoreMoney(item.fullDayPrice)}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  return null;
}

export function groupStoreCatalogItems(items: StoreCatalogItem[]): StoreCatalogSection[] {
  const programs = items.filter((item) => item.listingType === "session" || item.listingType === "class");
  const shop = items.filter((item) => item.listingType === "product");
  const sections: StoreCatalogSection[] = [];

  if (programs.length > 0) {
    sections.push({
      id: "programs",
      title: "Programs & classes",
      description: "Enroll in sessions and classes — full schedules and descriptions on each program page.",
      items: programs,
    });
  }
  if (shop.length > 0) {
    sections.push({
      id: "shop",
      title: "Shop",
      description: "School merch and supplies — sizes, details, and photos on each product page.",
      items: shop,
    });
  }

  return sections;
}

export function storeListingDetailHeading(listingType: StoreCatalogItem["listingType"]): string {
  return listingType === "product" ? "About this item" : "About this program";
}
