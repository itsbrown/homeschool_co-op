import type { StoreCatalogItem } from "@/lib/store-catalog";
import { storeItemDetailPath } from "@/lib/store-catalog";
import { formatStoreListingPrice } from "@/lib/store-catalog-display";

export type StoreItemSharePayload = {
  url: string;
  title: string;
  text: string;
};

const DEFAULT_DESCRIPTION_MAX = 280;

export function truncateStoreShareText(text: string, max = DEFAULT_DESCRIPTION_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildStoreItemShareUrl(
  item: Pick<StoreCatalogItem, "slug">,
  schoolSlug: string,
  sharerUserId?: number | null,
): string {
  const path = storeItemDetailPath(schoolSlug, item);
  const url = new URL(path, "https://placeholder.local");
  if (sharerUserId != null && sharerUserId > 0) {
    url.searchParams.set("userId", String(sharerUserId));
  }
  return `${url.pathname}${url.search}`;
}

export function buildStoreItemSharePayload(
  item: StoreCatalogItem,
  schoolSlug: string,
  options?: {
    sharerUserId?: number | null;
    origin?: string;
  },
): StoreItemSharePayload {
  const origin =
    options?.origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://accounts.americanseekersacademy.com");
  const relativeUrl = buildStoreItemShareUrl(item, schoolSlug, options?.sharerUserId);
  const url = `${origin.replace(/\/$/, "")}${relativeUrl}`;

  const price = formatStoreListingPrice(item);
  const description = item.description?.trim()
    ? truncateStoreShareText(item.description)
    : null;

  const textParts = [item.title, price, description, url].filter(Boolean) as string[];
  const text = textParts.join("\n\n");

  return { url, title: item.title, text };
}

export type StoreItemSocialShareLinks = {
  facebook: string;
  twitter: string;
  linkedin: string;
  email: string;
};

/** Direct share URLs for Facebook, X, LinkedIn, and email (not OS share sheet). */
export function buildStoreItemSocialShareLinks(payload: StoreItemSharePayload): StoreItemSocialShareLinks {
  const encodedUrl = encodeURIComponent(payload.url);
  const encodedTitle = encodeURIComponent(payload.title);
  const encodedText = encodeURIComponent(payload.text);
  const descriptionLine = payload.text.split("\n\n").slice(1, -1).join("\n\n");
  const encodedQuote = encodeURIComponent(descriptionLine || payload.title);
  const emailBody = `${payload.text}`;

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedQuote}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(emailBody)}`,
  };
}
