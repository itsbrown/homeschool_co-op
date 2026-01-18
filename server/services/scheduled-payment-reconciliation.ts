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

export interface CleanupResult {
  duplicatesRemoved: number;
  orphansRemoved: number;
  excessRemoved: number;
  details: Array<{
    scheduledPaymentId: number;
    reason: 'duplicate' | 'orphan' | 'excess';
    enrollmentId: number;
    amount: number;
  }>;
}

/**
 * Clean up duplicate, orphaned, and excess scheduled payments for a school.
 * 
 * Removes:
 * - Duplicate payments: Same enrollmentId + installmentNumber with status 'pending'
 * - Orphan payments: EnrollmentId that no longer exists or is cancelled
 * - Excess payments: More pending payments than the enrollment's remaining balance requires
 */
export async function cleanupScheduledPayments(
  schoolId: number,
  dryRun: boolean = false
): Promise<CleanupResult> {
  console.log(`🧹 Starting scheduled payment cleanup for school ${schoolId} (dryRun: ${dryRun})`);
  
  const allScheduledPayments = await storage.getAllScheduledPayments();
  const schoolPayments = allScheduledPayments.filter((sp: any) => sp.schoolId === schoolId);
  
  const details: CleanupResult['details'] = [];
  let duplicatesRemoved = 0;
  let orphansRemoved = 0;
  let excessRemoved = 0;
  
  // Group payments by enrollment
  const paymentsByEnrollment = new Map<number, typeof schoolPayments>();
  for (const sp of schoolPayments) {
    if (!paymentsByEnrollment.has(sp.enrollmentId)) {
      paymentsByEnrollment.set(sp.enrollmentId, []);
    }
    paymentsByEnrollment.get(sp.enrollmentId)!.push(sp);
  }
  
  for (const [enrollmentId, payments] of paymentsByEnrollment) {
    // Check if enrollment exists and is valid
    let enrollment;
    try {
      enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    } catch (e) {
      enrollment = null;
    }
    
    const pendingPayments = payments.filter((p: any) => p.status === 'pending');
    
    // Remove orphaned payments (enrollment doesn't exist or is in a terminal status)
    const terminalStatuses = ['cancelled', 'withdrawn', 'failed'];
    if (!enrollment || terminalStatuses.includes(enrollment.status)) {
      for (const sp of pendingPayments) {
        if (!dryRun) {
          await storage.updateScheduledPayment(sp.id, { status: 'cancelled' });
        }
        details.push({
          scheduledPaymentId: sp.id,
          reason: 'orphan',
          enrollmentId,
          amount: sp.amount,
        });
        orphansRemoved++;
      }
      continue;
    }
    
    // Find duplicates - only for payments with the SAME installmentNumber, amount, AND scheduledDate
    // This prevents false positives on deposits or variable schedules with null installmentNumber
    const duplicateKeyMap = new Map<string, typeof pendingPayments>();
    for (const sp of pendingPayments) {
      // Only consider as potential duplicate if installmentNumber is set
      // Payments without installmentNumber are unique by definition (deposits, one-time payments)
      if (sp.installmentNumber != null) {
        const dateStr = new Date(sp.scheduledDate).toISOString().split('T')[0];
        const key = `${sp.installmentNumber}-${sp.amount}-${dateStr}`;
        if (!duplicateKeyMap.has(key)) {
          duplicateKeyMap.set(key, []);
        }
        duplicateKeyMap.get(key)!.push(sp);
      }
    }
    
    for (const [key, duplicates] of duplicateKeyMap) {
      if (duplicates.length > 1) {
        // Keep the oldest one (lowest ID), remove the rest
        const sorted = duplicates.sort((a: any, b: any) => a.id - b.id);
        for (let i = 1; i < sorted.length; i++) {
          const sp = sorted[i];
          if (!dryRun) {
            await storage.updateScheduledPayment(sp.id, { status: 'cancelled' });
          }
          details.push({
            scheduledPaymentId: sp.id,
            reason: 'duplicate',
            enrollmentId,
            amount: sp.amount,
          });
          duplicatesRemoved++;
        }
      }
    }
    
    // Check for excess payments
    // Calculate remaining balance needed for this enrollment
    const totalPaid = enrollment.totalPaid || 0;
    const totalCost = enrollment.totalCost || 0;
    const remainingBalance = Math.max(0, totalCost - totalPaid);
    
    // Get current pending payments after duplicate removal
    const currentPendingPayments = pendingPayments.filter((p: any) => 
      !details.some(d => d.scheduledPaymentId === p.id)
    );
    
    // Sort by scheduled date to remove furthest-out payments first
    const sortedPending = currentPendingPayments.sort((a: any, b: any) => 
      new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
    );
    
    let pendingTotal = sortedPending.reduce((sum: number, p: any) => sum + p.amount, 0);
    
    // Remove excess pending payments (those beyond what's needed to cover remaining balance)
    for (const sp of sortedPending) {
      if (pendingTotal > remainingBalance + 100) { // Allow $1 buffer for rounding
        if (!dryRun) {
          await storage.updateScheduledPayment(sp.id, { status: 'cancelled' });
        }
        details.push({
          scheduledPaymentId: sp.id,
          reason: 'excess',
          enrollmentId,
          amount: sp.amount,
        });
        pendingTotal -= sp.amount;
        excessRemoved++;
      } else {
        break;
      }
    }
  }
  
  console.log(`🧹 Cleanup ${dryRun ? 'preview' : 'complete'} for school ${schoolId}:`, {
    duplicatesRemoved,
    orphansRemoved,
    excessRemoved,
    totalRemoved: duplicatesRemoved + orphansRemoved + excessRemoved,
  });
  
  return {
    duplicatesRemoved,
    orphansRemoved,
    excessRemoved,
    details,
  };
}

