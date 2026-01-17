/**
 * PaymentProcessorService - Unified Payment Processing
 * 
 * This service provides a single entry point for all payment processing,
 * whether from Stripe webhooks or manual payments. It ensures:
 * - Idempotency: Prevents duplicate payment processing
 * - Consistency: All payments follow the same flow
 * - Auditability: Snapshot storage with checksum verification
 * - Deterministic allocation: Uses splitIntegerEvenly for fair distribution
 */

import { storage } from '../storage';
import { splitAmountAcrossEnrollments } from '../lib/splitIntegerEvenly';
import {
  CanonicalSnapshot,
  SignedSnapshot,
  verifyChecksum,
} from '../lib/calculateCartSnapshot';
import type { InsertStripePaymentHistory, InsertPaymentAllocation } from '@shared/schema';

export type PaymentSource = 'stripe' | 'manual' | 'payment_plan';

export interface PaymentProcessorInput {
  idempotencyKey: string;
  source: PaymentSource;
  userId: number;
  stripePaymentIntentId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
  amountCents: number;
  currency?: string;
  enrollmentIds: number[];
  signedSnapshot?: SignedSnapshot;
  description?: string;
  paymentMethod?: string;
  stripeCreatedAt?: Date;
  metadata?: Record<string, any>;
}

export interface PaymentProcessorResult {
  success: boolean;
  paymentId?: number;
  allocations?: Array<{ enrollmentId: number; amountCents: number }>;
  error?: string;
  wasIdempotentHit?: boolean;
}

/**
 * Feature flag to control whether the PaymentProcessor is enabled.
 * Set to true to start processing through the new unified service.
 */
export function isPaymentProcessorEnabled(): boolean {
  return process.env.PAYMENT_PROCESSOR_ENABLED === 'true';
}

/**
 * Check if the new schema columns are available.
 * Returns false if the database doesn't have the new columns yet.
 */
let schemaCheckResult: boolean | null = null;
export async function checkSchemaReady(): Promise<boolean> {
  if (schemaCheckResult !== null) {
    return schemaCheckResult;
  }
  
  try {
    // Try to query with the new columns - if they don't exist, this will fail
    const testPayment = await storage.getPaymentByIdempotencyKey('__schema_check__');
    schemaCheckResult = true;
    console.log('✅ PaymentProcessor: Schema check passed - new columns available');
    return true;
  } catch (err) {
    // If the query fails due to missing columns, disable the processor
    console.warn('⚠️ PaymentProcessor: Schema check failed - new columns not yet migrated', err);
    schemaCheckResult = false;
    return false;
  }
}

/**
 * Reset schema check cache (for testing)
 */
export function resetSchemaCheck(): void {
  schemaCheckResult = null;
}

/**
 * Shadow mode - logs checksum verification results without blocking.
 * Use this during rollout to monitor for mismatches.
 */
function isChecksumShadowMode(): boolean {
  return process.env.PAYMENT_CHECKSUM_SHADOW_MODE !== 'false'; // Default to shadow mode
}

/**
 * Main payment processing function.
 * Call this from webhook handlers and manual payment endpoints.
 */
