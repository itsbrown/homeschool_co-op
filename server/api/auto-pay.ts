import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { getStripeClient } from '../config/stripe';
import { supabaseAuth } from '../middleware/supabase-auth';

const router = Router();

/**
 * GET /api/user/payment-method
 * Returns the saved card on file details from Stripe (brand, last4, expiry).
 * Returns { cardOnFile: null } if no card is saved or the saved card is invalid.
 */
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
      // Card was detached or is no longer valid — clear from DB
      console.warn(`[AutoPay] Payment method invalid for user ${userId}, clearing:`, stripeErr.message);
      await storage.updateUser(userId, { stripeDefaultPaymentMethodId: null });
      return res.json({ cardOnFile: null });
    }
  } catch (err: any) {
    console.error('[AutoPay] Error fetching payment method:', err);
    return res.status(500).json({ error: 'Failed to fetch payment method' });
  }
});

/**
 * GET /api/user/auto-pay-status
 * Returns the current auto-pay toggle state for the authenticated user.
 */
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

/**
 * PATCH /api/user/auto-pay
 * Enables or disables auto-pay for the authenticated user.
 * Returns 400 if enabling without a card on file.
 */
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
        error: 'No card on file. Complete a Stripe checkout first to save your card for auto-pay.',
      });
    }

    const updated = await storage.updateUser(userId, { autoPayEnabled: enabled });
    return res.json({ autoPayEnabled: updated?.autoPayEnabled ?? enabled });
  } catch (err: any) {
    console.error('[AutoPay] Error updating auto-pay toggle:', err);
    return res.status(500).json({ error: 'Failed to update auto-pay setting' });
  }
});

export default router;
