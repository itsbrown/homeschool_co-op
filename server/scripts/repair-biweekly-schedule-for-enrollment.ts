/**
 * Create missing pending scheduled_payments for a biweekly enrollment after first checkout PI.
 *
 * Usage:
 *   npx tsx server/scripts/repair-biweekly-schedule-for-enrollment.ts --enrollment-id 351 --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/repair-biweekly-schedule-for-enrollment.ts --enrollment-id 351 --execute
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { programEnrollments, scheduledPayments } from '../../shared/schema';
import { storage } from '../storage';
import { buildBiweeklyCheckoutPhases } from '../lib/biweekly-checkout-contract';
import { resolveEnrollmentOutstandingCents } from '../lib/enrollment-balance';

function parseArgs(argv: string[]) {
  let enrollmentId: number | undefined;
  let dryRun = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--enrollment-id') enrollmentId = Number(argv[++i]);
    else if (argv[i] === '--execute') dryRun = false;
    else if (argv[i] === '--dry-run') dryRun = true;
  }
  if (!enrollmentId || Number.isNaN(enrollmentId)) {
    console.error('Usage: --enrollment-id <id> [--dry-run|--execute]');
    process.exit(2);
  }
  return { enrollmentId, dryRun };
}

function splitRemainingCents(remainingCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(remainingCents / count);
  const remainder = remainingCents - base * count;
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? base + remainder : base,
  );
}

async function main() {
  const { enrollmentId, dryRun } = parseArgs(process.argv.slice(2));
  const db = await getDb();
  const [enrollment] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, enrollmentId))
    .limit(1);

  if (!enrollment) {
    console.error(`Enrollment ${enrollmentId} not found`);
    process.exit(1);
  }

  if (enrollment.paymentPlan !== 'biweekly' && enrollment.paymentFrequency !== 'biweekly') {
    console.error(`Enrollment ${enrollmentId} is not biweekly (${enrollment.paymentPlan})`);
    process.exit(1);
  }

  const outstanding = resolveEnrollmentOutstandingCents(enrollment);
  if (outstanding <= 0) {
    console.log(`Enrollment ${enrollmentId} has no outstanding balance — nothing to schedule.`);
    return;
  }

  const existing = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
  const actionable = existing.filter(
    (sp) => sp.status === 'pending' || sp.status === 'failed' || sp.status === 'overdue',
  );
  if (actionable.length > 0) {
    console.log(
      `Enrollment ${enrollmentId} already has ${actionable.length} actionable scheduled payment(s) — aborting.`,
    );
    return;
  }

  const programStart = enrollment.programStartDate
    ? new Date(enrollment.programStartDate)
    : new Date();
  const programEnd = enrollment.programEndDate
    ? new Date(enrollment.programEndDate)
    : new Date();
  const anchor = enrollment.createdAt ? new Date(enrollment.createdAt) : new Date();

  const phases = buildBiweeklyCheckoutPhases(
    enrollment.totalCost,
    programStart,
    programEnd,
    anchor,
  );

  const completedCount = Math.min(
    Math.max(0, Math.round((enrollment.totalPaid || 0) / (phases[0]?.amount || 1))),
    phases.length - 1,
  );
  const futurePhases = phases.slice(Math.max(1, completedCount));

  if (futurePhases.length === 0) {
    console.error('Could not derive future installments from program dates — check enrollment dates.');
    process.exit(1);
  }

  const amounts = splitRemainingCents(outstanding, futurePhases.length);
  const parent = await storage.getUser(enrollment.parentId);
  if (!parent?.email) {
    console.error('Parent user not found');
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log(
    `Repair biweekly schedule — enrollment #${enrollmentId} (${enrollment.childName} / ${enrollment.className})`,
  );
  console.log(`Parent: ${parent.email} | Outstanding: $${(outstanding / 100).toFixed(2)}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('='.repeat(72));

  const rows = futurePhases.map((phase, idx) => ({
    installmentNumber: phase.installmentNumber,
    dueDate: phase.dueDate,
    amountCents: amounts[idx],
  }));

  for (const row of rows) {
    console.log(
      `  #${row.installmentNumber} due ${row.dueDate.toISOString().slice(0, 10)} — $${(row.amountCents / 100).toFixed(2)}`,
    );
  }
  console.log(`  Total scheduled: $${(amounts.reduce((s, a) => s + a, 0) / 100).toFixed(2)}`);

  if (dryRun) return;

  const piMeta = { checkoutPaymentIntentId: 'repair-biweekly-schedule-script' };
  for (const row of rows) {
    await storage.createScheduledPayment({
      schoolId: enrollment.schoolId,
      enrollmentId: enrollment.id,
      parentId: enrollment.parentId,
      parentEmail: parent.email,
      amount: row.amountCents,
      currency: 'usd',
      scheduledDate: row.dueDate,
      frequency: 'one_time',
      installmentNumber: row.installmentNumber,
      totalInstallments: phases.length,
      status: 'pending',
      stripePaymentIntentId: null,
      processedAt: null,
      failureReason: null,
      retryCount: 0,
      metadata: {
        enrollmentIds: [enrollment.id],
        paymentPlan: 'biweekly',
        description: `Biweekly payment ${row.installmentNumber} of ${phases.length}`,
        autoPay: true,
        repairedAt: new Date().toISOString(),
        ...piMeta,
      },
    });
  }

  console.log(`\nCreated ${rows.length} pending scheduled payment(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
