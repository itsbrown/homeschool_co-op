/**
 * Production Fix Script: Lauren Daggs Payment Data
 * 
 * Problem: Stripe webhook double-processing caused payment_intent.succeeded to also
 * process the Hamilton children's enrollments AFTER checkout.session.completed already
 * handled them.
 * 
 * Root cause: Same $600 checkout processed twice:
 *   - checkout.session.completed → correctly wrote $300 to Gabriel + $300 to Jack
 *   - payment_intent.succeeded   → ALSO wrote $300 to Jack a second time
 * 
 * Verified production state (hamiltonhomescleaningco@gmail.com, user ID 130):
 *   - Enrollment 386 (Gabriel, child_id=160): total_paid=$300 ✓ already correct
 *   - Enrollment 387 (Jack, child_id=161):    total_paid=$600 ✗ should be $300
 *   - Scheduled payment SP-365 (Jack, April 27): status=completed ✗ should be pending
 *   - stripe_payment_history ID 23: amount=$600 (pi_3TGqMXGhVuNOnUs70tNaEdzM) — source of truth
 * 
 * This script:
 *   1. Verifies Gabriel (enrollment 386) is at $300 paid — corrects if not
 *   2. Corrects Jack (enrollment 387): total_paid $600→$300, remaining $300→$600
 *   3. Reverts scheduled payment SP-365 from completed → pending
 *   4. Writes all changes + audit log atomically in ONE transaction
 * 
 * Run with:
 *   npx tsx server/scripts/fix-lauren-daggs-production.ts --dry-run  (preview only)
 *   npx tsx server/scripts/fix-lauren-daggs-production.ts             (apply changes)
 * 
 * NOTE: Must be run against the PRODUCTION database (DATABASE_URL must point to prod).
 */

import { getDb } from '../db';
import {
  users,
  programEnrollments,
  scheduledPayments,
  auditLogs,
} from '../../shared/schema';
import { eq } from 'drizzle-orm';

const LAUREN_EMAIL = 'hamiltonhomescleaningco@gmail.com';
const LAUREN_USER_ID = 130;

// Ground truth: one $600 checkout session, $300 per child
const GABRIEL_ENROLLMENT_ID = 386;
const JACK_ENROLLMENT_ID = 387;
const JACK_SP_APRIL_ID = 365;

const CORRECT_TOTAL_PAID_PER_CHILD = 30000;  // $300.00
const CORRECT_REMAINING_PER_CHILD  = 60000;  // $600.00 ($900 - $300)

const DRY_RUN = process.argv.includes('--dry-run');

