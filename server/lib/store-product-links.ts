import { z } from 'zod';
import { extractAsinFromUrl } from './amazon-paapi';

/** Empty string → null; omitted → undefined; otherwise a trimmed URL. */
export const optionalProductUrlSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  },
  z.string().url().nullable().optional(),
);

export type StoreProductKind = 'owned' | 'affiliate';

export function resolveStoreProductLinkUpdate(input: {
  nextKind: StoreProductKind;
  incomingUrl: string | null | undefined;
  existingUrl: string | null;
  incomingAsin?: string | null;
  existingAsin: string | null;
}):
  | { ok: true; affiliateUrl: string | null; asin: string | null }
  | { ok: false; message: string } {
  const affiliateUrl =
    input.incomingUrl !== undefined ? input.incomingUrl : input.existingUrl;

  if (input.nextKind === 'affiliate' && !affiliateUrl) {
    return { ok: false, message: 'affiliateUrl is required for affiliate products' };
  }

  let asin =
    input.incomingAsin !== undefined
      ? input.incomingAsin
        ? input.incomingAsin.toUpperCase()
        : null
      : input.existingAsin;

  if (affiliateUrl) {
    const fromUrl = extractAsinFromUrl(affiliateUrl);
    if (fromUrl) asin = fromUrl;
  }

  return { ok: true, affiliateUrl, asin };
}
