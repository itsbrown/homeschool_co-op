import type { StoreCatalogItem } from './store-catalog-items';

/** URL segment from a listing title (e.g. "Kayak Quest – Week 1" → "kayak-quest-week-1"). */
export function slugifyStoreListingTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return slug || 'program';
}

export function assignStoreListingSlugs(
  items: Pick<StoreCatalogItem, 'listingId' | 'title'>[],
): Map<number, string> {
  const used = new Set<string>();
  const byListingId = new Map<number, string>();

  for (const item of items) {
    const base = slugifyStoreListingTitle(item.title);
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(slug);
    byListingId.set(item.listingId, slug);
  }

  return byListingId;
}

export function attachSlugsToCatalogItems<T extends StoreCatalogItem>(
  items: T[],
): (T & { slug: string })[] {
  const slugMap = assignStoreListingSlugs(items);
  return items.map((item) => ({
    ...item,
    slug: slugMap.get(item.listingId) ?? slugifyStoreListingTitle(item.title),
  }));
}
