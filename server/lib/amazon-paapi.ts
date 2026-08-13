import { createHash, createHmac } from 'crypto';

export type AmazonProductPreview = {
  asin: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  detailPageUrl: string | null;
  raw: Record<string, unknown>;
};

export class AmazonPaapiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_CONFIGURED'
      | 'INVALID_URL'
      | 'ASIN_NOT_FOUND'
      | 'PAAPI_ERROR'
      | 'NETWORK',
  ) {
    super(message);
    this.name = 'AmazonPaapiError';
  }
}

const ASIN_RE = /^[A-Z0-9]{10}$/i;
const SHORT_LINK_HOSTS = new Set(['amzn.to', 'a.co', 'amzn.com']);
const AMAZON_HOST_RE =
  /^(?:www\.)?amazon\.(?:com|co\.uk|ca|de|fr|es|it|co\.jp|com\.au|in|com\.mx|com\.br|nl|se|pl|com\.tr|ae|sg|com\.be)$/i;

function getPaapiConfig() {
  const accessKey = process.env.AMAZON_PAAPI_ACCESS_KEY?.trim();
  const secretKey = process.env.AMAZON_PAAPI_SECRET_KEY?.trim();
  const partnerTag = process.env.AMAZON_PAAPI_PARTNER_TAG?.trim();
  const host = process.env.AMAZON_PAAPI_HOST?.trim() || 'webservices.amazon.com';
  const region = process.env.AMAZON_PAAPI_REGION?.trim() || 'us-east-1';
  const marketplace = process.env.AMAZON_PAAPI_MARKETPLACE?.trim() || 'www.amazon.com';
  return { accessKey, secretKey, partnerTag, host, region, marketplace };
}

export function isAmazonPaapiConfigured(): boolean {
  const { accessKey, secretKey, partnerTag } = getPaapiConfig();
  return Boolean(accessKey && secretKey && partnerTag);
}

export function shouldUseAmazonPaapiMock(): boolean {
  if (process.env.AMAZON_PAAPI_MOCK === '1' || process.env.AMAZON_PAAPI_MOCK === 'true') {
    return true;
  }
  // E2E / local without credentials: deterministic fixture from ASIN
  return !isAmazonPaapiConfigured() && process.env.NODE_ENV !== 'production';
}

/** True for Amazon search-results URLs (`/s?k=…`). */
export function isAmazonSearchUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return false;
  }
  if (!AMAZON_HOST_RE.test(parsed.hostname) && parsed.hostname.toLowerCase() !== 'smile.amazon.com') {
    return false;
  }
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  return path === '/s' || path.startsWith('/s/');
}

export function extractAmazonSearchKeywords(urlString: string): string | null {
  if (!isAmazonSearchUrl(urlString)) return null;
  try {
    const keywords = new URL(urlString.trim()).searchParams.get('k');
    const trimmed = keywords?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

function isValidIsbn13(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]);
}

/** Convert a 978- ISBN-13 to ISBN-10 (Amazon book ASIN). 979- cannot convert. */
export function isbn13ToIsbn10(isbn13: string): string | null {
  const digits = isbn13.replace(/\D/g, '');
  if (digits.length !== 13 || !digits.startsWith('978') || !isValidIsbn13(digits)) {
    return null;
  }
  const body = digits.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * Number(body[i]);
  }
  const remainder = sum % 11;
  const checkNum = (11 - remainder) % 11;
  const check = checkNum === 10 ? 'X' : String(checkNum);
  return `${body}${check}`;
}

/** Book ASIN from an Associates search URL (`k=` includes ISBN-13/10 or a B0… ASIN). */
export function asinFromAmazonSearchUrl(urlString: string): string | null {
  const keywords = extractAmazonSearchKeywords(urlString);
  if (!keywords) return null;

  const compact = keywords.replace(/[-\s]/g, '');
  const isbn13 = compact.match(/97[89]\d{10}/)?.[0];
  if (isbn13 && isValidIsbn13(isbn13)) {
    const isbn10 = isbn13ToIsbn10(isbn13);
    if (isbn10) return isbn10.toUpperCase();
  }

  const withoutIsbn13 = compact.replace(/97[89]\d{10}/, '');
  const isbn10 = withoutIsbn13.match(/(\d{9}[\dXx])/i)?.[1];
  if (isbn10 && ASIN_RE.test(isbn10)) return isbn10.toUpperCase();

  const marketplaceAsin = keywords.match(/\b(B[0-9A-Z]{9})\b/i)?.[1];
  if (marketplaceAsin) return marketplaceAsin.toUpperCase();

  return null;
}

