import { eventDisplayPriceCents, parseStoreEventRsvp } from '@shared/store-event-rsvp';
import type { StoreListing } from '@shared/schema';
import { isClassEligibleForPublicStore } from './store-programs';
import {
  getClassById,
  getSessionById,
  getStoreProductById,
} from './store-storage';

export type StoreCatalogItem = {
  listingId: number;
  listingType: 'product' | 'session' | 'class';
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
  sortOrder: number;
  inStock?: boolean;
  /** Owned merch, Amazon affiliate, or event RSVP. */
  productKind?: 'owned' | 'affiliate' | 'event';
  affiliateUrl?: string | null;
  /** Owned merch that cannot be shipped — pickup at school only. Events are always pickup. */
  pickupOnly?: boolean;
  rsvp?: {
    startsOn: string;
    startTime: string;
    endTime: string;
    location: string;
    closeOn: string | null;
    attendees: Array<{ type: 'adult' | 'children' | 'guests'; enabled: boolean; priceCents: number }>;
    meals: Array<{ type: 'gluten_free' | 'vegan' | 'dairy_free' | 'other'; enabled: boolean }>;
  } | null;
};

export async function buildStoreCatalogItem(
  listing: StoreListing,
): Promise<StoreCatalogItem | null> {
  if (!listing.isPublished) return null;

  if (listing.listingType === 'product') {
    const product = await getStoreProductById(listing.sourceId);
    if (!product?.isActive) return null;
    const eventRsvp = product.productKind === 'event' ? parseStoreEventRsvp(product.rsvp) : null;
    return {
      listingId: listing.id,
      listingType: 'product',
      sourceId: product.id,
      title: product.name,
      description: product.description,
      priceCents: eventRsvp ? eventDisplayPriceCents(eventRsvp) : product.priceCents,
      imageUrl: product.imageUrl,
      startDate: eventRsvp?.startsOn ?? null,
      membersOnly: listing.membersOnly,
      sortOrder: listing.sortOrder,
      inStock:
        product.productKind === 'event' ||
        product.productKind === 'affiliate' ||
        Boolean(product.affiliateUrl?.trim())
          ? true
          : product.inventoryQty == null || product.inventoryQty > 0,
      productKind: (product.productKind as 'owned' | 'affiliate' | 'event') ?? 'owned',
      affiliateUrl: product.affiliateUrl ?? null,
      pickupOnly:
        product.productKind === 'affiliate' ? false : product.productKind === 'event' ? true : Boolean(product.pickupOnly),
      rsvp: eventRsvp
        ? {
            startsOn: eventRsvp.startsOn,
            startTime: eventRsvp.startTime,
            endTime: eventRsvp.endTime,
            location: eventRsvp.location,
            closeOn: eventRsvp.closeOn,
            attendees: eventRsvp.attendees.map((row) => ({
              type: row.type,
              enabled: row.enabled,
              priceCents: row.priceCents,
            })),
            meals: eventRsvp.meals.map((row) => ({ type: row.type, enabled: row.enabled })),
          }
        : null,
    };
  }

  if (listing.listingType === 'session') {
    const session = await getSessionById(listing.sourceId);
    if (!session || !session.enrollmentOpen || session.requireMemberId) return null;
    return {
      listingId: listing.id,
      listingType: 'session',
      sourceId: session.id,
      title: session.name,
      description: session.description,
      halfDayPrice: session.halfDayPrice,
      fullDayPrice: session.fullDayPrice,
      imageUrl: session.coverImage,
      startDate: session.startDate,
      endDate: session.endDate,
      membersOnly: listing.membersOnly,
      sortOrder: listing.sortOrder,
    };
  }

  if (listing.listingType === 'class') {
    const cls = await getClassById(listing.sourceId);
    if (!cls || !isClassEligibleForPublicStore(cls)) return null;
    return {
      listingId: listing.id,
      listingType: 'class',
      sourceId: cls.id,
      title: cls.title,
      description: cls.description,
      priceCents: cls.price,
      imageUrl: cls.coverImage,
      startDate: cls.startDate,
      endDate: cls.endDate,
      membersOnly: listing.membersOnly,
      sortOrder: listing.sortOrder,
    };
  }

  return null;
}

/** Build published catalog rows with URL slugs assigned per school catalog. */
export async function getPublishedStoreCatalogWithSlugs(
  schoolId: number,
): Promise<(StoreCatalogItem & { slug: string })[]> {
  const { getPublishedStoreListings } = await import('./store-storage');
  const { attachSlugsToCatalogItems } = await import('./store-listing-slug');

  const listings = await getPublishedStoreListings(schoolId);
  const catalog: StoreCatalogItem[] = [];
  for (const listing of listings) {
    const item = await buildStoreCatalogItem(listing);
    if (item) catalog.push(item);
  }
  const sorted = catalog.sort((a, b) => a.sortOrder - b.sortOrder);
  return attachSlugsToCatalogItems(sorted);
}

/** Resolve a catalog URL key (numeric listing id or title slug). */
export async function resolvePublishedStoreCatalogItem(
  schoolId: number,
  catalogKey: string,
): Promise<(StoreCatalogItem & { slug: string }) | null> {
  const numericId = parseInt(catalogKey, 10);
  const catalog = await getPublishedStoreCatalogWithSlugs(schoolId);

  if (Number.isFinite(numericId) && String(numericId) === catalogKey.trim()) {
    return catalog.find((item) => item.listingId === numericId) ?? null;
  }

  return catalog.find((item) => item.slug === catalogKey) ?? null;
}