export async function processPayment(
  input: PaymentProcessorInput
): Promise<PaymentProcessorResult> {
  const startTime = Date.now();
  
  console.log('💳 PaymentProcessor: Starting payment processing', {
    idempotencyKey: input.idempotencyKey,
    source: input.source,
    amountCents: input.amountCents,
    enrollmentCount: input.enrollmentIds.length,
  });

  try {
    // Step 1: Idempotency Check
    const existingPayment = await storage.getPaymentByIdempotencyKey(input.idempotencyKey);
    if (existingPayment) {
      console.log('⚠️ PaymentProcessor: Idempotent hit - payment already processed', {
        idempotencyKey: input.idempotencyKey,
        existingPaymentId: existingPayment.id,
      });
      return {
        success: true,
        paymentId: existingPayment.id,
        wasIdempotentHit: true,
      };
    }

    // Step 2: Checksum Verification (shadow mode by default)
    if (input.signedSnapshot) {
      const checksumValid = verifySnapshotChecksum(input.signedSnapshot);
      
      if (!checksumValid) {
        if (isChecksumShadowMode()) {
          console.warn('⚠️ PaymentProcessor: Checksum mismatch (shadow mode - continuing)', {
            idempotencyKey: input.idempotencyKey,
          });
        } else {
          console.error('❌ PaymentProcessor: Checksum verification failed', {
            idempotencyKey: input.idempotencyKey,
          });
          return {
            success: false,
            error: 'CHECKSUM_MISMATCH',
          };
        }
      }
    }

    // Step 3: Validate amount matches snapshot (if provided)
    if (input.signedSnapshot && input.amountCents !== input.signedSnapshot.snapshot.totals.payableAmountCents) {
      const mismatch = {
        expectedCents: input.signedSnapshot.snapshot.totals.payableAmountCents,
        actualCents: input.amountCents,
        difference: input.amountCents - input.signedSnapshot.snapshot.totals.payableAmountCents,
      };
      
      if (isChecksumShadowMode()) {
        console.warn('⚠️ PaymentProcessor: Amount mismatch (shadow mode - continuing)', mismatch);
      } else {
        console.error('❌ PaymentProcessor: Amount mismatch', mismatch);
        return {
          success: false,
          error: 'AMOUNT_MISMATCH',
        };
      }
    }

    // Step 4: Calculate payment allocations using deterministic splitting
    const allocations = splitAmountAcrossEnrollments(input.amountCents, input.enrollmentIds);
    
    console.log('📊 PaymentProcessor: Calculated allocations', {
      totalCents: input.amountCents,
      enrollmentCount: allocations.length,
      allocations: allocations.map(a => ({ id: a.enrollmentId, cents: a.amountCents })),
    });

    // Step 5: Create payment record with snapshot
    const snapshot = input.signedSnapshot?.snapshot;
    const paymentRecord: InsertStripePaymentHistory = {
      userId: input.userId,
      paymentIntentId: input.stripePaymentIntentId || `manual_${input.idempotencyKey}`,
      customerId: input.stripeCustomerId || `manual_${input.userId}`,
      subscriptionId: input.stripeSubscriptionId || null,
      amount: input.amountCents,
      currency: input.currency || 'usd',
      subtotalAmount: snapshot?.totals.subtotalCents || null,
      discountTotal: snapshot?.totals.discountTotalCents || null,
      discountSnapshot: snapshot?.discounts || null,
      status: 'succeeded',
      paymentMethod: input.paymentMethod || (input.source === 'manual' ? 'manual' : 'card'),
      description: input.description || null,
      stripeCreatedAt: input.stripeCreatedAt || new Date(),
      idempotencyKey: input.idempotencyKey,
      source: input.source,
      snapshotJson: snapshot || null,
      snapshotChecksum: input.signedSnapshot?.checksum || null,
    };

    const savedPayment = await storage.saveStripePayment(paymentRecord);
    console.log('✅ PaymentProcessor: Created payment record', { paymentId: savedPayment.id });

    // Step 6: Create payment allocations
    if (allocations.length > 0) {
      const allocationRecords: InsertPaymentAllocation[] = allocations.map(a => ({
        paymentHistoryId: savedPayment.id,
        enrollmentId: a.enrollmentId,
        allocatedAmountCents: a.amountCents,
        allocationType: 'payment' as const,
        sourceAllocationId: null,
        adminComment: null,
      }));

      await storage.createPaymentAllocations(allocationRecords);
      console.log('✅ PaymentProcessor: Created payment allocations', { count: allocations.length });
    }

    // Step 7: Update enrollment balances
    for (const allocation of allocations) {
      try {
        const enrollment = await storage.getProgramEnrollmentById(allocation.enrollmentId);
        if (enrollment) {
          const currentPaid = enrollment.totalPaid || 0;
          const newPaid = currentPaid + allocation.amountCents;
          const newBalance = Math.max(0, (enrollment.totalCost || 0) - newPaid);
          
          await storage.updateProgramEnrollment(enrollment.id, {
            totalPaid: newPaid,
            remainingBalance: newBalance,
            paymentStatus: newBalance <= 0 ? 'completed' : 'deposit_paid',
            status: 'enrolled',
          });
          
          console.log(`✅ PaymentProcessor: Updated enrollment ${enrollment.id}`, {
            previousPaid: currentPaid,
            newPaid,
            newBalance,
          });

          // Step 7.5: Sync scheduled_payments - mark pending payments as 'completed' to match new enrollment totalPaid
          // We compare the newPaid amount to cumulative scheduled payments (including already completed) to determine which should be completed
          try {
            const enrollmentScheduledPayments = await storage.getScheduledPaymentsByEnrollmentId(enrollment.id);
            // Sort all payments chronologically by date, then by installment number
            const sortedPayments = enrollmentScheduledPayments
              .sort((a, b) => {
                const dateCompare = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
                return dateCompare !== 0 ? dateCompare : (a.installmentNumber || 0) - (b.installmentNumber || 0);
              });
            
            // Calculate cumulative amounts INCLUDING already-completed installments
            // This ensures we only mark pending installments as completed when the cumulative total is covered
            let cumulativeAmount = 0;
            let paymentsMarked = 0;
            
            for (const sp of sortedPayments) {
              // Skip cancelled/skipped payments - they don't count toward cumulative
              if (sp.status === 'cancelled' || sp.status === 'skipped') {
                continue;
              }
              
              // Add this installment's amount to cumulative total (whether completed or pending)
              cumulativeAmount += sp.amount;
              
              // Skip already completed payments - but their amount is already added above
              if (sp.status === 'completed') {
                continue;
              }
              
              // For pending/failed payments: mark as completed if cumulative is covered by totalPaid
              if (cumulativeAmount <= newPaid) {
                await storage.updateScheduledPayment(sp.id, {
                  status: 'completed',
                  processedAt: new Date(),
                });
                paymentsMarked++;
              } else {
                // Once cumulative exceeds paid amount, stop processing
                // Note: We continue adding to cumulative for tracking, but don't mark more as completed
                break;
              }
            }
            
            if (paymentsMarked > 0) {
              console.log(`✅ PaymentProcessor: Synced ${paymentsMarked} scheduled_payment(s) to 'completed' for enrollment ${enrollment.id} (totalPaid: ${newPaid})`);
            }
          } catch (syncErr) {
            console.error(`⚠️ PaymentProcessor: Failed to sync scheduled_payments for enrollment ${enrollment.id}`, syncErr);
          }
        }
      } catch (err) {
        console.error(`❌ PaymentProcessor: Failed to update enrollment ${allocation.enrollmentId}`, err);
      }
    }

    // Step 8: Handle credit consumption (if snapshot includes credits)
    const appliedCredits = snapshot?.credits?.appliedCents ?? 0;
    if (appliedCredits > 0) {
      try {
        await consumeCredits(input.userId, appliedCredits, savedPayment.id);
        console.log('✅ PaymentProcessor: Consumed credits', { amountCents: appliedCredits });
      } catch (err) {
        console.error('❌ PaymentProcessor: Failed to consume credits', err);
      }
    }

    // Step 9: Increment promo code usage (if applicable)
    const discountsToProcess = snapshot?.discounts ?? [];
    for (const discount of discountsToProcess) {
      if (discount.isPromoCode && discount.id) {
        try {
          await incrementPromoUsage(discount.id);
          console.log('✅ PaymentProcessor: Incremented promo usage', { discountId: discount.id });
        } catch (err) {
          console.error('❌ PaymentProcessor: Failed to increment promo usage', err);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log('✅ PaymentProcessor: Payment processing complete', {
      paymentId: savedPayment.id,
      durationMs: duration,
      source: input.source,
    });

    return {
      success: true,
      paymentId: savedPayment.id,
      allocations,
      wasIdempotentHit: false,
    };

  } catch (error) {
    console.error('❌ PaymentProcessor: Unexpected error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Verify snapshot checksum with timing-safe comparison.
 */
function verifySnapshotChecksum(signedSnapshot: SignedSnapshot): boolean {
  try {
    const secret = process.env.PAYMENT_SNAPSHOT_SECRET;
    if (!secret) {
      console.warn('⚠️ PaymentProcessor: PAYMENT_SNAPSHOT_SECRET not set, skipping checksum verification');
      return true; // Allow during transition period
    }
    
    return verifyChecksum(signedSnapshot.snapshot, signedSnapshot.checksum, secret);
  } catch (err) {
    console.error('❌ PaymentProcessor: Error during checksum verification', err);
    return false;
  }
}

/**
 * Consume credits using FIFO order (oldest first).
 * This reduces the user's available credit balance.
 */
async function consumeCredits(
  userId: number,
  amountCents: number,
  paymentHistoryId: number
): Promise<void> {
  const availableCredits = await storage.getAvailableCredits(userId);
  let remaining = amountCents;

  for (const credit of availableCredits) {
    if (remaining <= 0) break;
    
    const available = credit.creditAmountCents - (credit.usedAmountCents || 0);
    if (available <= 0) continue;
    
    const toConsume = Math.min(available, remaining);
    const newUsed = (credit.usedAmountCents || 0) + toConsume;
    
    await storage.updateCredit(credit.id, {
      usedAmountCents: newUsed,
      status: newUsed >= credit.creditAmountCents ? 'used' : credit.status,
    });
    
    // Log the credit usage
    try {
      await storage.createUnifiedCreditUsageLog({
        creditId: credit.id,
        paymentHistoryId,
        amountCents: toConsume,
        description: 'Payment credit consumption',
      });
    } catch (err) {
      console.warn('⚠️ PaymentProcessor: Failed to log credit usage', err);
    }
    
    remaining -= toConsume;
  }
  
  if (remaining > 0) {
    console.warn('⚠️ PaymentProcessor: Not enough credits to consume full amount', {
      requested: amountCents,
      consumed: amountCents - remaining,
      shortfall: remaining,
    });
  }
}

/**
 * Increment promo code usage count.
 */
async function incrementPromoUsage(discountId: number): Promise<void> {
  const discount = await storage.getDiscountById(discountId);
  if (discount) {
    await storage.updateDiscount(discountId, {
      currentUsageCount: (discount.currentUsageCount || 0) + 1,
    });
  }
}

/**
 * Generate an idempotency key for a payment.
 * Uses source + payment intent ID or generates a unique key for manual payments.
 */
export function generateIdempotencyKey(
  source: PaymentSource,
  paymentIntentId?: string,
  userId?: number,
  timestamp?: number
): string {
  if (paymentIntentId) {
    return `${source}_${paymentIntentId}`;
  }
  return `${source}_${userId}_${timestamp || Date.now()}`;
}
