import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { getStripeClient } from '../config/stripe';
import { supabaseAuth } from '../middleware/supabase-auth';

const router = Router();

// Ensure a Stripe Customer record exists for the given user, creating one if needed
async function ensureStripeCustomer(userId: number): Promise<string> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error('User not found');

  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = await getStripeClient();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: String(userId) },
  });

  await storage.updateUser(userId, { stripeCustomerId: customer.id });
  return customer.id;
}

// GET /api/user/payment-method — legacy single-card endpoint
router.get('/payment-method', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await storage.getUser(userId);
    if (!user?.stripeDefaultPaymentMethodId) {
      return res.json({ cardOnFile: null });
    }

    const stripe = await getStripeClient();
    try {
      const pm = await stripe.paymentMethods.retrieve(user.stripeDefaultPaymentMethodId);
      return res.json({
        cardOnFile: {
          brand: pm.card?.brand || 'card',
          last4: pm.card?.last4 || '****',
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        },
      });
    } catch (stripeErr: any) {
      console.warn(`[AutoPay] Payment method invalid for user ${userId}, clearing:`, stripeErr.message);
      await storage.updateUser(userId, { stripeDefaultPaymentMethodId: null });
      return res.json({ cardOnFile: null });
    }
  } catch (err: any) {
    console.error('[AutoPay] Error fetching payment method:', err);
    return res.status(500).json({ error: 'Failed to fetch payment method' });
  }
});

// GET /api/user/payment-methods — list all saved cards
router.get('/payment-methods', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const customerId = await ensureStripeCustomer(userId);
    const user = await storage.getUser(userId);

    const stripe = await getStripeClient();
    const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });

    const paymentMethods = pms.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || 'card',
      last4: pm.card?.last4 || '****',
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: pm.id === user.stripeDefaultPaymentMethodId,
    }));

    return res.json({ paymentMethods, defaultPaymentMethodId: user.stripeDefaultPaymentMethodId });
  } catch (err: any) {
    console.error('[AutoPay] Error listing payment methods:', err);
    return res.status(500).json({ error: 'Failed to list payment methods' });
  }
});

// POST /api/user/setup-intent — create SetupIntent to vault a new card (off-session)
// Also available at /payment-methods/setup-intent for backward compatibility
async function handleSetupIntent(req: any, res: any) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const customerId = await ensureStripeCustomer(userId);
    const stripe = await getStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    return res.json({ clientSecret: setupIntent.client_secret });
  } catch (err: any) {
    console.error('[AutoPay] Error creating SetupIntent:', err);
    return res.status(500).json({ error: 'Failed to create setup intent' });
  }
}
router.post('/setup-intent', supabaseAuth, handleSetupIntent);
router.post('/payment-methods/setup-intent', supabaseAuth, handleSetupIntent);

// DELETE /api/user/payment-methods/:pmId — detach a saved card
router.delete('/payment-methods/:pmId', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { pmId } = req.params;
    const customerId = await ensureStripeCustomer(userId);
    const user = await storage.getUser(userId);

    const stripe = await getStripeClient();
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== customerId) {
      return res.status(403).json({ error: 'Payment method does not belong to this account' });
    }

    await stripe.paymentMethods.detach(pmId);

    if (user?.stripeDefaultPaymentMethodId === pmId) {
      await storage.updateUser(userId, { stripeDefaultPaymentMethodId: null, autoPayEnabled: false });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[AutoPay] Error removing payment method:', err);
    return res.status(500).json({ error: 'Failed to remove payment method' });
  }
});

// PATCH /api/user/payment-methods/:pmId/default — set a card as the auto-pay default
router.patch('/payment-methods/:pmId/default', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { pmId } = req.params;
    const customerId = await ensureStripeCustomer(userId);

    const stripe = await getStripeClient();
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== customerId) {
      return res.status(403).json({ error: 'Payment method does not belong to this account' });
    }

    await storage.updateUser(userId, { stripeDefaultPaymentMethodId: pmId });
    try {
      const { recheckLocationsForParent } = await import('../services/location-activation-service.js');
      await recheckLocationsForParent(userId);
    } catch (hookErr) {
      console.warn('[AutoPay] Location activation recheck after PM save:', hookErr);
    }
    return res.json({ success: true, defaultPaymentMethodId: pmId });
  } catch (err: any) {
    console.error('[AutoPay] Error setting default payment method:', err);
    return res.status(500).json({ error: 'Failed to set default payment method' });
  }
});

// GET /api/user/auto-pay-status
router.get('/auto-pay-status', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await storage.getUser(userId);
    return res.json({ autoPayEnabled: user?.autoPayEnabled ?? false });
  } catch (err: any) {
    console.error('[AutoPay] Error fetching auto-pay status:', err);
    return res.status(500).json({ error: 'Failed to fetch auto-pay status' });
  }
});

const toggleSchema = z.object({ enabled: z.boolean() });

// PATCH /api/user/auto-pay — enable or disable auto-pay
router.patch('/auto-pay', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }

    const { enabled } = parsed.data;
    const user = await storage.getUser(userId);

    if (enabled && !user?.stripeDefaultPaymentMethodId) {
      return res.status(400).json({
        error: 'No card on file. Add a card first to enable auto-pay.',
      });
    }

    const updated = await storage.updateUser(userId, { autoPayEnabled: enabled });
    return res.json({ autoPayEnabled: updated?.autoPayEnabled ?? enabled });
  } catch (err: any) {
    console.error('[AutoPay] Error updating auto-pay toggle:', err);
    return res.status(500).json({ error: 'Failed to update auto-pay setting' });
  }
});