async function fixLaurenDaggsPayments() {
  const db = await getDb();

  console.log('='.repeat(70));
  console.log('LAUREN DAGGS (hamiltonhomescleaningco@gmail.com) PAYMENT FIX');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE (changes will be applied)'}`);
  console.log('');

  // 1. Verify user identity
  console.log('Step 1: Verifying user...');
  const [lauren] = await db.select().from(users)
    .where(eq(users.id, LAUREN_USER_ID))
    .limit(1);

  if (!lauren || lauren.email !== LAUREN_EMAIL) {
    console.error(`❌ User ID ${LAUREN_USER_ID} not found or email mismatch.`);
    console.error(`   Expected: ${LAUREN_EMAIL}`);
    console.error(`   Found:    ${lauren?.email ?? 'not found'}`);
    console.error('');
    console.error('This script targets the PRODUCTION database. Verify DATABASE_URL.');
    process.exit(1);
  }
  console.log(`✅ Confirmed: user ${LAUREN_USER_ID} = ${lauren.name} (${lauren.email})`);
  console.log('');

  // 2. Read Gabriel's enrollment
  console.log('Step 2: Reading Gabriel\'s enrollment (ID 386)...');
  const [gabrielEnrollment] = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.id, GABRIEL_ENROLLMENT_ID))
    .limit(1);

  if (!gabrielEnrollment) {
    console.error(`❌ Gabriel enrollment ID ${GABRIEL_ENROLLMENT_ID} not found.`);
    process.exit(1);
  }

  const gabrielCurrentPaid      = gabrielEnrollment.totalPaid ?? 0;
  const gabrielCurrentRemaining = gabrielEnrollment.remainingBalance ?? 0;
  const gabrielNeedsFix = gabrielCurrentPaid !== CORRECT_TOTAL_PAID_PER_CHILD ||
                          gabrielCurrentRemaining !== CORRECT_REMAINING_PER_CHILD;

  console.log(`   Child:    ${gabrielEnrollment.childName ?? '(no name)'}`);
  console.log(`   Paid:     $${(gabrielCurrentPaid / 100).toFixed(2)}  → target $${(CORRECT_TOTAL_PAID_PER_CHILD / 100).toFixed(2)}`);
  console.log(`   Remaining:$${(gabrielCurrentRemaining / 100).toFixed(2)} → target $${(CORRECT_REMAINING_PER_CHILD / 100).toFixed(2)}`);
  console.log(`   Needs fix: ${gabrielNeedsFix ? '⚠️  YES' : '✅ No — already correct'}`);
  console.log('');

  // 3. Read Jack's enrollment
  console.log('Step 3: Reading Jack\'s enrollment (ID 387)...');
  const [jackEnrollment] = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.id, JACK_ENROLLMENT_ID))
    .limit(1);

  if (!jackEnrollment) {
    console.error(`❌ Jack enrollment ID ${JACK_ENROLLMENT_ID} not found.`);
    process.exit(1);
  }

  const jackCurrentPaid      = jackEnrollment.totalPaid ?? 0;
  const jackCurrentRemaining = jackEnrollment.remainingBalance ?? 0;
  const jackEnrollmentNeedsFix = jackCurrentPaid !== CORRECT_TOTAL_PAID_PER_CHILD ||
                                 jackCurrentRemaining !== CORRECT_REMAINING_PER_CHILD;

  console.log(`   Child:    ${jackEnrollment.childName ?? '(no name)'}`);
  console.log(`   Paid:     $${(jackCurrentPaid / 100).toFixed(2)}  → target $${(CORRECT_TOTAL_PAID_PER_CHILD / 100).toFixed(2)}`);
  console.log(`   Remaining:$${(jackCurrentRemaining / 100).toFixed(2)} → target $${(CORRECT_REMAINING_PER_CHILD / 100).toFixed(2)}`);
  console.log(`   Needs fix: ${jackEnrollmentNeedsFix ? '⚠️  YES' : '✅ No — already correct'}`);
  console.log('');

  // 4. Read Jack's April scheduled payment
  console.log('Step 4: Reading Jack\'s April scheduled payment (ID 365)...');
  const [sp365] = await db.select().from(scheduledPayments)
    .where(eq(scheduledPayments.id, JACK_SP_APRIL_ID))
    .limit(1);

  if (!sp365) {
    console.error(`❌ Scheduled payment ID ${JACK_SP_APRIL_ID} not found.`);
    process.exit(1);
  }

  const spNeedsFix = sp365.status === 'completed';
  console.log(`   Enrollment: ${sp365.enrollmentId}`);
  console.log(`   Amount:     $${((sp365.amount ?? 0) / 100).toFixed(2)}`);
  console.log(`   Due:        ${sp365.scheduledDate}`);
  console.log(`   Status:     ${sp365.status} → target: pending`);
  console.log(`   Needs fix:  ${spNeedsFix ? '⚠️  YES' : '✅ No — already pending'}`);
  console.log('');

  const anyNeedsFix = gabrielNeedsFix || jackEnrollmentNeedsFix || spNeedsFix;
  if (!anyNeedsFix) {
    console.log('✅ All records already in the correct state. Nothing to do.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('='.repeat(70));
    console.log('🔍 DRY RUN COMPLETE — no changes applied.');
    console.log('='.repeat(70));
    console.log('');
    console.log('To apply, run without --dry-run:');
    console.log('  npx tsx server/scripts/fix-lauren-daggs-production.ts');
    process.exit(0);
  }

  // 5. Apply all corrections in a single transaction
  console.log('Step 5: Applying all corrections in one atomic transaction...');
  await db.transaction(async (tx: any) => {
    if (gabrielNeedsFix) {
      await tx.update(programEnrollments)
        .set({
          totalPaid:        CORRECT_TOTAL_PAID_PER_CHILD,
          remainingBalance: CORRECT_REMAINING_PER_CHILD,
          paymentStatus:    'partial_payment',
        })
        .where(eq(programEnrollments.id, GABRIEL_ENROLLMENT_ID));
      console.log(`  ✅ Enrollment 386 (Gabriel): paid=$${(CORRECT_TOTAL_PAID_PER_CHILD / 100).toFixed(2)}, remaining=$${(CORRECT_REMAINING_PER_CHILD / 100).toFixed(2)}`);
    } else {
      console.log('  ⏭  Enrollment 386 (Gabriel): already correct, skipped.');
    }

    if (jackEnrollmentNeedsFix) {
      await tx.update(programEnrollments)
        .set({
          totalPaid:        CORRECT_TOTAL_PAID_PER_CHILD,
          remainingBalance: CORRECT_REMAINING_PER_CHILD,
          paymentStatus:    'partial_payment',
        })
        .where(eq(programEnrollments.id, JACK_ENROLLMENT_ID));
      console.log(`  ✅ Enrollment 387 (Jack):    paid=$${(CORRECT_TOTAL_PAID_PER_CHILD / 100).toFixed(2)}, remaining=$${(CORRECT_REMAINING_PER_CHILD / 100).toFixed(2)}`);
    } else {
      console.log('  ⏭  Enrollment 387 (Jack): already correct, skipped.');
    }

    if (spNeedsFix) {
      await tx.update(scheduledPayments)
        .set({ status: 'pending' })
        .where(eq(scheduledPayments.id, JACK_SP_APRIL_ID));
      console.log('  ✅ Scheduled payment 365 (Jack, April 27): completed → pending');
    } else {
      console.log('  ⏭  Scheduled payment 365: already pending, skipped.');
    }

    // Audit log within the same transaction — rolled back atomically if any step fails
    await tx.insert(auditLogs).values({
      actionType: 'admin_balance_correction',
      severity:   'warn',
      actorId:    null,
      actorEmail: 'system-script',
      targetType: 'program_enrollment',
      targetId:   String(JACK_ENROLLMENT_ID),
      metadata: {
        enrollments: {
          gabriel: {
            enrollmentId: GABRIEL_ENROLLMENT_ID,
            before: { totalPaid: gabrielCurrentPaid, remainingBalance: gabrielCurrentRemaining, paymentStatus: gabrielEnrollment.paymentStatus },
            after:  { totalPaid: CORRECT_TOTAL_PAID_PER_CHILD, remainingBalance: CORRECT_REMAINING_PER_CHILD, paymentStatus: 'partial_payment' },
            changed: gabrielNeedsFix,
          },
          jack: {
            enrollmentId: JACK_ENROLLMENT_ID,
            before: { totalPaid: jackCurrentPaid, remainingBalance: jackCurrentRemaining, paymentStatus: jackEnrollment.paymentStatus },
            after:  { totalPaid: CORRECT_TOTAL_PAID_PER_CHILD, remainingBalance: CORRECT_REMAINING_PER_CHILD, paymentStatus: 'partial_payment' },
            changed: jackEnrollmentNeedsFix,
          },
        },
        scheduledPayments: {
          sp365: {
            id: JACK_SP_APRIL_ID,
            before: { status: sp365.status },
            after:  { status: 'pending' },
            changed: spNeedsFix,
          },
        },
        context: {
          reason: 'Stripe webhook double-processing fix — payment_intent.succeeded incorrectly applied $300 to Jack Hamilton (enrollment 387) after checkout.session.completed already processed it. Both children should have $300 totalPaid from the single $600 checkout session.',
          scriptName: 'fix-lauren-daggs-production.ts',
          parentEmail: LAUREN_EMAIL,
          stripePaymentIntentId: 'pi_3TGqMXGhVuNOnUs70tNaEdzM',
          actualCheckoutAmountCents: 60000,
          perChildAmountCents: 30000,
        },
      },
    });
    console.log('  ✅ Audit log written inside transaction.');
  });

  console.log('');
  console.log('='.repeat(70));
  console.log('✅ FIX COMPLETE — all changes committed atomically.');
  console.log('='.repeat(70));
  console.log('');
  console.log('Summary:');
  if (gabrielNeedsFix) console.log(`  ✅ Enrollment 386 (Gabriel): paid $${(gabrielCurrentPaid/100).toFixed(2)} → $${(CORRECT_TOTAL_PAID_PER_CHILD/100).toFixed(2)}`);
  else                  console.log(`  ⏭  Enrollment 386 (Gabriel): was already correct ($${(gabrielCurrentPaid/100).toFixed(2)} paid)`);
  if (jackEnrollmentNeedsFix) console.log(`  ✅ Enrollment 387 (Jack):    paid $${(jackCurrentPaid/100).toFixed(2)} → $${(CORRECT_TOTAL_PAID_PER_CHILD/100).toFixed(2)}`);
  else                        console.log(`  ⏭  Enrollment 387 (Jack):    was already correct ($${(jackCurrentPaid/100).toFixed(2)} paid)`);
  if (spNeedsFix) console.log(`  ✅ Scheduled payment 365 (April 27): completed → pending`);
  else            console.log(`  ⏭  Scheduled payment 365: was already pending`);
  console.log('');
  console.log('Verify in admin panel: hamiltonhomescleaningco@gmail.com');
  console.log('');

  process.exit(0);
}

fixLaurenDaggsPayments().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
