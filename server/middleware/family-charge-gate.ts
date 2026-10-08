import type { NextFunction, Request, Response } from 'express';
import { supabaseAuth } from './supabase-auth';
import { storage } from '../storage';
import { resolveSchoolIdForUser } from '../lib/resolve-school-id';
import { familyChargeDecision } from '../lib/platform-school-billing';

function isMutating(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

/** Auto-pay and saved-card routes live under /api/user next to role management. */
function isFamilyPaymentPath(req: Request): boolean {
  const base = req.baseUrl || '';
  const path = req.path || '';
  if (base === '/api/stripe' || base === '/api/billing' || base === '/api/scheduled-payments') {
    return true;
  }
  if (base === '/api/user' || req.originalUrl.startsWith('/api/user')) {
    return (
      path.includes('setup-intent') ||
      path.includes('payment-method') ||
      path.includes('auto-pay') ||
      path.includes('sync-checkout')
    );
  }
  return false;
}

async function schoolIdForActor(req: Request): Promise<number | null> {
  const email = (req as { user?: { email?: string } }).user?.email;
  if (!email) return null;
  const user = await storage.getUserByEmail(email);
  if (!user) return null;
  return resolveSchoolIdForUser(user);
}

/**
 * Blocks parent card charges for schools that are not on the internal plan.
 * ASA (internal, or the column missing before migration 267) is unchanged.
 * Does not alter tuition amounts, Pay All, or autopay math.
 */
export function gateMutatingFamilyCharges(req: Request, res: Response, next: NextFunction): void {
  if (!isMutating(req.method) || !isFamilyPaymentPath(req)) {
    next();
    return;
  }

  const run = async () => {
    const authed = req as { user?: { email?: string } };
    if (!authed.user?.email) {
      await new Promise<void>((resolve, reject) => {
        supabaseAuth(req, res, (err?: unknown) => {
          if (err) reject(err);
          else resolve();
        });
      });
      if (res.headersSent) return;
    }

    const schoolId = await schoolIdForActor(req);
    const decision = await familyChargeDecision(schoolId);
    if (!decision.allowed) {
      res.status(403).json({
        code: 'FAMILY_PAYMENTS_GATED',
        message: decision.message,
      });
      return;
    }
    next();
  };

  run().catch((error) => {
    console.warn('Family payment gate skipped:', error instanceof Error ? error.message : error);
    if (!res.headersSent) next();
  });
}
