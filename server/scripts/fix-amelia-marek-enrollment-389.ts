/**
 * Production Fix Script: Amelia Marek Enrollment #389 (and verification of Olivia #390)
 *
 * Problem:
 * - Enrollment #389 (Amelia Marek) was accidentally marked as fully paid via the admin
 *   "Mark as Enrolled" action. This overwrote totalPaid with totalCost ($900) even though
 *   only $73.50 in credits were applied during checkout.
 * - Enrollment #390 (Olivia Marek) has paymentStatus = 'completed' but a remaining_balance
 *   of $606, so its paymentStatus needs to be corrected to 'partial_payment'.
 *
 * Corrections:
 * - Enrollment 389: totalPaid → 7350 ($73.50), remainingBalance → 82650 ($826.50),
 *                   paymentStatus → 'partial_payment'
 * - Enrollment 390: paymentStatus → 'partial_payment' (balance is already consistent)
 *
 * Run with: npx tsx server/scripts/fix-amelia-marek-enrollment-389.ts
 * Dry run:  npx tsx server/scripts/fix-amelia-marek-enrollment-389.ts --dry-run
 */

import { getDb } from '../db';
import { programEnrollments } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');

async function fixMarekEnrollments() {
  const db = await getDb();

  console.log('='.repeat(70));
  console.log('MAREK ENROLLMENT CORRECTION SCRIPT');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE (changes will be applied)'}`);
  console.log('');

  // --- Read current state ---
  const [enrollment389] = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.id, 389)).limit(1);
  const [enrollment390] = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.id, 390)).limit(1);

  if (!enrollment389) {
    console.error('❌ Enrollment #389 not found');
    process.exit(1);
  }
  if (!enrollment390) {
    console.error('❌ Enrollment #390 not found');
    process.exit(1);
  }

  console.log('Current state:');
  console.log(`  #389 (${enrollment389.childName}): totalPaid=${enrollment389.totalPaid}, remainingBalance=${enrollment389.remainingBalance}, paymentStatus=${enrollment389.paymentStatus}, status=${enrollment389.status}`);
  console.log(`  #390 (${enrollment390.childName}): totalPaid=${enrollment390.totalPaid}, remainingBalance=${enrollment390.remainingBalance}, paymentStatus=${enrollment390.paymentStatus}, status=${enrollment390.status}`);
  console.log('');

  // --- Validate enrollment 389 ---
  const CREDITS_APPLIED_389 = 7350;   // $73.50 — from metadata.creditsAppliedToThisEnrollment
  const TOTAL_COST_389 = 90000;       // $900.00
  const NEW_REMAINING_389 = TOTAL_COST_389 - CREDITS_APPLIED_389; // 82650

  if (enrollment389.totalCost !== TOTAL_COST_389) {
    console.warn(`⚠️  Enrollment 389 totalCost mismatch: expected ${TOTAL_COST_389}, got ${enrollment389.totalCost}. Aborting.`);
    process.exit(1);
  }

  console.log('Proposed corrections:');
  console.log(`  #389: totalPaid: ${enrollment389.totalPaid} → ${CREDITS_APPLIED_389} ($${(CREDITS_APPLIED_389/100).toFixed(2)})`);
  console.log(`  #389: remainingBalance: ${enrollment389.remainingBalance} → ${NEW_REMAINING_389} ($${(NEW_REMAINING_389/100).toFixed(2)})`);
  console.log(`  #389: paymentStatus: ${enrollment389.paymentStatus} → partial_payment`);
  console.log('');

  // --- Validate enrollment 390 ---
  const calcRemaining390 = (enrollment390.totalCost || 0) - (enrollment390.totalPaid || 0);
  const storedRemaining390 = enrollment390.remainingBalance || 0;
  if (Math.abs(calcRemaining390 - storedRemaining390) > 1) {
    console.warn(`⚠️  Enrollment 390 remainingBalance is inconsistent with totalPaid. Expected ~${calcRemaining390}, got ${storedRemaining390}. Will correct paymentStatus only.`);
  }

  const needsPaymentStatusFix390 = enrollment390.paymentStatus === 'completed' && storedRemaining390 > 0;
  if (needsPaymentStatusFix390) {
    console.log(`  #390: paymentStatus: ${enrollment390.paymentStatus} → partial_payment (has $${(storedRemaining390/100).toFixed(2)} remaining)`);
  } else {
    console.log(`  #390: No paymentStatus change needed (paymentStatus=${enrollment390.paymentStatus}, remaining=${storedRemaining390})`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('='.repeat(70));
    console.log('🔍 DRY RUN COMPLETE — No changes made.');
    console.log('Run without --dry-run to apply changes.');
    console.log('='.repeat(70));
    process.exit(0);
  }

  // --- Apply corrections ---
  console.log('Applying corrections...');

  await db.update(programEnrollments)
    .set({
      totalPaid: CREDITS_APPLIED_389,
      remainingBalance: NEW_REMAINING_389,
      paymentStatus: 'partial_payment',
    })
    .where(eq(programEnrollments.id, 389));
  console.log(`✅ Enrollment #389 corrected: totalPaid=${CREDITS_APPLIED_389}, remainingBalance=${NEW_REMAINING_389}, paymentStatus=partial_payment`);

  if (needsPaymentStatusFix390) {
    await db.update(programEnrollments)
      .set({ paymentStatus: 'partial_payment' })
      .where(eq(programEnrollments.id, 390));
    console.log(`✅ Enrollment #390 paymentStatus corrected: completed → partial_payment`);
  } else {
    console.log(`ℹ️  Enrollment #390 skipped (no change needed).`);
  }

  // --- Verify ---
  const [updated389] = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.id, 389)).limit(1);
  const [updated390] = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.id, 390)).limit(1);

  console.log('');
  console.log('Post-correction state:');
  console.log(`  #389: totalPaid=${updated389.totalPaid}, remainingBalance=${updated389.remainingBalance}, paymentStatus=${updated389.paymentStatus}`);
  console.log(`  #390: totalPaid=${updated390.totalPaid}, remainingBalance=${updated390.remainingBalance}, paymentStatus=${updated390.paymentStatus}`);
  console.log('');
  console.log('='.repeat(70));
  console.log('✅ CORRECTION COMPLETE');
  console.log('='.repeat(70));

  process.exit(0);
}

fixMarekEnrollments().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
