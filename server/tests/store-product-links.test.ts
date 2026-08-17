import { resolveStoreProductLinkUpdate } from '../lib/store-product-links';

describe('resolveStoreProductLinkUpdate', () => {
  it('keeps an owned merch URL when PATCH omits affiliateUrl', () => {
    const result = resolveStoreProductLinkUpdate({
      nextKind: 'owned',
      incomingUrl: undefined,
      existingUrl: 'https://accessliteracy.com/notebook',
      existingAsin: null,
    });
    expect(result).toEqual({
      ok: true,
      affiliateUrl: 'https://accessliteracy.com/notebook',
      asin: null,
    });
  });

  it('saves an owned merch URL and clears it when sent empty', () => {
    const saved = resolveStoreProductLinkUpdate({
      nextKind: 'owned',
      incomingUrl: 'https://accessliteracy.com/notebook',
      existingUrl: null,
      existingAsin: null,
    });
    expect(saved).toEqual({
      ok: true,
      affiliateUrl: 'https://accessliteracy.com/notebook',
      asin: null,
    });

    const cleared = resolveStoreProductLinkUpdate({
      nextKind: 'owned',
      incomingUrl: null,
      existingUrl: 'https://accessliteracy.com/notebook',
      existingAsin: null,
    });
    expect(cleared).toEqual({ ok: true, affiliateUrl: null, asin: null });
  });

  it('requires an affiliate URL for affiliate products', () => {
    expect(
      resolveStoreProductLinkUpdate({
        nextKind: 'affiliate',
        incomingUrl: null,
        existingUrl: null,
        existingAsin: 'B08STORE01',
      }),
    ).toEqual({
      ok: false,
      message: 'affiliateUrl is required for affiliate products',
    });
  });

  it('refreshes ASIN from a /dp/ URL and keeps ASIN for search-only links', () => {
    const fromDp = resolveStoreProductLinkUpdate({
      nextKind: 'affiliate',
      incomingUrl: 'https://www.amazon.com/dp/B08NEWASIN?tag=asa-20',
      existingUrl: 'https://www.amazon.com/dp/B08OLDASIN?tag=asa-20',
      existingAsin: 'B08OLDASIN',
    });
    expect(fromDp).toEqual({
      ok: true,
      affiliateUrl: 'https://www.amazon.com/dp/B08NEWASIN?tag=asa-20',
      asin: 'B08NEWASIN',
    });

    const searchOnly = resolveStoreProductLinkUpdate({
      nextKind: 'affiliate',
      incomingUrl:
        'https://www.amazon.com/s?k=Dimensions+Math&tag=asa-20',
      existingUrl: 'https://www.amazon.com/s?k=old&tag=asa-20',
      existingAsin: 'B08KEEPASIN',
    });
    expect(searchOnly).toEqual({
      ok: true,
      affiliateUrl: 'https://www.amazon.com/s?k=Dimensions+Math&tag=asa-20',
      asin: 'B08KEEPASIN',
    });
  });
});
