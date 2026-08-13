import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import {
  normalizeStoreSlug,
  validateStoreSlug,
} from '../lib/store-config';
import {
  getStoreProductsBySchoolId,
  createStoreProduct,
  updateStoreProduct,
  getStoreProductById,
  getStoreListingsBySchoolId,
  upsertStoreListing,
  updateStoreListing,
  getStoreOrdersBySchoolId,
  updateSchoolStoreSettings,
  getProgramDeliveryDocumentIds,
  setProgramDeliveryDocuments,
} from '../lib/store-storage';
import { getStoreProgramsForSchool, patchStoreProgram } from '../lib/store-programs';
import { getPublicStoreSignups, buildStoreSignupsCsv } from '../lib/store-signups';
import { storage } from '../storage';
import {
  AmazonPaapiError,
  fetchAmazonProductByUrl,
} from '../lib/amazon-paapi';

const router = Router();

function isStoreSchemaMissing(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === '42P01' || code === '42703';
}

function handleStoreRouteError(res: Response, err: unknown, fallbackMessage: string) {
  console.error(err);
  if (isStoreSchemaMissing(err)) {
    return res.status(503).json({
      message:
        'Public store schema is missing on this database. Apply server/migrations/251-public-store.sql and 255-store-affiliate-products.sql, then restart the server.',
      code: 'STORE_SCHEMA_MISSING',
    });
  }
  return res.status(500).json({ message: fallbackMessage });
}

router.use(supabaseAuth, requireSchoolContext);

router.use(async (_req, _res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next();
  }
  try {
    const { ensurePublicStoreSchema } = await import('../lib/ensure-public-store-schema');
    await ensurePublicStoreSchema();
  } catch (err) {
    console.error('[store-admin] ensurePublicStoreSchema failed:', err);
  }
  next();
});

router.get('/settings', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const school = await storage.getSchool(schoolId);
    if (!school) return res.status(404).json({ message: 'School not found' });
    res.json({
      publicStoreEnabled: school.publicStoreEnabled ?? false,
      storeSlug: school.storeSlug ?? '',
      publicStoreSettings: school.publicStoreSettings ?? {},
    });
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to load store settings');
  }
});

const settingsSchema = z.object({
  publicStoreEnabled: z.boolean().optional(),
  storeSlug: z.string().optional(),
  publicStoreSettings: z.record(z.unknown()).optional(),
});

router.patch('/settings', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const parsed = settingsSchema.parse(req.body);
    if (parsed.storeSlug !== undefined) {
      const normalized = normalizeStoreSlug(parsed.storeSlug);
      const validation = validateStoreSlug(normalized);
      if (!validation.ok) return res.status(400).json({ message: validation.message });
      parsed.storeSlug = normalized;
    }
    const updated = await updateSchoolStoreSettings(schoolId, parsed);

    if (parsed.publicStoreEnabled === true) {
      const features = await storage.getSchoolFeatures(schoolId);
      if (!features.publicStore) {
        await storage.updateSchoolFeatures(schoolId, { ...features, publicStore: true });
      }
    }

    res.json(updated);
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to update store settings');
  }
});

router.get('/products', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    res.json(await getStoreProductsBySchoolId(schoolId));
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to load store products');
  }
});

router.get('/programs', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    res.json({ programs: await getStoreProgramsForSchool(schoolId) });
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to load store programs');
  }
});

const patchProgramSchema = z.object({
  isPublished: z.boolean().optional(),
  membersOnly: z.boolean().optional(),
  coverImage: z.string().nullable().optional(),
});

router.patch('/programs/:listingType/:sourceId', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const listingType = req.params.listingType;
    if (listingType !== 'session' && listingType !== 'class') {
      return res.status(400).json({ message: 'listingType must be session or class' });
    }
    const sourceId = parseInt(req.params.sourceId, 10);
    if (Number.isNaN(sourceId)) {
      return res.status(400).json({ message: 'Invalid source ID' });
    }
    const body = patchProgramSchema.parse(req.body);
    const updated = await patchStoreProgram({
      schoolId,
      listingType,
      sourceId,
      ...body,
    });
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update program';
    if (message.includes('not found')) {
      return res.status(404).json({ message });
    }
    handleStoreRouteError(res, err, 'Failed to update store program');
  }
});

