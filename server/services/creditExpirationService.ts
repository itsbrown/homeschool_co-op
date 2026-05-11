/**
 * Marks unified credits past expiresAt as expired and expires stale credit holds.
 */

import { storage } from '../storage';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

let expirationInterval: ReturnType<typeof setInterval> | null = null;

export async function expireCredits(): Promise<{ expiredCount: number; expiredHoldsCount: number }> {
  console.log('🕐 Running credit expiration check...');
  const expiredCount = await storage.expireCredits();
  if (expiredCount > 0) {
    console.log(`✅ Marked ${expiredCount} credits as expired`);
  } else {
    console.log('✅ No credits needed expiration');
  }

  let expiredHoldsCount = 0;
  try {
    expiredHoldsCount = await storage.expireStaleHolds();
    if (expiredHoldsCount > 0) {
      console.log(`🔓 Released ${expiredHoldsCount} expired credit holds`);
    }
  } catch (holdsError: unknown) {
    const msg = holdsError instanceof Error ? holdsError.message : String(holdsError);
    if (msg.includes('relation "credit_holds" does not exist')) {
      console.log('⏭️ Skipping credit holds expiration — table not yet created');
    } else {
      throw holdsError;
    }
  }

  return { expiredCount, expiredHoldsCount };
}

export function startCreditExpirationJob(): void {
  if (expirationInterval) {
    console.log('⚠️ Credit expiration job already running');
    return;
  }
  console.log('🚀 Starting credit expiration service (runs every 12 hours)');
  expireCredits().catch((err) => console.error('Error in initial credit expiration run:', err));
  expirationInterval = setInterval(() => {
    expireCredits().catch((err) => console.error('Error in scheduled credit expiration run:', err));
  }, TWELVE_HOURS);
}

export function stopCreditExpirationJob(): void {
  if (expirationInterval) {
    clearInterval(expirationInterval);
    expirationInterval = null;
    console.log('🛑 Credit expiration service stopped');
  }
}
