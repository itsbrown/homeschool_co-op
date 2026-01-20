/**
 * System-wide Scheduled Payment Reconciliation Script
 * 
 * Runs reconciliation across all enrollments in batches to fix orphaned pending payments.
 * This marks scheduled payments as 'completed' when their cumulative amount is covered 
 * by the enrollment's totalPaid.
 * 
 * Usage:
 *   npx tsx server/scripts/run-scheduled-payment-reconciliation.ts [--dry-run] [--batch-size=50]
 * 
 * Options:
 *   --dry-run      Preview changes without applying them (default: false)
 *   --batch-size   Number of enrollments per batch (default: 50)
 */

import { reconcileAllScheduledPayments } from '../services/scheduled-payment-reconciliation';

async function main() {
  const args = process.argv.slice(2);
  
  const dryRun = args.includes('--dry-run');
  const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 50;
  
  console.log('='.repeat(80));
  console.log('📋 SCHEDULED PAYMENT RECONCILIATION');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE (will update database)'}`);
  console.log(`Batch size: ${batchSize} enrollments per batch`);
  console.log('='.repeat(80));
  console.log('');
  
  if (!dryRun) {
    console.log('⚠️  WARNING: This will update scheduled payment statuses in the database.');
    console.log('   Make sure you have a backup before proceeding.');
    console.log('   Run with --dry-run first to preview changes.');
    console.log('');
  }
  
  try {
    const summary = await reconcileAllScheduledPayments(batchSize, 100, dryRun);
    
    console.log('\n');
    console.log('='.repeat(80));
    console.log('📊 RECONCILIATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total enrollments processed: ${summary.totalEnrollmentsProcessed}`);
    console.log(`Enrollments with changes: ${summary.totalEnrollmentsWithChanges}`);
    console.log(`Payments ${dryRun ? 'that would be' : ''} marked completed: ${summary.totalPaymentsMarkedCompleted}`);
    console.log(`Batches processed: ${summary.batchesProcessed}`);
    console.log(`Processing time: ${summary.processingTimeMs}ms`);
    
    if (summary.schoolSummaries.length > 0) {
      console.log('\n📍 Per-school breakdown:');
      for (const school of summary.schoolSummaries) {
        console.log(`   School ${school.schoolId}: ${school.paymentsMarkedCompleted} payments ${dryRun ? 'would be' : ''} completed (${school.enrollmentsWithChanges}/${school.enrollmentsProcessed} enrollments)`);
      }
    }
    
    if (summary.errors.length > 0) {
      console.log('\n❌ Errors:');
      for (const err of summary.errors) {
        console.log(`   Enrollment ${err.enrollmentId}: ${err.error}`);
      }
    }
    
    console.log('\n');
    if (dryRun) {
      console.log('✅ Dry run complete. No changes were made.');
      console.log('   Run without --dry-run to apply changes.');
    } else {
      console.log('✅ Reconciliation complete. Changes have been applied.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Reconciliation failed:', error);
    process.exit(1);
  }
}

main();