// Admin router — mounted at /api/admin/users by routes.ts
export const adminPaymentMethodsRouter = Router();

function requireAdminRole(req: any, res: any, next: any) {
  const roles: string[] = req.user?.allRoles ?? [];
  if (!roles.some((r) => ['admin', 'schoolAdmin', 'superAdmin'].includes(r))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

// schoolAdmin may only access users in their own school; global admin/superAdmin are unrestricted
function adminCanAccessUser(req: any, targetUser: any): boolean {
  const roles: string[] = req.user?.allRoles ?? [];
  if (roles.includes('admin') || roles.includes('superAdmin')) return true;
  const adminSchoolId = req.user?.schoolId;
  return !!adminSchoolId && targetUser.schoolId === adminSchoolId;
}

// GET /api/admin/users/:userId/payment-methods
adminPaymentMethodsRouter.get(
  '/:userId/payment-methods',
  supabaseAuth,
  requireAdminRole,
  async (req: any, res) => {
    try {
      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId)) return res.status(400).json({ error: 'Invalid userId' });

      const user = await storage.getUser(targetUserId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (!adminCanAccessUser(req, user)) {
        return res.status(403).json({ error: 'Access denied: user belongs to a different school' });
      }

      const customerId = await ensureStripeCustomer(targetUserId);
      const updatedUser = await storage.getUser(targetUserId);

      const stripe = await getStripeClient();
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });

      const paymentMethods = pms.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || 'card',
        last4: pm.card?.last4 || '****',
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        isDefault: pm.id === updatedUser?.stripeDefaultPaymentMethodId,
      }));

      return res.json({
        paymentMethods,
        defaultPaymentMethodId: updatedUser?.stripeDefaultPaymentMethodId,
      });
    } catch (err: any) {
      console.error('[AdminPM] Error listing payment methods:', err);
      return res.status(500).json({ error: 'Failed to list payment methods' });
    }
  }
);

// POST /api/admin/users/:userId/setup-intent (also at /payment-methods/setup-intent)
async function handleAdminSetupIntent(req: any, res: any) {
  try {
    const targetUserId = parseInt(req.params.userId, 10);
    if (isNaN(targetUserId)) return res.status(400).json({ error: 'Invalid userId' });

    const user = await storage.getUser(targetUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!adminCanAccessUser(req, user)) {
      return res.status(403).json({ error: 'Access denied: user belongs to a different school' });
    }

    const customerId = await ensureStripeCustomer(targetUserId);
    const stripe = await getStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    return res.json({ clientSecret: setupIntent.client_secret });
  } catch (err: any) {
    console.error('[AdminPM] Error creating SetupIntent:', err);
    return res.status(500).json({ error: 'Failed to create setup intent' });
  }
}
adminPaymentMethodsRouter.post('/:userId/setup-intent', supabaseAuth, requireAdminRole, handleAdminSetupIntent);
adminPaymentMethodsRouter.post('/:userId/payment-methods/setup-intent', supabaseAuth, requireAdminRole, handleAdminSetupIntent);

// DELETE /api/admin/users/:userId/payment-methods/:pmId
adminPaymentMethodsRouter.delete(
  '/:userId/payment-methods/:pmId',
  supabaseAuth,
  requireAdminRole,
  async (req: any, res) => {
    try {
      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId)) return res.status(400).json({ error: 'Invalid userId' });

      const { pmId } = req.params;
      const user = await storage.getUser(targetUserId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (!adminCanAccessUser(req, user)) {
        return res.status(403).json({ error: 'Access denied: user belongs to a different school' });
      }

      const customerId = await ensureStripeCustomer(targetUserId);
      const stripe = await getStripeClient();
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if (pm.customer !== customerId) {
        return res.status(403).json({ error: 'Payment method does not belong to this account' });
      }

      await stripe.paymentMethods.detach(pmId);

      if (user.stripeDefaultPaymentMethodId === pmId) {
        await storage.updateUser(targetUserId, { stripeDefaultPaymentMethodId: null, autoPayEnabled: false });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[AdminPM] Error removing payment method:', err);
      return res.status(500).json({ error: 'Failed to remove payment method' });
    }
  }
);

// PATCH /api/admin/users/:userId/payment-methods/:pmId/default
adminPaymentMethodsRouter.patch(
  '/:userId/payment-methods/:pmId/default',
  supabaseAuth,
  requireAdminRole,
  async (req: any, res) => {
    try {
      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId)) return res.status(400).json({ error: 'Invalid userId' });

      const { pmId } = req.params;
      const user = await storage.getUser(targetUserId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (!adminCanAccessUser(req, user)) {
        return res.status(403).json({ error: 'Access denied: user belongs to a different school' });
      }

      const customerId = await ensureStripeCustomer(targetUserId);
      const stripe = await getStripeClient();
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if (pm.customer !== customerId) {
        return res.status(403).json({ error: 'Payment method does not belong to this account' });
      }

      await storage.updateUser(targetUserId, { stripeDefaultPaymentMethodId: pmId });
      return res.json({ success: true, defaultPaymentMethodId: pmId });
    } catch (err: any) {
      console.error('[AdminPM] Error setting default payment method:', err);
      return res.status(500).json({ error: 'Failed to set default payment method' });
    }
  }
);

export default router;
