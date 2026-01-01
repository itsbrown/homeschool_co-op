/**
 * Backfill Payment Allocations Script
 * 
 * This script creates payment_allocations records for existing payments that don't have allocations.
 * It uses payment metadata (enrollmentIds) to determine allocation distribution.
 * 
 * Run with: npx tsx server/scripts/backfill-payment-allocations.ts
 */

import { getDb } from '../db.js';
import { stripePaymentHistory, paymentAllocations, programEnrollments } from '../../shared/schema.js';
import { eq, inArray } from 'drizzle-orm';

interface BackfillResult {
  processed: number;
  skipped: number;
  errors: string[];
  allocationsCreated: number;
  discrepancies: Array<{
    paymentId: number;
    reason: string;
    details: any;
  }>;
}

async function backfillPaymentAllocations(): Promise<BackfillResult> {
  const result: BackfillResult = {
    processed: 0,
    skipped: 0,
    errors: [],
    allocationsCreated: 0,
    discrepancies: []
  };

  console.log('🔄 Starting payment allocations backfill...');
  const db = await getDb();

  try {
    // Get all successful payments from stripe_payment_history
    const payments = await db.select().from(stripePaymentHistory)
      .where(eq(stripePaymentHistory.status, 'succeeded'));
    
    console.log(`📊 Found ${payments.length} successful payments to process`);

    for (const payment of payments) {
      try {
        // Check if allocations already exist for this payment
        const existingAllocations = await db.select()
          .from(paymentAllocations)
          .where(eq(paymentAllocations.paymentHistoryId, payment.id));
        
        if (existingAllocations.length > 0) {
          console.log(`⏭️ Payment ${payment.id} already has ${existingAllocations.length} allocations, skipping`);
          result.skipped++;
          continue;
        }

        // Parse enrollment IDs from metadata
        const metadata = payment.metadata as Record<string, any> | null;
        let enrollmentIds: number[] = [];
        
        if (metadata?.enrollmentIds) {
          try {
            enrollmentIds = typeof metadata.enrollmentIds === 'string' 
              ? JSON.parse(metadata.enrollmentIds) 
              : metadata.enrollmentIds;
          } catch (e) {
            console.log(`⚠️ Could not parse enrollmentIds for payment ${payment.id}`);
          }
        }

        if (enrollmentIds.length === 0) {
          // Try to find enrollments by parent email from payment description
          result.discrepancies.push({
            paymentId: payment.id,
            reason: 'No enrollmentIds in metadata',
            details: { paymentIntentId: payment.paymentIntentId, amount: payment.amount }
          });
          result.skipped++;
          continue;
        }

        // Get enrollments to calculate proportional allocation
        const enrollments = await db.select()
          .from(programEnrollments)
          .where(inArray(programEnrollments.id, enrollmentIds));

        if (enrollments.length === 0) {
          result.discrepancies.push({
            paymentId: payment.id,
            reason: 'Enrollments not found',
            details: { enrollmentIds, amount: payment.amount }
          });
          result.skipped++;
          continue;
        }

        // Calculate total cost for proportional distribution
        const totalCost = enrollments.reduce((sum: number, e) => sum + (e.totalCost || 0), 0);
        const paymentAmount = payment.amount || 0;

        // Create allocations for each enrollment
        for (const enrollment of enrollments) {
          const enrollmentCost = enrollment.totalCost || 0;
          const proportion = totalCost > 0 ? enrollmentCost / totalCost : 1 / enrollments.length;
          const allocatedAmount = Math.round(paymentAmount * proportion);

          await db.insert(paymentAllocations).values({
            paymentHistoryId: payment.id,
            enrollmentId: enrollment.id,
            allocatedAmountCents: allocatedAmount,
            allocationType: 'payment',
            metadata: {
              backfilled: true,
              backfillDate: new Date().toISOString(),
              originalPaymentAmount: paymentAmount,
              proportionUsed: proportion
            }
          });

          result.allocationsCreated++;
          console.log(`✅ Created allocation: payment ${payment.id} → enrollment ${enrollment.id}: $${(allocatedAmount / 100).toFixed(2)}`);
        }

        result.processed++;

      } catch (paymentError: any) {
        result.errors.push(`Payment ${payment.id}: ${paymentError.message}`);
        console.error(`❌ Error processing payment ${payment.id}:`, paymentError);
      }
    }

    console.log('\n📊 Backfill Summary:');
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Allocations Created: ${result.allocationsCreated}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Discrepancies: ${result.discrepancies.length}`);

    if (result.discrepancies.length > 0) {
      console.log('\n⚠️ Discrepancies requiring manual review:');
      for (const d of result.discrepancies) {
        console.log(`   Payment ${d.paymentId}: ${d.reason}`);
      }
    }

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    throw error;
  }

  return result;
}

async function verifyAllocationTotals(): Promise<void> {
  console.log('\n🔍 Verifying allocation totals match enrollment totalPaid...');
  const db = await getDb();

  const enrollments = await db.select().from(programEnrollments);
  let mismatches = 0;

  for (const enrollment of enrollments) {
    const allocations = await db.select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.enrollmentId, enrollment.id));

    const allocationSum = allocations.reduce((sum: number, a) => sum + (a.allocatedAmountCents || 0), 0);
    const cachedTotalPaid = enrollment.totalPaid || 0;

    if (allocationSum !== cachedTotalPaid) {
      mismatches++;
      console.log(`⚠️ Enrollment ${enrollment.id} mismatch: allocations=$${(allocationSum/100).toFixed(2)}, cached=$${(cachedTotalPaid/100).toFixed(2)}`);
    }
  }

  if (mismatches === 0) {
    console.log('✅ All enrollment totals match their allocations!');
  } else {
    console.log(`\n⚠️ Found ${mismatches} enrollments with mismatched totals`);
  }
}

// Run the backfill
backfillPaymentAllocations()
  .then(() => verifyAllocationTotals())
  .then(() => {
    console.log('\n✅ Backfill complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  });