export interface GenerateMissingPaymentsResult {
  enrollmentsProcessed: number;
  paymentsCreated: number;
  details: Array<{
    enrollmentId: number;
    parentEmail: string;
    remainingBalance: number;
    paymentCreated: boolean;
    scheduledPaymentId?: number;
  }>;
  errors: Array<{ enrollmentId: number; error: string }>;
}

/**
 * Generate scheduled payments for enrollments that have remaining balances
 * but no pending scheduled payments. This ensures all outstanding balances
 * appear in the Outstanding Balances report.
 */
export async function generateMissingScheduledPayments(
  schoolId: number,
  dryRun: boolean = false
): Promise<GenerateMissingPaymentsResult> {
  console.log(`📋 Generating missing scheduled payments for school ${schoolId} (dryRun: ${dryRun})`);
  
  const allEnrollments = await storage.getAllEnrollments();
  const schoolEnrollments = allEnrollments.filter(e => 
    e.schoolId === schoolId && 
    ['pending_payment', 'confirmed', 'active'].includes(e.status || '')
  );
  
  const allScheduledPayments = await storage.getAllScheduledPayments();
  const schoolPayments = allScheduledPayments.filter((sp: any) => sp.schoolId === schoolId);
  
  const result: GenerateMissingPaymentsResult = {
    enrollmentsProcessed: 0,
    paymentsCreated: 0,
    details: [],
    errors: [],
  };
  
  for (const enrollment of schoolEnrollments) {
    result.enrollmentsProcessed++;
    
    try {
      const totalCost = enrollment.totalCost || 0;
      const totalPaid = enrollment.totalPaid || 0;
      const remainingBalance = totalCost - totalPaid;
      
      // Skip if no remaining balance
      if (remainingBalance <= 0) {
        continue;
      }
      
      // Check if there are pending scheduled payments for this enrollment
      const enrollmentPayments = schoolPayments.filter(
        (sp: any) => sp.enrollmentId === enrollment.id && sp.status === 'pending'
      );
      const pendingTotal = enrollmentPayments.reduce((sum: number, sp: any) => sum + sp.amount, 0);
      
      // If pending payments already cover the remaining balance, skip
      if (pendingTotal >= remainingBalance - 100) { // Allow $1 buffer
        continue;
      }
      
      // Need to create a scheduled payment for the gap
      const gapAmount = remainingBalance - pendingTotal;
      
      // Get parent info
      const parentEmail = enrollment.parentEmail || '';
      if (!parentEmail) {
        result.errors.push({
          enrollmentId: enrollment.id,
          error: 'No parent email on enrollment',
        });
        continue;
      }
      
      const parentUser = await storage.getUserByEmail(parentEmail);
      const parentId = parentUser?.id || 0;
      
      // Get all scheduled payments for this enrollment (including completed ones) to preserve plan structure
      const allEnrollmentPayments = schoolPayments.filter(
        (sp: any) => sp.enrollmentId === enrollment.id
      );
      
      // Determine existing plan structure
      const existingTotalInstallments = allEnrollmentPayments.reduce(
        (max: number, sp: any) => Math.max(max, sp.totalInstallments || 1), 1
      );
      const maxInstallment = allEnrollmentPayments.reduce(
        (max: number, sp: any) => Math.max(max, sp.installmentNumber || 0), 0
      );
      
      // Calculate installment number for the new payment
      // If this is an enrollment with no scheduled payments at all, start at 1
      const nextInstallmentNumber = maxInstallment > 0 ? maxInstallment + 1 : 1;
      
      // Preserve the existing total installments, or set to the new count if no plan exists
      const totalInstallmentsToUse = existingTotalInstallments > 0 
        ? Math.max(existingTotalInstallments, nextInstallmentNumber)
        : nextInstallmentNumber;
      
      const detail: GenerateMissingPaymentsResult['details'][number] = {
        enrollmentId: enrollment.id,
        parentEmail,
        remainingBalance: gapAmount,
        paymentCreated: false,
      };
      
      if (!dryRun) {
        // Create the scheduled payment - due in 7 days for catch-up payments
        const scheduledPayment = await storage.createScheduledPayment({
          schoolId,
          enrollmentId: enrollment.id,
          parentId,
          parentEmail,
          amount: gapAmount,
          currency: 'usd',
          scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          frequency: 'one_time',
          installmentNumber: nextInstallmentNumber,
          totalInstallments: totalInstallmentsToUse,
          status: 'pending',
          stripePaymentIntentId: null,
          processedAt: null,
          failureReason: null,
          retryCount: 0,
          metadata: {
            generatedForMissingBalance: true,
            generatedAt: new Date().toISOString(),
            childName: enrollment.childName,
            className: enrollment.className,
          },
        });
        detail.paymentCreated = true;
        detail.scheduledPaymentId = scheduledPayment.id;
        console.log(`✅ Created scheduled payment ${scheduledPayment.id} for enrollment ${enrollment.id}: $${(gapAmount / 100).toFixed(2)} (installment ${nextInstallmentNumber}/${totalInstallmentsToUse})`);
      } else {
        detail.paymentCreated = false;
        console.log(`📝 [DRY RUN] Would create scheduled payment for enrollment ${enrollment.id}: $${(gapAmount / 100).toFixed(2)} (installment ${nextInstallmentNumber}/${totalInstallmentsToUse})`);
      }
      
      result.details.push(detail);
      result.paymentsCreated++;
    } catch (err) {
      result.errors.push({
        enrollmentId: enrollment.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  console.log(`📋 Generate missing payments ${dryRun ? 'preview' : 'complete'} for school ${schoolId}:`, {
    enrollmentsProcessed: result.enrollmentsProcessed,
    paymentsCreated: result.paymentsCreated,
    errors: result.errors.length,
  });
  
  return result;
}
