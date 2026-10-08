import { Router } from 'express';
import { supabaseAuth } from '../middleware/supabase-auth';
import { storage } from '../storage';
import { isPlatformAdmin, staffCanAccessSchool } from '../lib/route-access';
import { resolveSchoolIdForUser } from '../lib/resolve-school-id';
import { isPlatformPlanId, publicPlanCatalog } from '../config/platform-plans';
import {
  billingSnapshot,
  createPlatformCheckout,
  createPlatformPortal,
  writeSchoolPlatform,
  readSchoolPlatform,
} from '../lib/platform-school-billing';

const router = Router();

async function schoolForBilling(req: any, res: any): Promise<{ schoolId: number; email: string; schoolName: string } | null> {
  const email = req.user?.email as string | undefined;
  if (!email) {
    res.status(401).json({ message: 'Authentication required' });
    return null;
  }
  const user = await storage.getUserByEmail(email);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return null;
  }
  const requested = Number(req.body?.schoolId ?? req.query?.schoolId);
  let schoolId = Number.isFinite(requested) && requested > 0 ? requested : null;
  if (schoolId == null) {
    schoolId = await resolveSchoolIdForUser(user);
  }
  if (schoolId == null) {
    res.status(400).json({ message: 'No school is linked to this account' });
    return null;
  }
  const allowed = isPlatformAdmin(req) || (await staffCanAccessSchool(req, schoolId));
  if (!allowed) {
    res.status(403).json({ message: 'Insufficient permissions' });
    return null;
  }
  const school = await storage.getSchool(schoolId);
  return { schoolId, email: user.email, schoolName: school?.name ?? 'School' };
}

router.get('/plans', async (_req, res) => {
  res.json({ plans: publicPlanCatalog() });
});

router.get('/status', supabaseAuth, async (req: any, res) => {
  try {
    const ctx = await schoolForBilling(req, res);
    if (!ctx) return;
    res.json(await billingSnapshot(ctx.schoolId));
  } catch (error) {
    console.error('Platform subscription status failed:', error);
    res.status(500).json({ message: 'Could not load platform billing' });
  }
});

router.post('/free', supabaseAuth, async (req: any, res) => {
  try {
    const ctx = await schoolForBilling(req, res);
    if (!ctx) return;
    const planId = req.body?.planId === 'free' || req.body?.planId == null ? 'starter' : req.body.planId;
    if (planId !== 'starter') {
      return res.status(400).json({
        message: 'Only the Starter plan can be selected without Checkout. Paid plans use Stripe.',
      });
    }
    const current = await readSchoolPlatform(ctx.schoolId);
    if (current.plan === 'internal') {
      return res.json({ success: true, plan: 'internal', message: 'This school is on the internal plan.' });
    }
    if (current.stripeSubscriptionId && current.status === 'active' && current.plan !== 'starter') {
      return res.status(409).json({
        message: 'A paid subscription is already active. Manage it in the Stripe customer portal.',
      });
    }
    await writeSchoolPlatform(ctx.schoolId, { plan: 'starter', status: 'active' });
    res.json({ success: true, plan: 'starter', snapshot: await billingSnapshot(ctx.schoolId) });
  } catch (error) {
    console.error('Platform free plan failed:', error);
    res.status(500).json({ message: 'Could not select the Starter plan' });
  }
});

router.post('/create', supabaseAuth, async (req: any, res) => {
  try {
    const ctx = await schoolForBilling(req, res);
    if (!ctx) return;
    const planId = req.body?.planId;
    if (!isPlatformPlanId(planId) || planId === 'internal') {
      return res.status(400).json({ message: 'Choose starter, growth, or school' });
    }
    const current = await readSchoolPlatform(ctx.schoolId);
    if (current.plan === 'internal') {
      return res.status(400).json({ message: 'The internal school does not use platform Checkout.' });
    }
    const origin = `${req.protocol}://${req.get('host')}`;
    const { sessionUrl } = await createPlatformCheckout({
      schoolId: ctx.schoolId,
      schoolName: ctx.schoolName,
      adminEmail: ctx.email,
      planId,
      origin,
    });
    res.json({ sessionUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start Checkout';
    console.error('Platform checkout failed:', error);
    res.status(400).json({ message });
  }
});

router.post('/portal', supabaseAuth, async (req: any, res) => {
  try {
    const ctx = await schoolForBilling(req, res);
    if (!ctx) return;
    const origin = `${req.protocol}://${req.get('host')}`;
    const { url } = await createPlatformPortal(ctx.schoolId, origin);
    res.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not open the billing portal';
    res.status(400).json({ message });
  }
});

router.post('/setup-complete', supabaseAuth, async (req: any, res) => {
  try {
    const ctx = await schoolForBilling(req, res);
    if (!ctx) return;
    await writeSchoolPlatform(ctx.schoolId, { setupCompletedAt: new Date() });
    res.json({ success: true });
  } catch (error) {
    console.error('Setup complete failed:', error);
    res.status(500).json({ message: 'Could not mark setup complete' });
  }
});

export default router;
