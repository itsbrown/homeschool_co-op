/**
 * Unit tests for public store listing URL slugs (no DB).
 */
import {
  assignStoreListingSlugs,
  attachSlugsToCatalogItems,
  slugifyStoreListingTitle,
} from '../lib/store-listing-slug';

describe('store listing slugs', () => {
  it('slugifyStoreListingTitle converts titles to kebab-case', () => {
    expect(slugifyStoreListingTitle('Kayak Quest – Week 1')).toBe('kayak-quest-week-1');
    expect(slugifyStoreListingTitle('  ASA T-Shirt!!!  ')).toBe('asa-t-shirt');
    expect(slugifyStoreListingTitle('')).toBe('program');
  });

  it('assignStoreListingSlugs deduplicates with numeric suffixes', () => {
    const slugs = assignStoreListingSlugs([
      { listingId: 1, title: 'Summer Camp' },
      { listingId: 2, title: 'Summer Camp' },
      { listingId: 3, title: 'Summer Camp' },
    ]);
    expect(slugs.get(1)).toBe('summer-camp');
    expect(slugs.get(2)).toBe('summer-camp-2');
    expect(slugs.get(3)).toBe('summer-camp-3');
  });

  it('attachSlugsToCatalogItems adds slug to each item', () => {
    const items = attachSlugsToCatalogItems([
      {
        listingId: 10,
        listingType: 'class',
        sourceId: 5,
        title: 'Art Studio',
        membersOnly: false,
        sortOrder: 0,
      },
    ]);
    expect(items[0].slug).toBe('art-studio');
  });
});