router.post('/products', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const schema = z
      .object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        priceCents: z.number().int().positive(),
        imageUrl: z.string().nullable().optional(),
        inventoryQty: z.number().int().nullable().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        productKind: z.enum(['owned', 'affiliate']).optional(),
        affiliateUrl: z.string().url().nullable().optional(),
        asin: z.string().min(10).max(10).nullable().optional(),
        affiliateMetadata: z.record(z.unknown()).optional(),
      })
      .superRefine((data, ctx) => {
        if (data.productKind === 'affiliate') {
          if (!data.affiliateUrl) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'affiliateUrl is required for affiliate products',
              path: ['affiliateUrl'],
            });
          }
          if (!data.asin) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'asin is required for affiliate products',
              path: ['asin'],
            });
          }
        }
      });
    const data = schema.parse(req.body);
    const productKind = data.productKind ?? 'owned';
    const product = await createStoreProduct({
      schoolId,
      name: data.name,
      description: data.description,
      priceCents: data.priceCents,
      imageUrl: data.imageUrl,
      inventoryQty: productKind === 'affiliate' ? null : data.inventoryQty,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
      productKind,
      affiliateUrl: productKind === 'affiliate' ? data.affiliateUrl : null,
      asin: productKind === 'affiliate' ? data.asin?.toUpperCase() : null,
      affiliateMetadata:
        productKind === 'affiliate' ? (data.affiliateMetadata ?? {}) : {},
    });
    res.status(201).json(product);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid product', errors: err.flatten() });
    }
    handleStoreRouteError(res, err, 'Failed to create store product');
  }
});

router.post('/affiliate/preview', async (req: any, res) => {
  try {
    const schema = z.object({ url: z.string().min(1) });
    const { url } = schema.parse(req.body);
    const preview = await fetchAmazonProductByUrl(url);
    res.json({
      asin: preview.asin,
      name: preview.name,
      description: preview.description,
      priceCents: preview.priceCents,
      imageUrl: preview.imageUrl,
      detailPageUrl: preview.detailPageUrl,
      affiliateUrl: url.trim(),
      affiliateMetadata: preview.raw,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'URL is required' });
    }
    if (err instanceof AmazonPaapiError) {
      const status =
        err.code === 'NOT_CONFIGURED'
          ? 503
          : err.code === 'INVALID_URL' || err.code === 'ASIN_NOT_FOUND'
            ? 400
            : 502;
      return res.status(status).json({ message: err.message, code: err.code });
    }
    handleStoreRouteError(res, err, 'Failed to fetch Amazon product');
  }
});

router.patch('/products/:id', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const id = parseInt(req.params.id, 10);
    const existing = await getStoreProductById(id);
    if (!existing || existing.schoolId !== schoolId) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      priceCents: z.number().int().positive().optional(),
      imageUrl: z.string().nullable().optional(),
      inventoryQty: z.number().int().nullable().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      productKind: z.enum(['owned', 'affiliate']).optional(),
      affiliateUrl: z.string().url().nullable().optional(),
      asin: z.string().min(10).max(10).nullable().optional(),
      affiliateMetadata: z.record(z.unknown()).optional(),
    });
    const data = schema.parse(req.body);
    const nextKind = data.productKind ?? existing.productKind;
    const product = await updateStoreProduct(id, {
      ...data,
      asin: data.asin != null ? data.asin.toUpperCase() : data.asin,
      inventoryQty: nextKind === 'affiliate' ? null : data.inventoryQty,
      affiliateUrl: nextKind === 'affiliate' ? (data.affiliateUrl ?? existing.affiliateUrl) : null,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid product update', errors: err.flatten() });
    }
    handleStoreRouteError(res, err, 'Failed to update store product');
  }
});

router.get('/listings', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    res.json(await getStoreListingsBySchoolId(schoolId));
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to load store listings');
  }
});

router.post('/listings', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const schema = z.object({
      listingType: z.enum(['product', 'session', 'class']),
      sourceId: z.number().int().positive(),
      isPublished: z.boolean(),
      membersOnly: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    });
    const data = schema.parse(req.body);
    const listing = await upsertStoreListing({ schoolId, ...data });
    res.status(201).json(listing);
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to create store listing');
  }
});

router.patch('/listings/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const listing = await updateStoreListing(id, req.body);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to update store listing');
  }
});

router.get('/orders', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    res.json(await getStoreOrdersBySchoolId(schoolId));
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to load store orders');
  }
});

router.get('/signups', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    res.json(await getPublicStoreSignups(schoolId));
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to load store sign-ups');
  }
});

router.get('/signups/export', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const rows = await getPublicStoreSignups(schoolId);
    const csv = buildStoreSignupsCsv(rows);
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="store-signups-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to export store sign-ups');
  }
});

router.get('/delivery-documents/:sourceType/:sourceId', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const sourceType = req.params.sourceType as 'class' | 'session';
    const sourceId = parseInt(req.params.sourceId, 10);
    const ids = await getProgramDeliveryDocumentIds(schoolId, sourceType, sourceId);
    res.json({ documentIds: ids });
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to load delivery documents');
  }
});

router.put('/delivery-documents/:sourceType/:sourceId', async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId, 10);
    const sourceType = req.params.sourceType as 'class' | 'session';
    const sourceId = parseInt(req.params.sourceId, 10);
    const schema = z.object({ documentIds: z.array(z.number().int().positive()) });
    const { documentIds } = schema.parse(req.body);
    await setProgramDeliveryDocuments(schoolId, sourceType, sourceId, documentIds);
    res.json({ ok: true, documentIds });
  } catch (err) {
    handleStoreRouteError(res, err, 'Failed to save delivery documents');
  }
});

export default router;
