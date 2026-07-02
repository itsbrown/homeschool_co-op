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
};

export async function buildStoreCatalogItem(
  listing: StoreListing,
): Promise<StoreCatalogItem | null> {
  if (!listing.isPublished) return null;

  if (listing.listingType === 'product') {
    const product = await getStoreProductById(listing.sourceId);
    if (!product?.isActive) return null;
    return {
      listingId: listing.id,
      listingType: 'product',
      sourceId: product.id,
      title: product.name,
      description: product.description,
      priceCents: product.priceCents,
      imageUrl: product.imageUrl,
      membersOnly: listing.membersOnly,
      sortOrder: listing.sortOrder,
      inStock: product.inventoryQty == null || product.inventoryQty > 0,
    };
  }

  if (listing.listingType === 'session') {
    const session = await getSessionById(listing.sourceId);
    if (!session || !session.enrollmentOpen) return null;
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