function displayNameFromSearchKeywords(keywords: string | null): string | null {
  if (!keywords) return null;
  const name = keywords
    .replace(/\b97[89]\d{10}\b/g, '')
    .replace(/\b\d{9}[\dXx]\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name || null;
}

/** Extract ASIN from common Amazon product URL shapes. */
export function extractAsinFromUrl(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return null;
  }

  const path = parsed.pathname;
  const dpMatch = path.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  if (dpMatch?.[1]) return dpMatch[1].toUpperCase();

  const asinParam = parsed.searchParams.get('asin') || parsed.searchParams.get('ASIN');
  if (asinParam && ASIN_RE.test(asinParam)) return asinParam.toUpperCase();

  const pathAsin = path.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  if (pathAsin?.[1] && ASIN_RE.test(pathAsin[1])) {
    // Avoid matching unrelated 10-char segments on non-product paths
    if (/\/(?:dp|gp|product)\b/i.test(path) || parsed.searchParams.has('tag')) {
      return pathAsin[1].toUpperCase();
    }
  }

  return null;
}

function isAllowedRedirectHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (SHORT_LINK_HOSTS.has(host)) return true;
  return AMAZON_HOST_RE.test(host);
}

/**
 * Follow short-link redirects (amzn.to / a.co) to a product URL.
 * Returns the final URL string (may still need ASIN extraction).
 */
export async function resolveAmazonProductUrl(
  urlString: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let current = urlString.trim();
  let parsed: URL;
  try {
    parsed = new URL(current);
  } catch {
    throw new AmazonPaapiError('Invalid Amazon URL', 'INVALID_URL');
  }

  if (!isAllowedRedirectHost(parsed.hostname)) {
    throw new AmazonPaapiError('URL must be an Amazon product or short link', 'INVALID_URL');
  }

  // Search pages never redirect to a single product — don't fetch Amazon HTML.
  if (isAmazonSearchUrl(current)) {
    return current;
  }

  // Already a full Amazon URL with ASIN — no need to resolve
  if (extractAsinFromUrl(current) && !SHORT_LINK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return current;
  }

  for (let i = 0; i < 5; i++) {
    const asin = extractAsinFromUrl(current);
    if (asin && !SHORT_LINK_HOSTS.has(new URL(current).hostname.toLowerCase())) {
      return current;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'ASA-Store-AffiliatePreview/1.0' },
      });
      const location = res.headers.get('location');
      if (!location || (res.status !== 301 && res.status !== 302 && res.status !== 303 && res.status !== 307 && res.status !== 308)) {
        return current;
      }
      const next = new URL(location, current);
      if (!isAllowedRedirectHost(next.hostname)) {
        throw new AmazonPaapiError('Redirect left Amazon hosts', 'INVALID_URL');
      }
      current = next.toString();
    } catch (err) {
      if (err instanceof AmazonPaapiError) throw err;
      throw new AmazonPaapiError('Failed to resolve Amazon short link', 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }

  return current;
}

export function buildMockAmazonProduct(
  asin: string,
  sourceUrl?: string,
  opts?: { name?: string | null },
): AmazonProductPreview {
  return {
    asin,
    name: opts?.name?.trim() || `Amazon product ${asin}`,
    description: `Mock affiliate preview for ASIN ${asin}. Replace with live PA-API data in production.`,
    priceCents: 2499,
    imageUrl: amazonAsinImageUrl(asin, partnerTagFromUrl(sourceUrl)),
    detailPageUrl: sourceUrl ?? `https://www.amazon.com/dp/${asin}`,
    raw: { mock: true, asin },
  };
}

/** Public Associates image widget — works without PA-API. `/images/I/{ASIN}` is not a real cover URL. */
export function amazonAsinImageUrl(asin: string, partnerTag?: string | null): string {
  const params = new URLSearchParams({
    _encoding: 'UTF8',
    MarketPlace: 'US',
    ASIN: asin,
    ServiceVersion: '20070822',
    ID: 'AsinImage',
    WS: '1',
    Format: '_SL500_',
  });
  if (partnerTag?.trim()) params.set('tag', partnerTag.trim());
  return `https://ws-na.amazon-adsystem.com/widgets/q?${params.toString()}`;
}

function partnerTagFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('tag');
  } catch {
    return null;
  }
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function amzDateParts(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const amzDate = iso.slice(0, 15) + 'Z';
  const dateStamp = iso.slice(0, 8);
  return { amzDate, dateStamp };
}

