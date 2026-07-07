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
import { insertCheckoutFunnelEvent } from '../lib/school-analytics';
import {
  getSchoolByStoreSlug,
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
import { ensureDeliveryDocumentShareTokens } from '../lib/store-confirmation-email';
import {
  getPublishedStoreCatalogWithSlugs,
  resolvePublishedStoreCatalogItem,
} from '../lib/store-catalog-items';
import {
  formatStoreOrderNumber,
  persistStoreEmergencyContact,
} from '../lib/store-checkout-contact';
import { storeProductDeliverySchema } from '../lib/store-product-fulfillment';
import { resolveStoreShareReferral } from '../lib/store-share-attribution';

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

const emergencyContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
  relationship: z.string().min(1),
});

const checkoutBodySchema = snapshotBodySchema.extend({
  parent: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  emergencyContact: emergencyContactSchema.optional(),
  childAssignments: z.array(
    z.object({
      lineId: z.string().min(1),
      childId: z.number().int().positive().optional(),
      childDraft: cartLineSchema.shape.childDraft,
    }),
  ),
  productDelivery: storeProductDeliverySchema.optional(),
  referredByUserId: z.number().int().positive().optional(),
  referralCapturedAt: z.string().datetime().optional(),
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

    const catalog = await getPublishedStoreCatalogWithSlugs(school.id);
    res.json({ items: catalog });
  } catch (err) {
    console.error('GET catalog:', err);
    res.status(500).json({ message: 'Failed to load catalog' });
  }
});

router.get('/:storeSlug/catalog/:catalogKey', async (req, res) => {
  try {
    const school = await resolveStoreContext(req.params.storeSlug);
    if (!school) return res.status(404).json({ message: 'Store not found' });

    const item = await resolvePublishedStoreCatalogItem(school.id, req.params.catalogKey);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    res.json({ item });
  } catch (err) {
    console.error('GET catalog item:', err);
    res.status(500).json({ message: 'Failed to load item' });
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

    const hasPrograms = parsed.data.cart.some((l) => l.listingType !== 'product');
    const hasProducts = parsed.data.cart.some((l) => l.listingType === 'product');

    if (hasProducts) {
      if (!parsed.data.productDelivery) {
        return res.status(400).json({ message: 'Pickup or shipping is required for product orders' });
      }
    }

    if (hasPrograms) {
      if (!parsed.data.parent.phone || parsed.data.parent.phone.trim().length < 10) {
        return res.status(400).json({ message: 'Phone number is required for program enrollment' });
      }
      if (!parsed.data.emergencyContact) {
        return res.status(400).json({ message: 'Emergency contact is required for program enrollment' });
      }
    }

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

    if (parsed.data.emergencyContact) {
      await persistStoreEmergencyContact(
        parentResult.parentId,
        parsed.data.parent.email,
        parsed.data.emergencyContact,
      );
    }

    const snapshotId = generateStoreSnapshotId();
    const accessToken = generateStoreAccessToken();
    const expiresAt = new Date(Date.now() + STORE_SNAPSHOT_TTL_MS);

    const referral = await resolveStoreShareReferral({
      referredByUserId: parsed.data.referredByUserId,
      buyerParentId: parentResult.parentId,
      capturedAt: parsed.data.referralCapturedAt,
    });

    const pendingOrder = await createStoreOrder({
      schoolId: school.id,
      parentId: parentResult.parentId,
      parentEmail: parsed.data.parent.email,
      parentName: `${parsed.data.parent.firstName} ${parsed.data.parent.lastName}`,
      status: snapshot.amountDueCents > 0 ? 'pending' : 'paid',
      totalCents: snapshot.amountDueCents,
      accessToken,
      metadata: {
        snapshotId,
        ...(parsed.data.productDelivery ? { productDelivery: parsed.data.productDelivery } : {}),
        ...(referral ? { referral } : {}),
      },
    });

    const funnelCorrelationId = `public-store-${pendingOrder.id}`;

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
        parentPhone: parsed.data.parent.phone ?? null,
        emergencyContact: parsed.data.emergencyContact ?? null,
        productDelivery: parsed.data.productDelivery ?? null,
        referral,
        funnelCorrelationId,
        childAssignments,
        pendingStoreOrderId: pendingOrder.id,
        accessToken,
        membershipTotalCents: snapshot.membershipTotalCents,
      },
      amountDueCents: snapshot.amountDueCents,
      expiresAt,
      storeOrderId: pendingOrder.id,
    });

    try {
      await insertCheckoutFunnelEvent({
        schoolId: school.id,
        correlationId: funnelCorrelationId,
        parentId: parentResult.parentId,
        parentEmail: parsed.data.parent.email,
        lane: 'public_store',
        step: 'begin_checkout',
        storeOrderId: pendingOrder.id,
        childIds: childAssignments.map((c) => c.childId),
        cartValueCents: snapshot.amountDueCents,
        metadata: {
          parentName: `${parsed.data.parent.firstName} ${parsed.data.parent.lastName}`,
          funnelCorrelationId,
          ...(referral ? { referralUserId: referral.userId } : {}),
        },
      });
    } catch (funnelErr) {
      console.warn('checkout funnel telemetry (public store):', funnelErr);
    }

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
    const programLinesForDocs =
      payload?.lines?.filter((l: any) => l.listingType !== 'product') ?? [];
    const rawDocs = await resolveStoreDeliveryDocuments(school.id, programLinesForDocs);
    const shareTokens = await ensureDeliveryDocumentShareTokens(rawDocs);
    const appBase = (process.env.APP_URL || 'https://accounts.americanseekersacademy.com').replace(
      /\/$/,
      '',
    );
    const docs = rawDocs.map((d: { id: number; title: string; fileName: string }) => {
      const token = shareTokens.get(d.id);
      return {
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        downloadUrl: token
          ? `${appBase}/api/schools/documents/public/${token}/download`
          : undefined,
      };
    });

    const childByLine = new Map(
      (payload?.childAssignments ?? []).map((a: any) => [a.lineId, a]),
    );
    const lines = (payload?.lines ?? []).map((line: any) => {
      const child = childByLine.get(line.lineId);
      return {
        lineId: line.lineId,
        title: line.title,
        listingType: line.listingType,
        fulfillment: line.fulfillment,
        quantity: line.quantity ?? 1,
        lineTotalCents: line.lineTotalCents,
        waitlistPosition: line.waitlistPosition ?? null,
        child: child
          ? { firstName: child.firstName, lastName: child.lastName }
          : null,
      };
    });

    res.json({
      store: {
        name: school.name,
        logo: school.logo,
        storeSlug: school.storeSlug,
      },
      order: {
        id: order.id,
        orderNumber: formatStoreOrderNumber(order.id, order.createdAt),
        status: order.status,
        parentEmail: order.parentEmail,
        parentName: order.parentName,
        totalCents: order.totalCents,
        createdAt: order.createdAt,
      },
      parentPhone: payload?.parentPhone ?? snapshot?.parentPhone ?? null,
      emergencyContact: payload?.emergencyContact ?? null,
      productDelivery: payload?.productDelivery ?? null,
      lines,
      membershipTotalCents: payload?.membershipTotalCents ?? 0,
      documents: docs,
    });
  } catch (err) {
    console.error('GET order:', err);
    res.status(500).json({ message: 'Failed to load order' });
  }
});

export default router;
