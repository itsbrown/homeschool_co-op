/**
 * Daily Scheduled Payment Reconciliation Job
 * 
 * Runs system-wide reconciliation at off-peak hours (3 AM UTC) to catch
 * any scheduled payments that weren't properly marked as completed.
 * 
 * This acts as a safety net for edge cases where real-time sync fails.
 */

import { reconcileAllScheduledPayments } from './scheduled-payment-reconciliation';
import { storage } from '../storage';

// Configuration
const RECONCILIATION_HOUR_UTC = 3; // 3 AM UTC (off-peak)
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

let reconciliationInterval: ReturnType<typeof setInterval> | null = null;
let isReconciliationRunning = false;

/**
 * Calculate milliseconds until next scheduled run time
 */
function getMillisecondsUntilNextRun(): number {
  const now = new Date();
  const nextRun = new Date(now);
  
  // Set to target hour UTC
  nextRun.setUTCHours(RECONCILIATION_HOUR_UTC, 0, 0, 0);
  
  // If we've passed today's run time, schedule for tomorrow
  if (now >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  return nextRun.getTime() - now.getTime();
}

/**
 * Run the daily reconciliation
 */
async function runDailyReconciliation(): Promise<void> {
  if (isReconciliationRunning) {
    console.log('[ReconciliationJob] Previous reconciliation still running, skipping...');
    return;
  }
  
  isReconciliationRunning = true;
  const startTime = Date.now();
  
  console.log('[ReconciliationJob] Starting daily scheduled payment reconciliation...');
  
  try {
    const summary = await reconcileAllScheduledPayments(50, 100, false);
    
    console.log('[ReconciliationJob] Daily reconciliation complete:', {
      enrollmentsProcessed: summary.totalEnrollmentsProcessed,
      paymentsMarkedCompleted: summary.totalPaymentsMarkedCompleted,
      errors: summary.errors.length,
      durationMs: Date.now() - startTime
    });
    
    // Log errors to monitoring system if any occurred
    if (summary.errors.length > 0) {
      try {
        await storage.createErrorLog({
          errorType: 'backend',
          message: `Daily reconciliation completed with ${summary.errors.length} error(s)`,
          severity: 'low',
          route: '/scheduled-job/reconciliation',
          method: 'CRON',
          userEmail: null,
          schoolId: null,
          stackTrace: null,
          metadata: {
            totalEnrollmentsProcessed: summary.totalEnrollmentsProcessed,
            totalPaymentsMarkedCompleted: summary.totalPaymentsMarkedCompleted,
            errors: summary.errors.slice(0, 10), // First 10 errors
            totalErrors: summary.errors.length,
            durationMs: Date.now() - startTime
          },
          notificationSent: false
        });
      } catch (logErr) {
        console.error('[ReconciliationJob] Failed to log reconciliation errors:', logErr);
      }
    }
    
    // Log success if any payments were fixed
    if (summary.totalPaymentsMarkedCompleted > 0) {
      console.log(`[ReconciliationJob] ✅ Fixed ${summary.totalPaymentsMarkedCompleted} scheduled payments across ${summary.totalEnrollmentsWithChanges} enrollments`);
    }
    
  } catch (error) {
    console.error('[ReconciliationJob] Daily reconciliation failed:', error);
    
    // Log critical failure to monitoring
    try {
      await storage.createErrorLog({
        errorType: 'backend',
        message: 'Daily scheduled payment reconciliation job failed',
        severity: 'high',
        route: '/scheduled-job/reconciliation',
        method: 'CRON',
        userEmail: null,
        schoolId: null,
        stackTrace: error instanceof Error ? error.stack : String(error),
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime
        },
        notificationSent: false
      });
    } catch (logErr) {
      console.error('[ReconciliationJob] Failed to log job failure:', logErr);
    }
  } finally {
    isReconciliationRunning = false;
  }
}

/**
 * Start the daily reconciliation job
 */
export function startReconciliationJob(): void {
  if (reconciliationInterval) {
    console.log('[ReconciliationJob] Job already running');
    return;
  }
  
  const msUntilFirstRun = getMillisecondsUntilNextRun();
  const hoursUntilFirstRun = (msUntilFirstRun / ONE_HOUR_MS).toFixed(1);
  
  console.log(`[ReconciliationJob] Scheduled daily reconciliation at ${RECONCILIATION_HOUR_UTC}:00 UTC`);
  console.log(`[ReconciliationJob] Next run in ${hoursUntilFirstRun} hours`);
  
  // Schedule first run
  setTimeout(() => {
    // Run immediately at scheduled time
    runDailyReconciliation();
    
    // Then run every 24 hours
    reconciliationInterval = setInterval(runDailyReconciliation, ONE_DAY_MS);
  }, msUntilFirstRun);
}

/**
 * Stop the daily reconciliation job
 */
export function stopReconciliationJob(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
    console.log('[ReconciliationJob] Stopped daily reconciliation job');
  }
}

/**
 * Manually trigger reconciliation (for admin use)
 */
export async function triggerManualReconciliation(): Promise<{
  success: boolean;
  summary?: Awaited<ReturnType<typeof reconcileAllScheduledPayments>>;
  error?: string;
}> {
  try {
    const summary = await reconcileAllScheduledPayments(50, 100, false);
    return { success: true, summary };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}