/** AWS SigV4 sign for PA-API 5.0 GetItems. */
export function signPaapiGetItemsRequest(params: {
  accessKey: string;
  secretKey: string;
  host: string;
  region: string;
  body: string;
  amzDate?: string;
  dateStamp?: string;
}): { authorization: string; amzDate: string; target: string } {
  const service = 'ProductAdvertisingAPI';
  const method = 'POST';
  const canonicalUri = '/paapi5/getitems';
  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
  const { amzDate, dateStamp } =
    params.amzDate && params.dateStamp
      ? { amzDate: params.amzDate, dateStamp: params.dateStamp }
      : amzDateParts();

  const payloadHash = sha256Hex(params.body);
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${params.host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${params.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${params.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, params.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${params.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate, target };
}

function mapGetItemsResponse(asin: string, data: any): AmazonProductPreview {
  const itemsResult = data?.ItemsResult?.Items ?? [];
  const item = itemsResult.find((i: any) => i?.ASIN === asin) ?? itemsResult[0];
  if (!item) {
    throw new AmazonPaapiError(`No PA-API item returned for ASIN ${asin}`, 'PAAPI_ERROR');
  }

  const title = item?.ItemInfo?.Title?.DisplayValue ?? `Amazon product ${asin}`;
  const features: string[] = (item?.ItemInfo?.Features?.DisplayValues ?? []).filter(
    (f: unknown): f is string => typeof f === 'string',
  );
  const brand = item?.ItemInfo?.ByLineInfo?.Brand?.DisplayValue;
  const descriptionParts = [
    brand ? `Brand: ${brand}` : null,
    features.length ? features.slice(0, 5).join('\n') : null,
  ].filter(Boolean);

  const amount = item?.Offers?.Listings?.[0]?.Price?.Amount;
  const priceCents =
    typeof amount === 'number' && Number.isFinite(amount)
      ? Math.round(amount * 100)
      : null;

  const imageUrl =
    item?.Images?.Primary?.Large?.URL ??
    item?.Images?.Primary?.Medium?.URL ??
    item?.Images?.Primary?.Small?.URL ??
    null;

  return {
    asin,
    name: String(title),
    description: descriptionParts.length ? descriptionParts.join('\n\n') : null,
    priceCents,
    imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
    detailPageUrl: typeof item?.DetailPageURL === 'string' ? item.DetailPageURL : null,
    raw: {
      asin: item.ASIN,
      brand: brand ?? null,
      features,
      detailPageUrl: item.DetailPageURL ?? null,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export type FetchAmazonProductDeps = {
  fetchImpl?: typeof fetch;
  resolveUrl?: typeof resolveAmazonProductUrl;
};

/**
 * Resolve Amazon URL → ASIN → product metadata (PA-API or mock).
 * Product `/dp/` URLs and Associates search links that include an ISBN/ASIN both work.
 */
export async function fetchAmazonProductByUrl(
  urlString: string,
  deps: FetchAmazonProductDeps = {},
): Promise<AmazonProductPreview> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolveUrl = deps.resolveUrl ?? resolveAmazonProductUrl;
  const sourceUrl = urlString.trim();

  let asin: string | null = null;
  let mockName: string | null = null;

  if (isAmazonSearchUrl(sourceUrl)) {
    asin = asinFromAmazonSearchUrl(sourceUrl);
    mockName = displayNameFromSearchKeywords(extractAmazonSearchKeywords(sourceUrl));
    if (!asin) {
      throw new AmazonPaapiError(
        'That search link has no ISBN or ASIN. Add the book ISBN to the search (for example Title+978XXXXXXXXXX) or paste a product URL with /dp/.',
        'ASIN_NOT_FOUND',
      );
    }
  } else {
    const resolvedUrl = await resolveUrl(sourceUrl, fetchImpl);
    asin = extractAsinFromUrl(resolvedUrl);
    if (!asin) {
      throw new AmazonPaapiError(
        'Could not find an ASIN in that Amazon link. Use a product URL with /dp/ASIN.',
        'ASIN_NOT_FOUND',
      );
    }
  }

  if (shouldUseAmazonPaapiMock()) {
    return buildMockAmazonProduct(asin, sourceUrl, { name: mockName });
  }

  if (!isAmazonPaapiConfigured()) {
    throw new AmazonPaapiError(
      'Amazon Product Advertising API is not configured. Set AMAZON_PAAPI_ACCESS_KEY, AMAZON_PAAPI_SECRET_KEY, and AMAZON_PAAPI_PARTNER_TAG.',
      'NOT_CONFIGURED',
    );
  }

  return paapiGetItem(asin, fetchImpl);
}

async function paapiGetItem(
  asin: string,
  fetchImpl: typeof fetch,
): Promise<AmazonProductPreview> {
  const { accessKey, secretKey, partnerTag, host, region, marketplace } = getPaapiConfig();
  const bodyObj = {
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplace,
    ItemIds: [asin],
    Resources: [
      'Images.Primary.Large',
      'Images.Primary.Medium',
      'ItemInfo.Title',
      'ItemInfo.Features',
      'ItemInfo.ByLineInfo.Brand',
      'Offers.Listings.Price',
    ],
  };
  const body = JSON.stringify(bodyObj);
  const signed = signPaapiGetItemsRequest({
    accessKey: accessKey!,
    secretKey: secretKey!,
    host,
    region,
    body,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchImpl(`https://${host}/paapi5/getitems`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Encoding': 'amz-1.0',
        'Content-Type': 'application/json; charset=utf-8',
        Host: host,
        'X-Amz-Date': signed.amzDate,
        'X-Amz-Target': signed.target,
        Authorization: signed.authorization,
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.Errors?.[0]?.Message ||
        data?.message ||
        `PA-API request failed (${res.status})`;
      throw new AmazonPaapiError(String(msg), 'PAAPI_ERROR');
    }
    if (data?.Errors?.length) {
      throw new AmazonPaapiError(String(data.Errors[0].Message || 'PA-API error'), 'PAAPI_ERROR');
    }
    return mapGetItemsResponse(asin, data);
  } catch (err) {
    if (err instanceof AmazonPaapiError) throw err;
    throw new AmazonPaapiError('Failed to call Amazon Product Advertising API', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}
