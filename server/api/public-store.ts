import { Router } from 'express';
import { z } from 'zod';
import { supabaseAuth } from '../middleware/supabase-auth';
import { getStripeClient } from '../config/stripe';
import {
  generateStoreAccessToken,
  generateStoreSnapshotId,
  isPublicStoreGloballyEnabled,
  isStoreCheckoutAllowed,
  STORE_SNAPSHOT_TTL_MS,
} from '../lib/store-config';
import {
  getSchoolByStoreSlug,
  getPublishedStoreListings,
  getStoreProductById,
  getSessionById,
  getClassById,
  saveStoreCheckoutSnapshot,
  getStoreCheckoutSnapshot,
  createStoreOrder,
  getStoreOrderByAccessToken,
  updateStoreOrder,
} from '../lib/store-storage';
import { calculateStoreSnapshot, type StoreCartLineInput } from '../lib/store-pricing';
import {
  resolveStoreParent,
  resolveStoreChild,
} from '../lib/store-guest-checkout';
import { fulfillStoreCheckoutWithoutPayment } from '../lib/store-fulfillment';
import { resolveStoreDeliveryDocuments } from '../lib/store-documents';
import { storage } from '../storage';

const router = Router();

const cartLineSchema = z.object({
  lineId: z.string().min(1),
  listingId: z.number().int().positive(),
  listingType: z.enum(['product', 'session', 'class']),
  sourceId: z.number().int().positive(),
  quantity: z.number().int().positive().optional(),
  variant: z.enum(['half_day', 'full_day']).optional(),
  childId: z.number().int().positive().optional(),
  childDraft: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      birthdate: z.string().min(1),
      gradeLevel: z.string().min(1),
    })
    .optional(),
});

const snapshotBodySchema = z.object({
  cart: z.array(cartLineSchema).min(1),
});

const checkoutBodySchema = snapshotBodySchema.extend({
  parent: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  childAssignments: z.array(
    z.object({
      lineId: z.string().min(1),
      childId: z.number().int().positive().optional(),
      childDraft: cartLineSchema.shape.childDraft,
    }),
  ),
});

async function optionalUserId(req: any): Promise<number | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    await new Promise<void>((resolve, reject) => {
      supabaseAuth(req, {} as any, (err?: any) => (err ? reject(err) : resolve()));
    });
    return req.user?.id ?? null;
  } catch {
    return null;
  }
}

async function resolveStoreContext(storeSlug: string) {
  if (!isPublicStoreGloballyEnabled()) return null;
  const school = await getSchoolByStoreSlug(storeSlug);
  if (!school?.publicStoreEnabled) return null;
  return school;
}

router.get('/:storeSlug', async (req, res) => {
  try {
    const school = await resolveStoreContext(req.params.storeSlug);
    if (!school) return res.status(404).json({ message: 'Store not found' });
    res.json({
      schoolId: school.id,
      name: school.name,
      description: school.description,
      logo: school.logo,
      storeSlug: school.storeSlug,
      settings: school.publicStoreSettings ?? {},
      checkoutEnabled: isStoreCheckoutAllowed(),
    });
  } catch (err) {
    console.error('GET store:', err);
    res.status(500).json({ message: 'Failed to load store' });
  }
});

router.get('/:storeSlug/catalog', async (req, res) => {
  try {
    const school = await resolveStoreContext(req.params.storeSlug);
    if (!school) return res.status(404).json({ message: 'Store not found' });

    const listings = await getPublishedStoreListings(school.id);
    const catalog = [];

    for (const listing of listings) {
      if (listing.listingType === 'product') {
        const product = await getStoreProductById(listing.sourceId);
        if (!product?.isActive) continue;
        catalog.push({
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
        });
        continue;
      }
      if (listing.listingType === 'session') {
        const session = await getSessionById(listing.sourceId);
        if (!session || !session.enrollmentOpen) continue;
        catalog.push({
          listingId: listing.id,
          listingType: 'session',
          sourceId: session.id,
          title: session.name,
          description: session.description,
          halfDayPrice: session.halfDayPrice,
          fullDayPrice: session.fullDayPrice,
          startDate: session.startDate,
          endDate: session.endDate,
          membersOnly: listing.membersOnly,
          sortOrder: listing.sortOrder,
        });
        continue;
      }
      if (listing.listingType === 'class') {
        const cls = await getClassById(listing.sourceId);
        if (!cls?.isPublished) continue;
        catalog.push({
          listingId: listing.id,
          listingType: 'class',
          sourceId: cls.id,
          title: cls.title,
          description: cls.description,
          priceCents: cls.price,
          startDate: cls.startDate,
          endDate: cls.endDate,
          membersOnly: listing.membersOnly,
          sortOrder: listing.sortOrder,
        });
      }
    }

    res.json({ items: catalog.sort((a, b) => a.sortOrder - b.sortOrder) });
  } catch (err) {
    console.error('GET catalog:', err);
    res.status(500).json({ message: 'Failed to load catalog' });
  }
});

