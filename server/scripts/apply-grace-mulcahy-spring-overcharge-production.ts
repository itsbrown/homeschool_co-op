/**
 * Grace Mulcahy (parent 66) — Spring 2026 overcharge correction.
 *
 * Spring net $1,710 ($1,800 − $90 credit). Apr–May cash $1,529 left $181 due;
 * Jun 6 autopay took $724 → $543 overcharge. Apr 30 $271.50×2 were on Winter #194
 * but belong in the Spring Apr 1+ pool.
 *
 * 1) Stripe partial refund $271.50 on each Jun 6 PI ($543 total)
 * 2) Reallocate scheduled_payments 300/301 → Spring enrollments 413/414
 * 3) Winter #194: reduce total_paid $543, comp_amount_cents $543 (winter stays closed)
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-grace-mulcahy-spring-overcharge-production.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-grace-mulcahy-spring-overcharge-production.ts
 */

import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  auditLogs,
  payments,
  programEnrollments,
  refunds,
  scheduledPayments,
} from '../../shared/schema';
import { computeEffectiveBalance } from '../../shared/schema';

const PARENT_ID = 66;
const PARENT_EMAIL = 'gciciotti29@gmail.com';
const SCHOOL_ID = 2;

const WINTER_ENROLLMENT_ID = 194;
const SPRING_DELANEY_ID = 413;
const SPRING_DUTTON_ID = 414;

const SP_REALLOC_FROM_WINTER = [
  { spId: 300, toEnrollmentId: SPRING_DELANEY_ID, pi: 'pi_3TS04MGhVuNOnUs712058clO' },
  { spId: 301, toEnrollmentId: SPRING_DUTTON_ID, pi: 'pi_3TS05XGhVuNOnUs7119YsBuL' },
] as const;

const JUN6_REFUNDS = [
  {
    paymentId: 331,
    spId: 520,
    enrollmentId: SPRING_DELANEY_ID,
    pi: 'pi_3TfB5vGhVuNOnUs71mnmKK3d',
    refundCents: 27150,
  },
  {
    paymentId: 332,
    spId: 521,
    enrollmentId: SPRING_DUTTON_ID,
    pi: 'pi_3TfB5wGhVuNOnUs71Nicze79',
    refundCents: 27150,
  },
] as const;

