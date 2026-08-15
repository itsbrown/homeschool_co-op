/**
 * CSV → supply items, resolving Amazon URLs to affiliate store_products.
 */
import {
  parseSupplyCsvText,
  type ParsedSupplyCsvRow,
  type SupplyCsvColumnMapping,
} from "@shared/supply-list-csv";
import type { SupplyOwnerType } from "@shared/supply-list";
import { AmazonPaapiError, extractAsinFromUrl, fetchAmazonProductByUrl } from "./amazon-paapi";
import {
  createStoreProduct,
  findAffiliateProductByAsin,
  upsertStoreListing,
  type StoreProduct,
} from "./store-storage";
import {
  SupplyListError,
  assertOwnerInSchool,
  listSupplyItems,
  replaceSupplyItems,
  type SupplyItemWrite,
} from "./supply-lists";

export type SupplyCsvAmazonStatus = "reuse" | "create" | "skip" | "error";

export type SupplyCsvImportPreviewRow = {
  row: number;
  name: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  amazonUrl: string | null;
  amazonStatus: SupplyCsvAmazonStatus;
  amazonMessage?: string;
  storeProductId: number | null;
};

export type SupplyCsvImportResult = {
  items: Array<SupplyItemWrite & { id?: number }>;
  preview: SupplyCsvImportPreviewRow[];
  createdProducts: number;
  reusedProducts: number;
  warnings: Array<{ row: number; message: string }>;
};

type AffiliateCacheEntry = {
  product: StoreProduct | null;
  status: Exclude<SupplyCsvAmazonStatus, "skip">;
  error?: string;
  asin?: string;
};

function toWrite(row: SupplyCsvImportPreviewRow): SupplyItemWrite {
  return {
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    notes: row.notes,
    scope: "student",
    required: true,
    storeProductId: row.storeProductId,
  };
}

function cacheKeyForAsin(asin: string): string {
  return `asin:${asin.trim().toUpperCase()}`;
}

async function resolveAffiliateProduct(
  schoolId: number,
  url: string,
  cache: Map<string, AffiliateCacheEntry>,
  dryRun: boolean,
): Promise<AffiliateCacheEntry> {
  const trimmed = url.trim();
  const urlKey = `url:${trimmed}`;
  const urlHit = cache.get(urlKey);
  if (urlHit) {
    if (urlHit.error) return urlHit;
    return { ...urlHit, status: "reuse" };
  }

  const urlAsin = extractAsinFromUrl(trimmed)?.toUpperCase() ?? null;
  if (urlAsin) {
    const asinHit = cache.get(cacheKeyForAsin(urlAsin));
    if (asinHit) {
      const result: AffiliateCacheEntry = asinHit.error ? asinHit : { ...asinHit, status: "reuse" };
      cache.set(urlKey, result);
      return result;
    }
    const existing = await findAffiliateProductByAsin(schoolId, urlAsin);
    if (existing) {
      const result: AffiliateCacheEntry = { product: existing, status: "reuse", asin: urlAsin };
      cache.set(urlKey, result);
      cache.set(cacheKeyForAsin(urlAsin), result);
      return result;
    }
  }

  try {
    const preview = await fetchAmazonProductByUrl(trimmed);
    const asin = preview.asin.toUpperCase();
    const asinHit = cache.get(cacheKeyForAsin(asin));
    if (asinHit) {
      const result: AffiliateCacheEntry = asinHit.error ? asinHit : { ...asinHit, status: "reuse" };
      cache.set(urlKey, result);
      return result;
    }
    const existing = await findAffiliateProductByAsin(schoolId, asin);
    if (existing) {
      const result: AffiliateCacheEntry = { product: existing, status: "reuse", asin };
      cache.set(urlKey, result);
      cache.set(cacheKeyForAsin(asin), result);
      return result;
    }

    if (dryRun) {
      const result: AffiliateCacheEntry = { product: null, status: "create", asin };
      cache.set(urlKey, result);
      cache.set(cacheKeyForAsin(asin), result);
      return result;
    }

    const priceCents = preview.priceCents && preview.priceCents > 0 ? preview.priceCents : 2499;
    const product = await createStoreProduct({
      schoolId,
      name: preview.name || `Amazon product ${asin}`,
      description: preview.description,
      priceCents,
      imageUrl: preview.imageUrl,
      inventoryQty: null,
      isActive: true,
      sortOrder: 0,
      productKind: "affiliate",
      affiliateUrl: trimmed,
      asin,
      affiliateMetadata: preview.raw ?? {},
    });
    await upsertStoreListing({
      schoolId,
      listingType: "product",
      sourceId: product.id,
      isPublished: true,
      membersOnly: false,
    });
    const result: AffiliateCacheEntry = { product, status: "create", asin };
    cache.set(urlKey, result);
    cache.set(cacheKeyForAsin(asin), result);
    return result;
  } catch (err) {
    const message =
      err instanceof AmazonPaapiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not fetch Amazon product";
    const result: AffiliateCacheEntry = {
      product: null,
      status: "error",
      error: message,
      asin: urlAsin ?? undefined,
    };
    cache.set(urlKey, result);
    if (urlAsin) cache.set(cacheKeyForAsin(urlAsin), result);
    return result;
  }
}

