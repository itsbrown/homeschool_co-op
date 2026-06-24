import { Router } from 'express';
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
  getStoreListingsBySchoolId,
  upsertStoreListing,
  updateStoreListing,
  getStoreOrdersBySchoolId,
  updateSchoolStoreSettings,
  getProgramDeliveryDocumentIds,
  setProgramDeliveryDocuments,
} from '../lib/store-storage';
import { storage } from '../storage';

const router = Router();

router.use(supabaseAuth, requireSchoolContext);

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
    console.error(err);
    res.status(500).json({ message: 'Failed to load store settings' });
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
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update store settings' });
  }
});

router.get('/products', async (req: any, res) => {
  const schoolId = parseInt(req.schoolId, 10);
  res.json(await getStoreProductsBySchoolId(schoolId));
});

router.post('/products', async (req: any, res) => {
  const schoolId = parseInt(req.schoolId, 10);
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    priceCents: z.number().int().positive(),
    imageUrl: z.string().nullable().optional(),
    inventoryQty: z.number().int().nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });
  const data = schema.parse(req.body);
  const product = await createStoreProduct({ schoolId, ...data });
  res.status(201).json(product);
});

router.patch('/products/:id', async (req: any, res) => {
  const id = parseInt(req.params.id, 10);
  const product = await updateStoreProduct(id, req.body);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

router.get('/listings', async (req: any, res) => {
  const schoolId = parseInt(req.schoolId, 10);
  res.json(await getStoreListingsBySchoolId(schoolId));
});

router.post('/listings', async (req: any, res) => {
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
});

router.patch('/listings/:id', async (req: any, res) => {
  const id = parseInt(req.params.id, 10);
  const listing = await updateStoreListing(id, req.body);
  if (!listing) return res.status(404).json({ message: 'Listing not found' });
  res.json(listing);
});

router.get('/orders', async (req: any, res) => {
  const schoolId = parseInt(req.schoolId, 10);
  res.json(await getStoreOrdersBySchoolId(schoolId));
});

router.get('/delivery-documents/:sourceType/:sourceId', async (req: any, res) => {
  const schoolId = parseInt(req.schoolId, 10);
  const sourceType = req.params.sourceType as 'class' | 'session';
  const sourceId = parseInt(req.params.sourceId, 10);
  const ids = await getProgramDeliveryDocumentIds(schoolId, sourceType, sourceId);
  res.json({ documentIds: ids });
});

router.put('/delivery-documents/:sourceType/:sourceId', async (req: any, res) => {
  const schoolId = parseInt(req.schoolId, 10);
  const sourceType = req.params.sourceType as 'class' | 'session';
  const sourceId = parseInt(req.params.sourceId, 10);
  const schema = z.object({ documentIds: z.array(z.number().int().positive()) });
  const { documentIds } = schema.parse(req.body);
  await setProgramDeliveryDocuments(schoolId, sourceType, sourceId, documentIds);
  res.json({ ok: true, documentIds });
});

export default router;
