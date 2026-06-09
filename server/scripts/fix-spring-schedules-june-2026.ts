/**
 * Spring 2026 schedule repairs — prod fixes for session ending 2026-06-12.
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/fix-spring-schedules-june-2026.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/fix-spring-schedules-june-2026.ts --execute
 */

import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { programEnrollments, scheduledPayments, users } from '../../shared/schema';
import { storage } from '../storage';
import { resolveEnrollmentOutstandingCents } from '../lib/enrollment-balance';

const DRY_RUN = !process.argv.includes('--execute');

async function log(msg: string) {
  console.log(msg);
}

async function createPendingSp(input: {
  enrollmentId: number;
  parentId: number;
  parentEmail: string;
  schoolId: number;
  amountCents: number;
  dueDate: Date;
  installmentNumber: number;
  totalInstallments: number;
  enrollmentIds: number[];
  description: string;
}) {
  if (DRY_RUN) {
    log(
      `  [dry-run] SP enr=${input.enrollmentId} $${(input.amountCents / 100).toFixed(2)} due ${input.dueDate.toISOString().slice(0, 10)} ids=${JSON.stringify(input.enrollmentIds)}`,
    );
    return;
  }
  await storage.createScheduledPayment({
    schoolId: input.schoolId,
    enrollmentId: input.enrollmentId,
    parentId: input.parentId,
    parentEmail: input.parentEmail,
    amount: input.amountCents,
    currency: 'usd',
    scheduledDate: input.dueDate,
    frequency: 'one_time',
    installmentNumber: input.installmentNumber,
    totalInstallments: input.totalInstallments,
    status: 'pending',
    stripePaymentIntentId: null,
    processedAt: null,
    failureReason: null,
    retryCount: 0,
    metadata: {
      enrollmentIds: input.enrollmentIds,
      paymentPlan: 'biweekly',
      description: input.description,
      autoPay: false,
      repairedAt: new Date().toISOString(),
      checkoutPaymentIntentId: 'fix-spring-schedules-june-2026',
    },
  });
}

async function fixTaylor(db: Awaited<ReturnType<typeof getDb>>) {
  log('\n=== Taylor Karnath (84) — cancel excess pending SP 382 ===');
  if (!DRY_RUN) {
    await db!
      .update(scheduledPayments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(scheduledPayments.id, 382));
  }
  log('Cancelled SP 382 ($260); pending 380+381 = $520 matches owed.');
}

