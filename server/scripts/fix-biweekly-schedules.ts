/**
 * Fix Script: Recalculate and update bi-weekly scheduled payment dates
 * Run with: npx tsx server/scripts/fix-biweekly-schedules.ts
 * 
 * This script:
 * 1. Finds all bi-weekly enrollments with duplicate/incorrect payment dates
 * 2. Recalculates proper 14-day interval payment dates using enrollment dates
 * 3. Updates the scheduled_payments table with corrected dates
 * 
 * DRY RUN by default - set DRY_RUN=false to actually update
 */

import { getDb } from '../db';
import { 
  programEnrollments,
  scheduledPayments
} from '../../shared/schema';
import { eq } from 'drizzle-orm';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const BIWEEKLY_INTERVAL = 14; // days

interface FixResult {
  enrollmentId: number;
  childName: string;
  className: string;
  originalDates: string[];
  newDates: string[];
  status: 'fixed' | 'skipped' | 'error' | 'needs_review';
  reason?: string;
}

/**
 * Calculate bi-weekly payment dates bounded within program dates
 */
function calculateBiweeklyDates(startDate: Date, endDate: Date, numberOfPayments: number): Date[] {
  const dates: Date[] = [];
  let currentDate = new Date(startDate);
  
  for (let i = 0; i < numberOfPayments && currentDate <= endDate; i++) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + BIWEEKLY_INTERVAL);
  }
  
  return dates;
}

