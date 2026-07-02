import { storage } from '../storage';

export type StoreOrderReferralMetadata = {
  userId: number;
  name: string | null;
  email: string | null;
  capturedAt: string;
};

function displayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): string | null {
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fromParts || user.name || null;
}

/** Resolve and validate store share referral; rejects self-referrals and unknown users. */
export async function resolveStoreShareReferral(params: {
  referredByUserId?: number | null;
  buyerParentId: number;
  capturedAt?: string;
}): Promise<StoreOrderReferralMetadata | null> {
  const referredByUserId = params.referredByUserId;
  if (referredByUserId == null || referredByUserId <= 0) return null;
  if (referredByUserId === params.buyerParentId) return null;

  const referrer = await storage.getUser(referredByUserId);
  if (!referrer) return null;

  return {
    userId: referrer.id,
    name: displayName(referrer),
    email: referrer.email ?? null,
    capturedAt: params.capturedAt ?? new Date().toISOString(),
  };
}