async function fixCarrie(db: Awaited<ReturnType<typeof getDb>>) {
  log('\n=== Carrie Pierce (98) — link Stripe + normalize Spring checkout ===');
  const stripeCustomerId = 'cus_T3qubnvZNmNrOs';
  if (!DRY_RUN) {
    await db!
      .update(users)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(users.id, 98));

    await db!
      .update(programEnrollments)
      .set({
        paymentPlan: 'full_payment',
        paymentFrequency: 'one_time',
        paymentStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(inArray(programEnrollments.id, [417, 418]));
  }
  log(`Linked ${stripeCustomerId}; 417/418 → full_payment, pending_payment ready for cart ($1800, $90 credit at checkout).`);
}

async function fixAlanna(db: Awaited<ReturnType<typeof getDb>>) {
  log('\n=== Alanna Thomas (70) — Stripe ground truth + bundled schedule ===');
  // Only succeeded Spring PI: pi_3TBz1d $300 → $150/child
  const paidEach = 15000;
  const remainingEach = 75000;

  if (!DRY_RUN) {
    await db!
      .update(programEnrollments)
      .set({
        totalPaid: paidEach,
        remainingBalance: remainingEach,
        paymentStatus: 'partial_payment',
        updatedAt: new Date(),
      })
      .where(inArray(programEnrollments.id, [338, 339]));

    // Restore bundled rows on Blaire (338) — 4 × $375 = $1500 family remaining
    for (const row of [
      { id: 392, inst: 2, date: '2026-04-20' },
      { id: 393, inst: 3, date: '2026-05-04' },
      { id: 394, inst: 4, date: '2026-05-18' },
    ]) {
      await db!
        .update(scheduledPayments)
        .set({
          status: 'pending',
          amount: 37500,
          enrollmentId: 338,
          stripePaymentIntentId: null,
          processedAt: null,
          failureReason: null,
          scheduledDate: new Date(row.date),
          updatedAt: new Date(),
          metadata: sql`COALESCE(${scheduledPayments.metadata}, '{}'::jsonb) || ${JSON.stringify({
            enrollmentIds: [338, 339],
            paymentPlan: 'biweekly',
            description: `Biweekly payment ${row.inst} of 5 (bundled)`,
            repairedAt: new Date().toISOString(),
          })}::jsonb`,
        })
        .where(eq(scheduledPayments.id, row.id));
    }

    // 4th pending bundled installment (inst 5)
    await createPendingSp({
      enrollmentId: 338,
      parentId: 70,
      parentEmail: 'atierson2@gmail.com',
      schoolId: 2,
      amountCents: 37500,
      dueDate: new Date('2026-06-01'),
      installmentNumber: 5,
      totalInstallments: 5,
      enrollmentIds: [338, 339],
      description: 'Biweekly payment 5 of 5 (bundled)',
    });

    // Hailey-only cancelled rows stay cancelled (bundled on 338)
  }
  log('Balances → $150 paid / $750 owed per child; 4 pending bundled Pay Now rows at $375 (covers both kids).');
}

async function fixStephanie(db: Awaited<ReturnType<typeof getDb>>) {
  log('\n=== Stephanie Yates (20) — Stripe-aligned pending installments ===');
  // pi_3TS54v futurePhases: $361.11 + $361.12 = $722.23 owed
  if (!DRY_RUN) {
    await db!
      .update(programEnrollments)
      .set({ paymentStatus: 'partial_payment', updatedAt: new Date() })
      .where(eq(programEnrollments.id, 337));
  }

  await createPendingSp({
    enrollmentId: 337,
    parentId: 20,
    parentEmail: 'yates.stephaniej@gmail.com',
    schoolId: 2,
    amountCents: 36111,
    dueDate: new Date('2026-05-15'),
    installmentNumber: 2,
    totalInstallments: 3,
    enrollmentIds: [337],
    description: 'Biweekly payment 2 of 3',
  });
  await createPendingSp({
    enrollmentId: 337,
    parentId: 20,
    parentEmail: 'yates.stephaniej@gmail.com',
    schoolId: 2,
    amountCents: 36112,
    dueDate: new Date('2026-05-29'),
    installmentNumber: 3,
    totalInstallments: 3,
    enrollmentIds: [337],
    description: 'Biweekly payment 3 of 3',
  });
  log('2 pending installments ($361.11 + $361.12) match Stripe metadata and $722.23 owed.');
}

async function createSinglePendingForEnrollment(enrollmentId: number) {
  const db = await getDb();
  const [enrollment] = await db!
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, enrollmentId))
    .limit(1);
  if (!enrollment) return;

  const outstanding = resolveEnrollmentOutstandingCents(enrollment);
  if (outstanding <= 0) return;

  const existing = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
  const actionable = existing.filter((sp) =>
    ['pending', 'failed', 'overdue'].includes(String(sp.status).toLowerCase()),
  );
  if (actionable.length > 0) {
    log(`  enr ${enrollmentId}: skip — ${actionable.length} actionable row(s) already`);
    return;
  }

  const parent = await storage.getUser(enrollment.parentId);
  if (!parent?.email) return;

  log(`  enr ${enrollmentId} (${enrollment.childName}): single pending $${(outstanding / 100).toFixed(2)}`);

  if (DRY_RUN) return;

  await db!
    .update(programEnrollments)
    .set({
      paymentStatus: 'partial_payment',
      updatedAt: new Date(),
    })
    .where(eq(programEnrollments.id, enrollmentId));

  await createPendingSp({
    enrollmentId,
    parentId: enrollment.parentId,
    parentEmail: parent.email,
    schoolId: enrollment.schoolId,
    amountCents: outstanding,
    dueDate: new Date(),
    installmentNumber: 1,
    totalInstallments: 1,
    enrollmentIds: [enrollmentId],
    description: 'Remaining Spring 2026 balance',
  });
}

async function fixBatchBrokenSchedules() {
  log('\n=== Batch: single pending row for full_payment / no-schedule Spring debt ===');
  const enrollmentIds = [
    315, 325, // Denise
    426, 427, // Verryluz
    413, 414, // Grace
    435, // Domenico
    415, // Kari
    411, // Jennifer
    388, // Olivia
  ];
  for (const id of enrollmentIds) {
    await createSinglePendingForEnrollment(id);
  }
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error('Database unavailable');
    process.exit(1);
  }

  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
  await fixTaylor(db);
  await fixCarrie(db);
  await fixAlanna(db);
  await fixStephanie(db);
  await fixBatchBrokenSchedules();
  log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