async function fixBiweeklySchedules() {
  const db = await getDb();
  const results: FixResult[] = [];
  
  console.log('🔧 Starting Bi-weekly Payment Schedule Fix...\n');
  console.log(`⚠️ DRY RUN MODE: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (changes will be applied)'}`);
  console.log('   Set DRY_RUN=false to apply fixes\n');
  console.log('='.repeat(80));
  
  // 1. Find all bi-weekly enrollments
  const biweeklyEnrollments = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.paymentFrequency, 'biweekly'));
  
  console.log(`\n📊 Found ${biweeklyEnrollments.length} bi-weekly enrollments\n`);
  
  for (const enrollment of biweeklyEnrollments) {
    // Get scheduled payments for this enrollment (pending only - don't touch completed)
    const payments = await db.select().from(scheduledPayments)
      .where(eq(scheduledPayments.enrollmentId, enrollment.id));
    
    const pendingPayments = payments.filter((p: typeof payments[0]) => p.status === 'pending');
    
    if (pendingPayments.length < 2) {
      console.log(`⏭️ Enrollment ${enrollment.id} (${enrollment.childName}) - skipping (${pendingPayments.length} pending payments)`);
      results.push({
        enrollmentId: enrollment.id,
        childName: enrollment.childName,
        className: enrollment.className,
        originalDates: [],
        newDates: [],
        status: 'skipped',
        reason: `Only ${pendingPayments.length} pending payments`
      });
      continue;
    }
    
    // Sort by scheduled date
    const sortedPayments = [...pendingPayments].sort((a: typeof pendingPayments[0], b: typeof pendingPayments[0]) => 
      new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    );
    
    // Check for duplicate dates
    const dateStrings = sortedPayments.map((p: typeof sortedPayments[0]) => 
      new Date(p.scheduledDate).toISOString().split('T')[0]
    );
    const uniqueDates = [...new Set(dateStrings)];
    const hasDuplicates = uniqueDates.length !== dateStrings.length;
    
    // Check spacing between payments (should be 14 days for bi-weekly)
    const spacings: number[] = [];
    for (let i = 1; i < sortedPayments.length; i++) {
      const prevDate = new Date(sortedPayments[i - 1].scheduledDate);
      const currDate = new Date(sortedPayments[i].scheduledDate);
      const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      spacings.push(daysDiff);
    }
    const hasIncorrectSpacing = spacings.some(s => s !== BIWEEKLY_INTERVAL);
    
    if (!hasDuplicates && !hasIncorrectSpacing) {
      console.log(`✅ Enrollment ${enrollment.id} (${enrollment.childName}) - already correct`);
      continue;
    }
    
    // Validate enrollment has required dates
    if (!enrollment.programStartDate || !enrollment.programEndDate) {
      console.log(`⚠️ Enrollment ${enrollment.id} (${enrollment.childName}) - missing program dates, needs review`);
      results.push({
        enrollmentId: enrollment.id,
        childName: enrollment.childName,
        className: enrollment.className,
        originalDates: dateStrings,
        newDates: [],
        status: 'needs_review',
        reason: 'Missing programStartDate or programEndDate'
      });
      continue;
    }
    
    console.log(`\n🔧 Fixing Enrollment ${enrollment.id} (${enrollment.childName})`);
    console.log(`   Class: ${enrollment.className}`);
    console.log(`   Program dates: ${new Date(enrollment.programStartDate).toISOString().split('T')[0]} to ${new Date(enrollment.programEndDate).toISOString().split('T')[0]}`);
    console.log(`   Original dates: ${dateStrings.join(', ')}`);
    console.log(`   Original spacings: ${spacings.join(', ')} days`);
    
    // Use the first pending payment date as the starting point
    const firstPaymentDate = new Date(sortedPayments[0].scheduledDate);
    const enrollmentEndDate = new Date(enrollment.programEndDate);
    
    // Calculate new dates with proper 14-day intervals, bounded by enrollment end
    const newDates = calculateBiweeklyDates(firstPaymentDate, enrollmentEndDate, sortedPayments.length);
    
    // Validation: check if calculated dates match the number of pending payments
    if (newDates.length !== sortedPayments.length) {
      console.log(`   ⚠️ Calculated ${newDates.length} dates but have ${sortedPayments.length} pending payments - needs manual review`);
      results.push({
        enrollmentId: enrollment.id,
        childName: enrollment.childName,
        className: enrollment.className,
        originalDates: dateStrings,
        newDates: newDates.map(d => d.toISOString().split('T')[0]),
        status: 'needs_review',
        reason: `Date count mismatch: ${newDates.length} calculated vs ${sortedPayments.length} pending`
      });
      continue;
    }
    
    // Verify all new dates are within bounds
    const allDatesValid = newDates.every(d => d <= enrollmentEndDate);
    if (!allDatesValid) {
      console.log(`   ⚠️ Some calculated dates exceed enrollment end date - needs manual review`);
      results.push({
        enrollmentId: enrollment.id,
        childName: enrollment.childName,
        className: enrollment.className,
        originalDates: dateStrings,
        newDates: newDates.map(d => d.toISOString().split('T')[0]),
        status: 'needs_review',
        reason: 'Calculated dates exceed enrollment end date'
      });
      continue;
    }
    
    const newDateStrings = newDates.map(d => d.toISOString().split('T')[0]);
    const newSpacings: number[] = [];
    for (let i = 1; i < newDates.length; i++) {
      const daysDiff = Math.round((newDates[i].getTime() - newDates[i-1].getTime()) / (1000 * 60 * 60 * 24));
      newSpacings.push(daysDiff);
    }
    
    console.log(`   New dates: ${newDateStrings.join(', ')}`);
    console.log(`   New spacings: ${newSpacings.join(', ')} days`);
    
    // Apply fixes
    if (!DRY_RUN) {
      try {
        for (let i = 0; i < sortedPayments.length; i++) {
          const payment = sortedPayments[i];
          const newDate = newDates[i];
          
          await db.update(scheduledPayments)
            .set({ scheduledDate: newDate })
            .where(eq(scheduledPayments.id, payment.id));
        }
        
        console.log(`   ✅ Updated ${sortedPayments.length} payment dates`);
        
        results.push({
          enrollmentId: enrollment.id,
          childName: enrollment.childName,
          className: enrollment.className,
          originalDates: dateStrings,
          newDates: newDateStrings,
          status: 'fixed'
        });
      } catch (error) {
        console.error(`   ❌ Error updating payments:`, error);
        results.push({
          enrollmentId: enrollment.id,
          childName: enrollment.childName,
          className: enrollment.className,
          originalDates: dateStrings,
          newDates: newDateStrings,
          status: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } else {
      console.log(`   📝 Would update ${sortedPayments.length} payment dates (dry run)`);
      results.push({
        enrollmentId: enrollment.id,
        childName: enrollment.childName,
        className: enrollment.className,
        originalDates: dateStrings,
        newDates: newDateStrings,
        status: 'fixed'
      });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 SUMMARY:');
  console.log(`   Total bi-weekly enrollments: ${biweeklyEnrollments.length}`);
  console.log(`   Fixed: ${results.filter(r => r.status === 'fixed').length}`);
  console.log(`   Skipped: ${results.filter(r => r.status === 'skipped').length}`);
  console.log(`   Needs Review: ${results.filter(r => r.status === 'needs_review').length}`);
  console.log(`   Errors: ${results.filter(r => r.status === 'error').length}`);
  
  // List items needing review
  const needsReview = results.filter(r => r.status === 'needs_review');
  if (needsReview.length > 0) {
    console.log('\n⚠️ ITEMS NEEDING MANUAL REVIEW:');
    for (const item of needsReview) {
      console.log(`   - Enrollment ${item.enrollmentId} (${item.childName}): ${item.reason}`);
    }
  }
  
  if (DRY_RUN) {
    console.log('\n⚠️ This was a DRY RUN - no changes were made');
    console.log('   To apply fixes, run:');
    console.log('   DRY_RUN=false npx tsx server/scripts/fix-biweekly-schedules.ts');
  }
  
  return results;
}

// Run if executed directly
fixBiweeklySchedules()
  .then(() => {
    console.log('\n✅ Fix script complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix script failed:', error);
    process.exit(1);
  });