async function buildPreviewRows(
  schoolId: number,
  parsedRows: ParsedSupplyCsvRow[],
  dryRun: boolean,
): Promise<{
  preview: SupplyCsvImportPreviewRow[];
  createdProducts: number;
  reusedProducts: number;
  warnings: Array<{ row: number; message: string }>;
}> {
  const cache = new Map<string, AffiliateCacheEntry>();
  const preview: SupplyCsvImportPreviewRow[] = [];
  const warnings: Array<{ row: number; message: string }> = [];
  const createdKeys = new Set<string>();
  const reusedKeys = new Set<string>();

  for (const row of parsedRows) {
    if (!row.amazonUrl) {
      preview.push({
        row: row.sourceRow,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        notes: row.notes,
        amazonUrl: null,
        amazonStatus: "skip",
        storeProductId: null,
      });
      continue;
    }

    const resolved = await resolveAffiliateProduct(schoolId, row.amazonUrl, cache, dryRun);
    const productKey = resolved.asin || row.amazonUrl;
    if (resolved.error) {
      warnings.push({
        row: row.sourceRow,
        message: `Amazon link not linked: ${resolved.error}`,
      });
      preview.push({
        row: row.sourceRow,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        notes: row.notes,
        amazonUrl: row.amazonUrl,
        amazonStatus: "error",
        amazonMessage: resolved.error,
        storeProductId: null,
      });
      continue;
    }

    if (resolved.status === "create") {
      createdKeys.add(productKey);
    } else if (resolved.status === "reuse" && !createdKeys.has(productKey)) {
      reusedKeys.add(productKey);
    }

    preview.push({
      row: row.sourceRow,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      notes: row.notes,
      amazonUrl: row.amazonUrl,
      amazonStatus: resolved.status,
      storeProductId: resolved.product?.id ?? null,
    });
  }

  return {
    preview,
    createdProducts: createdKeys.size,
    reusedProducts: reusedKeys.size,
    warnings,
  };
}

export async function importSupplyListFromCsv(params: {
  schoolId: number;
  ownerType: SupplyOwnerType;
  ownerId: number;
  csvText: string;
  mapping?: SupplyCsvColumnMapping | null;
  mode: "replace" | "append";
  dryRun: boolean;
}): Promise<SupplyCsvImportResult> {
  await assertOwnerInSchool(params.schoolId, params.ownerType, params.ownerId);

  let parsed;
  try {
    parsed = parseSupplyCsvText(params.csvText, params.mapping);
  } catch (err) {
    throw new SupplyListError(err instanceof Error ? err.message : "Could not parse CSV", 400);
  }
  if (parsed.rows.length === 0) {
    throw new SupplyListError("No supply items found in this CSV.", 400);
  }

  if (params.mode === "append") {
    const existing = await listSupplyItems(params.schoolId, params.ownerType, params.ownerId);
    if (existing.length + parsed.rows.length > 100) {
      throw new SupplyListError(
        "Import would exceed 100 items on this list. Remove some rows or replace instead of append.",
        400,
      );
    }
  }

  const built = await buildPreviewRows(params.schoolId, parsed.rows, params.dryRun);
  const incoming = built.preview.map(toWrite);

  if (params.dryRun) {
    return { ...built, items: incoming };
  }

  let items = incoming;
  if (params.mode === "append") {
    const existing = await listSupplyItems(params.schoolId, params.ownerType, params.ownerId);
    const existingWrites: SupplyItemWrite[] = existing.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      scope: item.scope as SupplyItemWrite["scope"],
      required: item.required,
      notes: item.notes,
      storeProductId: item.storeProductId,
    }));
    items = [...existingWrites, ...incoming];
  }

  const saved = await replaceSupplyItems(params.schoolId, params.ownerType, params.ownerId, items);
  return { ...built, items: saved };
}