router.post('/:storeSlug/snapshot', async (req, res) => {
  try {
    const school = await resolveStoreContext(req.params.storeSlug);
    if (!school) return res.status(404).json({ message: 'Store not found' });

    const parsed = snapshotBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid cart', errors: parsed.error.flatten() });
    }

    const parentUserId = await optionalUserId(req);
    const snapshot = await calculateStoreSnapshot({
      schoolId: school.id,
      cartLines: parsed.data.cart as StoreCartLineInput[],
      parentUserId,
    });

    res.json({
      ...snapshot,
      checkoutEnabled: isStoreCheckoutAllowed(),
    });
  } catch (err) {
    console.error('POST snapshot:', err);
    res.status(500).json({ message: 'Failed to calculate totals' });
  }
});

router.post('/:storeSlug/checkout', async (req, res) => {
  try {
    const school = await resolveStoreContext(req.params.storeSlug);
    if (!school) return res.status(404).json({ message: 'Store not found' });
    if (!isStoreCheckoutAllowed()) {
      return res.status(503).json({ message: 'Store checkout is not enabled yet' });
    }

    const parsed = checkoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid checkout data', errors: parsed.error.flatten() });
    }

    const authenticatedUserId = await optionalUserId(req);
    const parentResult = await resolveStoreParent({
      email: parsed.data.parent.email,
      firstName: parsed.data.parent.firstName,
      lastName: parsed.data.parent.lastName,
      phone: parsed.data.parent.phone,
      schoolId: school.id,
      authenticatedUserId,
    });
    if ('error' in parentResult) {
      return res.status(409).json({
        message: 'An account with this email already exists. Please sign in to continue.',
        code: 'SIGN_IN_REQUIRED',
      });
    }

    const cartWithChildren = parsed.data.cart.map((line) => {
      const assignment = parsed.data.childAssignments.find((a) => a.lineId === line.lineId);
      return {
        ...line,
        childId: assignment?.childId,
        childDraft: assignment?.childDraft,
      };
    });

    const snapshot = await calculateStoreSnapshot({
      schoolId: school.id,
      cartLines: cartWithChildren as StoreCartLineInput[],
      parentUserId: parentResult.parentId,
    });

    const unavailable = snapshot.lines.filter((l) => l.unavailableReason);
    if (unavailable.length > 0) {
      return res.status(400).json({
        message: unavailable[0].unavailableReason,
        code: 'UNAVAILABLE',
      });
    }

    const childAssignments: Array<{
      lineId: string;
      childId: number;
      firstName: string;
      lastName: string;
    }> = [];

    const programLines = snapshot.lines.filter((l) => l.listingType !== 'product');
    for (const line of programLines) {
      const assignment = parsed.data.childAssignments.find((a) => a.lineId === line.lineId);
      if (!assignment) {
        return res.status(400).json({ message: `Child required for ${line.title}` });
      }
      const child = await resolveStoreChild({
        parentId: parentResult.parentId,
        parentEmail: parsed.data.parent.email,
        schoolId: school.id,
        childId: assignment.childId,
        draft: assignment.childDraft,
      });
      childAssignments.push({
        lineId: line.lineId,
        childId: child.childId,
        firstName: child.firstName,
        lastName: child.lastName,
      });
    }

    const snapshotId = generateStoreSnapshotId();
    const accessToken = generateStoreAccessToken();
    const expiresAt = new Date(Date.now() + STORE_SNAPSHOT_TTL_MS);

    const pendingOrder = await createStoreOrder({
      schoolId: school.id,
      parentId: parentResult.parentId,
      parentEmail: parsed.data.parent.email,
      parentName: `${parsed.data.parent.firstName} ${parsed.data.parent.lastName}`,
      status: snapshot.amountDueCents > 0 ? 'pending' : 'paid',
      totalCents: snapshot.amountDueCents,
      accessToken,
      metadata: { snapshotId },
    });

    await saveStoreCheckoutSnapshot({
      id: snapshotId,
      schoolId: school.id,
      storeSlug: req.params.storeSlug,
      parentEmail: parsed.data.parent.email,
      parentName: `${parsed.data.parent.firstName} ${parsed.data.parent.lastName}`,
      parentPhone: parsed.data.parent.phone ?? null,
      parentUserId: parentResult.parentId,
      payload: {
        lines: snapshot.lines,
        parentId: parentResult.parentId,
        parentEmail: parsed.data.parent.email,
        parentName: `${parsed.data.parent.firstName} ${parsed.data.parent.lastName}`,
        childAssignments,
        pendingStoreOrderId: pendingOrder.id,
        accessToken,
        membershipTotalCents: snapshot.membershipTotalCents,
      },
      amountDueCents: snapshot.amountDueCents,
      expiresAt,
      storeOrderId: pendingOrder.id,
    });

    if (snapshot.amountDueCents <= 0) {
      const result = await fulfillStoreCheckoutWithoutPayment(snapshotId);
      return res.json({
        checkoutUrl: null,
        successUrl: `/store/${req.params.storeSlug}/success?token=${accessToken}`,
        accessToken,
        waitlistEnrollments: result?.created ?? [],
      });
    }

    const stripe = await getStripeClient();
    const lineItems: Array<{ price_data: any; quantity: number }> = [];

    if (snapshot.membershipTotalCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `${school.name} Membership` },
          unit_amount: snapshot.membershipTotalCents,
        },
        quantity: 1,
      });
    }

    for (const line of snapshot.lines) {
      if (line.fulfillment !== 'paid' || line.lineTotalCents <= 0) continue;
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: line.title },
          unit_amount: line.unitPriceCents,
        },
        quantity: line.listingType === 'product' ? line.quantity : 1,
      });
    }

    const host = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      customer_email: parsed.data.parent.email,
      success_url: `${host}/store/${req.params.storeSlug}/success?token=${accessToken}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${host}/store/${req.params.storeSlug}/checkout`,
      metadata: {
        type: 'store_checkout',
        snapshotId,
        schoolId: String(school.id),
        storeSlug: req.params.storeSlug,
        storeOrderId: String(pendingOrder.id),
      },
      payment_intent_data: {
        metadata: {
          type: 'store_checkout',
          snapshotId,
          schoolId: String(school.id),
          storeSlug: req.params.storeSlug,
          storeOrderId: String(pendingOrder.id),
          parentEmail: parsed.data.parent.email,
        },
      },
    });

    await updateStoreOrder(pendingOrder.id, {
      stripeCheckoutSessionId: session.id,
    });

    res.json({ checkoutUrl: session.url, accessToken, snapshotId });
  } catch (err: any) {
    console.error('POST checkout:', err);
    res.status(500).json({ message: err.message || 'Checkout failed' });
  }
});

router.get('/:storeSlug/order/:token', async (req, res) => {
  try {
    const school = await resolveStoreContext(req.params.storeSlug);
    if (!school) return res.status(404).json({ message: 'Store not found' });

    const order = await getStoreOrderByAccessToken(req.params.token);
    if (!order || order.schoolId !== school.id) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const snapshot = order.metadata?.snapshotId
      ? await getStoreCheckoutSnapshot(String((order.metadata as any).snapshotId))
      : null;
    const payload = snapshot?.payload as any;
    const paidLines = payload?.lines?.filter((l: any) => l.fulfillment === 'paid') ?? [];
    const docs = await resolveStoreDeliveryDocuments(school.id, paidLines);

    res.json({
      order,
      documents: docs.map((d: { id: number; title: string; fileName: string }) => ({ id: d.id, title: d.title, fileName: d.fileName })),
    });
  } catch (err) {
    console.error('GET order:', err);
    res.status(500).json({ message: 'Failed to load order' });
  }
});

export default router;