const REALLOC_CENTS_EACH = 27150;
const REALLOC_TOTAL_CENTS = REALLOC_CENTS_EACH * 2;
const REFUND_TOTAL_CENTS = 54300;

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = await getDb();
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey && !DRY_RUN) {
    console.error('STRIPE_SECRET_KEY required');
    process.exit(1);
  }
  const stripe = stripeKey ? new Stripe(stripeKey) : null;

  console.log('='.repeat(72));
  console.log(`Grace Mulcahy Spring overcharge correction — ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('='.repeat(72));

  const enrollments = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.parentId, PARENT_ID));

  const winter = enrollments.find((e) => e.id === WINTER_ENROLLMENT_ID);
  const springD = enrollments.find((e) => e.id === SPRING_DELANEY_ID);
  const springU = enrollments.find((e) => e.id === SPRING_DUTTON_ID);
  if (!winter || !springD || !springU) {
    throw new Error('Missing expected enrollments 194, 413, 414');
  }

  console.log('\nBefore:');
  for (const e of [winter, springD, springU]) {
    console.log(
      `  #${e.id} ${e.childName}: paid $${((e.totalPaid ?? 0) / 100).toFixed(2)} / $${((e.totalCost ?? 0) / 100).toFixed(2)}, comp $${((e.compAmountCents ?? 0) / 100).toFixed(2)}, eff $${(computeEffectiveBalance(e.totalCost ?? 0, e.totalPaid ?? 0, e.compAmountCents ?? 0) / 100).toFixed(2)}`,
    );
  }

  const winterAfterPaid = (winter.totalPaid ?? 0) - REALLOC_TOTAL_CENTS;
  const winterAfterComp = (winter.compAmountCents ?? 0) + REALLOC_TOTAL_CENTS;
  const winterNote =
    '2026-06-06: $543 Spring reclass — SP 300/301 moved to Spring #413/#414; comp covers prior Winter posting.';

  if (DRY_RUN) {
    console.log('\nPlanned Stripe refunds:');
    for (const r of JUN6_REFUNDS) {
      console.log(`  ${r.pi}: refund $${(r.refundCents / 100).toFixed(2)} (keep $${((36200 - r.refundCents) / 100).toFixed(2)})`);
    }
    console.log('\nPlanned reallocation:');
    for (const row of SP_REALLOC_FROM_WINTER) {
      console.log(`  SP ${row.spId} → enrollment ${row.toEnrollmentId}`);
    }
    console.log(`\nWinter #194: total_paid $${(winterAfterPaid / 100).toFixed(2)}, comp $${(winterAfterComp / 100).toFixed(2)}`);
    console.log('Spring #413/#414: total_paid unchanged at $900.00 (paid in full after $543 refund)');
    console.log('\nDRY RUN complete.');
    return;
  }

  const stripeRefundIds: string[] = [];

  for (const r of JUN6_REFUNDS) {
    const pi = await stripe!.paymentIntents.retrieve(r.pi);
    if (pi.status !== 'succeeded') {
      throw new Error(`PI ${r.pi} status ${pi.status}`);
    }
    const refund = await stripe!.refunds.create({
      payment_intent: r.pi,
      amount: r.refundCents,
      reason: 'requested_by_customer',
      metadata: {
        parentId: String(PARENT_ID),
        enrollmentId: String(r.enrollmentId),
        correction: 'grace_mulcahy_spring_2026_overcharge',
        scheduledPaymentId: String(r.spId),
      },
    });
    console.log(`✅ Stripe refund ${refund.id}: $${(r.refundCents / 100).toFixed(2)} on ${r.pi}`);
    stripeRefundIds.push(refund.id);
  }

  await db.transaction(async (tx) => {
    for (const row of SP_REALLOC_FROM_WINTER) {
      const [sp] = await tx.select().from(scheduledPayments).where(eq(scheduledPayments.id, row.spId)).limit(1);
      if (!sp || sp.enrollmentId !== WINTER_ENROLLMENT_ID) {
        throw new Error(`SP ${row.spId} expected on enrollment ${WINTER_ENROLLMENT_ID}, got ${sp?.enrollmentId}`);
      }
      await tx
        .update(scheduledPayments)
        .set({
          enrollmentId: row.toEnrollmentId,
          metadata: {
            ...(typeof sp.metadata === 'object' && sp.metadata ? sp.metadata : {}),
            springReclass20260606: true,
            priorEnrollmentId: WINTER_ENROLLMENT_ID,
            correction: 'grace_mulcahy_spring_overcharge',
          },
          updatedAt: new Date(),
        })
        .where(eq(scheduledPayments.id, row.spId));
    }

    await tx
      .update(programEnrollments)
      .set({
        totalPaid: winterAfterPaid,
        compAmountCents: winterAfterComp,
        remainingBalance: 0,
        paymentStatus: 'completed',
        notes: winterNote,
        updatedAt: new Date(),
      })
      .where(eq(programEnrollments.id, WINTER_ENROLLMENT_ID));

    for (let i = 0; i < JUN6_REFUNDS.length; i++) {
      const r = JUN6_REFUNDS[i];
      const stripeRefundId = stripeRefundIds[i];
      await tx.insert(refunds).values({
        schoolId: SCHOOL_ID,
        paymentId: r.paymentId,
        enrollmentId: r.enrollmentId,
        amount: r.refundCents,
        currency: 'usd',
        reason: 'requested_by_customer',
        description:
          'Spring 2026 overcharge correction — Jun 6 autopay $362 should have been $90.50 after Apr/May Spring payments',
        status: 'completed',
        stripeRefundId,
        processedAt: new Date(),
        metadata: {
          script: 'apply-grace-mulcahy-spring-overcharge-production.ts',
          scheduledPaymentId: r.spId,
          parentId: PARENT_ID,
        },
      });

      const [sp] = await tx
        .select()
        .from(scheduledPayments)
        .where(eq(scheduledPayments.id, r.spId))
        .limit(1);
      await tx
        .update(scheduledPayments)
        .set({
          metadata: {
            ...(typeof sp?.metadata === 'object' && sp.metadata ? sp.metadata : {}),
            partialRefundCents: r.refundCents,
            stripeRefundId,
            correction: 'grace_mulcahy_spring_overcharge',
          },
          updatedAt: new Date(),
        })
        .where(eq(scheduledPayments.id, r.spId));
    }

    await tx.insert(auditLogs).values({
      actionType: 'admin_balance_correction',
      severity: 'info',
      actorId: null,
      actorEmail: 'system-script',
      targetType: 'user',
      targetId: String(PARENT_ID),
      metadata: {
        script: 'apply-grace-mulcahy-spring-overcharge-production.ts',
        parentEmail: PARENT_EMAIL,
        springNetCents: 171000,
        refundTotalCents: REFUND_TOTAL_CENTS,
        reallocatedSpIds: SP_REALLOC_FROM_WINTER.map((r) => r.spId),
        winterEnrollmentId: WINTER_ENROLLMENT_ID,
        springEnrollmentIds: [SPRING_DELANEY_ID, SPRING_DUTTON_ID],
        stripeRefundIds,
      },
    });
  });

  const after = await db.select().from(programEnrollments).where(eq(programEnrollments.parentId, PARENT_ID));
  console.log('\nAfter:');
  for (const id of [WINTER_ENROLLMENT_ID, SPRING_DELANEY_ID, SPRING_DUTTON_ID]) {
    const e = after.find((x) => x.id === id)!;
    console.log(
      `  #${e.id} ${e.childName}: paid $${((e.totalPaid ?? 0) / 100).toFixed(2)}, comp $${((e.compAmountCents ?? 0) / 100).toFixed(2)}, eff $${(computeEffectiveBalance(e.totalCost ?? 0, e.totalPaid ?? 0, e.compAmountCents ?? 0) / 100).toFixed(2)}, status ${e.paymentStatus}`,
    );
  }
  console.log('\nCorrection complete. $543 refunded on card; Spring paid in full at $1,710 net.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
