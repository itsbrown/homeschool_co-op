/**
 * Credit Expiration Service
 * 
 * Runs on a schedule to mark credits as expired when their expiresAt date has passed.
 * Uses the unified credit system that supports all credit types (volunteer, referral, etc.)
 */

import { storage } from '../storage';

const ONE_HOUR = 60 * 60 * 1000;
const TWELVE_HOURS = 12 * ONE_HOUR;

let expirationInterval: NodeJS.Timeout | null = null;

/**
 * Mark all expired credits in the database
 * Credits are considered expired when:
 * - expiresAt is not null AND has passed
 * - status is 'approved' or 'partially_used' (not already expired/used/rejected)
 */
export async function expireCredits(): Promise<{ expiredCount: number }> {
  try {
    console.log('🕐 Running credit expiration check...');
    
    const expiredCount = await storage.expireCredits();
    
    if (expiredCount > 0) {
      console.log(`✅ Marked ${expiredCount} credits as expired`);
    } else {
      console.log('✅ No credits needed expiration');
    }
    
    return { expiredCount };
  } catch (error) {
    console.error('❌ Error during credit expiration check:', error);
    throw error;
  }
}

/**
 * Start the credit expiration job that runs every 12 hours
 */
export function startCreditExpirationJob(): void {
  if (expirationInterval) {
    console.log('⚠️ Credit expiration job already running');
    return;
  }
  
  console.log('🚀 Starting credit expiration service (runs every 12 hours)');
  
  // Run immediately on startup
  expireCredits().catch(err => 
    console.error('Error in initial credit expiration run:', err)
  );
  
  // Then run every 12 hours
  expirationInterval = setInterval(() => {
    expireCredits().catch(err => 
      console.error('Error in scheduled credit expiration run:', err)
    );
  }, TWELVE_HOURS);
}

/**
 * Stop the credit expiration job
 */
export function stopCreditExpirationJob(): void {
  if (expirationInterval) {
    clearInterval(expirationInterval);
    expirationInterval = null;
    console.log('🛑 Credit expiration service stopped');
  }
}

export default {
  expireCredits,
  startCreditExpirationJob,
  stopCreditExpirationJob
};
