/**
 * Scheduled Payment Reconciliation Service
 * 
 * Provides functions to sync scheduled_payments status with enrollment payment data.
 * This ensures scheduled payments are marked as 'completed' when their cumulative
 * amounts are covered by the enrollment's totalPaid.
 * 
 * Used by:
 * - PaymentProcessorService (Step 7.5) for real-time sync during payment processing
 * - Bulk reconciliation endpoints for fixing historical data
 */

import { storage } from '../storage';
import type { ScheduledPayment } from '@shared/schema';

export interface ReconciliationResult {
  enrollmentId: number;
  totalPaid: number;
  scheduledPaymentsTotal: number;
  paymentsMarkedCompleted: number;
  details: Array<{
    scheduledPaymentId: number;
    amount: number;
    previousStatus: string;
    newStatus: string;
  }>;
}

export interface BulkReconciliationSummary {
  enrollmentsProcessed: number;
  enrollmentsWithChanges: number;
  totalPaymentsMarkedCompleted: number;
  results: ReconciliationResult[];
  errors: Array<{ enrollmentId: number; error: string }>;
}

/**
 * Sync scheduled payments for a single enrollment based on its totalPaid amount.
 * Marks pending scheduled payments as 'completed' when the cumulative amount
 * (including already completed installments) is covered by totalPaid.
 */
export async function reconcileEnrollmentScheduledPayments(
  enrollmentId: number,
  dryRun: boolean = false
): Promise<ReconciliationResult> {
  const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
  if (!enrollment) {
    throw new Error(`Enrollment ${enrollmentId} not found`);
  }

  const totalPaid = enrollment.totalPaid || 0;
  const scheduledPayments = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
  
  const sortedPayments = scheduledPayments.sort((a, b) => {
    const dateCompare = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
    return dateCompare !== 0 ? dateCompare : (a.installmentNumber || 0) - (b.installmentNumber || 0);
  });

  let cumulativeAmount = 0;
  const details: ReconciliationResult['details'] = [];
  const scheduledPaymentsTotal = sortedPayments
    .filter(sp => sp.status !== 'cancelled' && sp.status !== 'skipped')
    .reduce((sum, sp) => sum + sp.amount, 0);

  for (const sp of sortedPayments) {
    if (sp.status === 'cancelled' || sp.status === 'skipped') {
      continue;
    }

    cumulativeAmount += sp.amount;

    if (sp.status === 'completed') {
      continue;
    }

    if (cumulativeAmount <= totalPaid) {
      if (!dryRun) {
        await storage.updateScheduledPayment(sp.id, {
          status: 'completed',
          processedAt: new Date(),
        });
      }
      details.push({
        scheduledPaymentId: sp.id,
        amount: sp.amount,
        previousStatus: sp.status,
        newStatus: 'completed',
      });
    } else {
      break;
    }
  }

  return {
    enrollmentId,
    totalPaid,
    scheduledPaymentsTotal,
    paymentsMarkedCompleted: details.length,
    details,
  };
}

/**
 * Reconcile all scheduled payments for a given school.
 * Fetches all enrollments with scheduled payments and syncs their status.
 */
export async function reconcileSchoolScheduledPayments(
  schoolId: number,
  dryRun: boolean = false
): Promise<BulkReconciliationSummary> {
  const allScheduledPayments = await storage.getAllScheduledPayments();
  const schoolPayments = allScheduledPayments.filter((sp: any) => sp.schoolId === schoolId);
  
  const enrollmentIds = [...new Set(schoolPayments.map((sp: any) => sp.enrollmentId))];
  
  const results: ReconciliationResult[] = [];
  const errors: BulkReconciliationSummary['errors'] = [];
  let totalPaymentsMarkedCompleted = 0;

  for (const enrollmentId of enrollmentIds) {
    try {
      const result = await reconcileEnrollmentScheduledPayments(enrollmentId, dryRun);
      if (result.paymentsMarkedCompleted > 0) {
        results.push(result);
        totalPaymentsMarkedCompleted += result.paymentsMarkedCompleted;
      }
    } catch (err) {
      errors.push({
        enrollmentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const action = dryRun ? 'Preview' : 'Reconciliation';
  console.log(`✅ ${action} complete for school ${schoolId}: ${totalPaymentsMarkedCompleted} payments ${dryRun ? 'would be' : ''} marked completed across ${results.length} enrollments`);

  return {
    enrollmentsProcessed: enrollmentIds.length,
    enrollmentsWithChanges: results.length,
    totalPaymentsMarkedCompleted,
    results,
    errors,
  };
}
