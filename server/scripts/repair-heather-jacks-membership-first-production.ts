/**
 * Heather Jacks — membership-first ledger + 11 class biweeklies on original installment 2–12 dates.
 * Uses Drizzle directly (no storage import) so prod scripts work when storage deps are in flux.
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/repair-heather-jacks-membership-first-production.ts --dry-run
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/repair-heather-jacks-membership-first-production.ts
 */

import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  computeEffectiveBalance,
  membershipEnrollments,
  programEnrollments,
  scheduledPayments,
  users,
} from '../../shared/schema';

const PARENT_EMAIL = 'hlcelso@mail.naz.edu';
const PARENT_USER_ID = 146;
const ENROLLMENT_ID = 449;
const MEMBERSHIP_FEE_CENTS = 12_500;
const FIRST_PAYMENT_GROSS_CENTS = 13_958;
const CLASS_PAID_FROM_FIRST_CENTS = FIRST_PAYMENT_GROSS_CENTS - MEMBERSHIP_FEE_CENTS;
const TUITION_TOTAL_CENTS = 135_000;
const CLASS_REMAINING_CENTS = TUITION_TOTAL_CENTS - CLASS_PAID_FROM_FIRST_CENTS;

const DRY_RUN = process.argv.includes('--dry-run');

function splitCentsEvenly(totalCents: number, recipientCount: number): number[] {
  const base = Math.floor(totalCents / recipientCount);
  const remainder = totalCents % recipientCount;
  return Array.from({ length: recipientCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

async function main() {
  const db = await getDb();

  const [enrollment] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, ENROLLMENT_ID))
    .limit(1);
  if (!enrollment) {
    throw new Error(`Enrollment ${ENROLLMENT_ID} not found`);
  }
  if ((enrollment.parentEmail || '').toLowerCase() !== PARENT_EMAIL) {
    throw new Error(`Enrollment parent mismatch: ${enrollment.parentEmail}`);
  }

  const [parentUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, PARENT_EMAIL))
    .limit(1);
  if (!parentUser || parentUser.id !== PARENT_USER_ID) {
    throw new Error(`Parent user mismatch for ${PARENT_EMAIL}`);
  }

  const schoolId = enrollment.schoolId;
  const membershipYear = new Date().getFullYear();
  const [membership] = await db
    .select()
    .from(membershipEnrollments)
    .where(
      and(
        eq(membershipEnrollments.parentUserId, PARENT_USER_ID),
        eq(membershipEnrollments.schoolId, schoolId),
        eq(membershipEnrollments.membershipYear, membershipYear),
      ),
    )
    .limit(1);

  const allScheduled = await db
    .select()
    .from(scheduledPayments)
    .where(eq(scheduledPayments.enrollmentId, ENROLLMENT_ID));
  const byInstallment = [...allScheduled].sort(
    (a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0),
  );

  const originalFutureDates: Date[] = [];
  for (const row of byInstallment) {
    const n = row.installmentNumber ?? 0;
    if (n >= 2 && n <= 12) {
      originalFutureDates.push(new Date(row.scheduledDate));
    }
  }

  if (originalFutureDates.length !== 11) {
    const fromMetadata = (enrollment.metadata as Record<string, unknown> | null)?.biweeklyOriginalDates;
    if (Array.isArray(fromMetadata) && fromMetadata.length >= 11) {
      for (let i = 0; i < 11; i++) {
        originalFutureDates.push(new Date(String(fromMetadata[i])));
      }
    }
  }

  if (originalFutureDates.length !== 11) {
    throw new Error(
      `Need 11 due dates (installments 2–12); found ${originalFutureDates.length}. ` +
        `Capture dates from scheduled_payments or set enrollment.metadata.biweeklyOriginalDates.`,
    );
  }

  const amounts = splitCentsEvenly(CLASS_REMAINING_CENTS, 11);
  const alreadyRepaired = byInstallment.some(
    (r) =>
      r.metadata &&
      typeof r.metadata === 'object' &&
      (r.metadata as Record<string, unknown>).membershipFirstRepair === true,
  );

  console.log('=== Heather Jacks membership-first repair ===');
  console.log(`Enrollment #${ENROLLMENT_ID} | membership fee $${(MEMBERSHIP_FEE_CENTS / 100).toFixed(2)}`);
  console.log(
    `First payment: $${(FIRST_PAYMENT_GROSS_CENTS / 100).toFixed(2)} → membership $${(MEMBERSHIP_FEE_CENTS / 100).toFixed(2)}, class $${(CLASS_PAID_FROM_FIRST_CENTS / 100).toFixed(2)}`,
  );
  console.log(`Class remaining: $${(CLASS_REMAINING_CENTS / 100).toFixed(2)} in 11 installments`);
  console.log('Dates:', originalFutureDates.map((d) => d.toISOString().slice(0, 10)).join(', '));
  console.log('Amounts:', amounts.map((a) => `$${(a / 100).toFixed(2)}`).join(', '));
  console.log(`Current membership amount_paid: ${membership?.amountPaid ?? 0}c`);
  console.log(`Current enrollment total_paid: ${enrollment.totalPaid ?? 0}c`);

  if (alreadyRepaired) {
    console.log('\n[skip] Repair flag already present on scheduled payments.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] No database writes.');
    return;
  }

  const repairNote = `Membership-first repair (${new Date().toISOString().slice(0, 10)})`;
  const startDate = new Date();
  const expirationDate = new Date(startDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);

  if (membership) {
    await db
      .update(membershipEnrollments)
      .set({
        amount: MEMBERSHIP_FEE_CENTS,
        totalAmount: MEMBERSHIP_FEE_CENTS,
        amountPaid: MEMBERSHIP_FEE_CENTS,
        remainingBalance: 0,
        balanceDue: 0,
        status: 'enrolled',
        notes: repairNote,
        updatedAt: new Date(),
      })
      .where(eq(membershipEnrollments.id, membership.id));
  } else {
    await db.insert(membershipEnrollments).values({
      schoolId,
      parentUserId: PARENT_USER_ID,
      membershipYear,
      membershipTier: 'basic',
      amount: MEMBERSHIP_FEE_CENTS,
      amountPaid: MEMBERSHIP_FEE_CENTS,
      remainingBalance: 0,
      totalAmount: MEMBERSHIP_FEE_CENTS,
      balanceDue: 0,
      status: 'enrolled',
      stripeSubscriptionId: null,
      stripeCustomerId: parentUser.stripeCustomerId || null,
      startDate,
      renewalDate: expirationDate,
      dueDate: startDate,
      endDate: expirationDate,
      expirationDate,
      gracePeriodEnd: null,
      paymentMethod: 'other',
      notes: repairNote,
    });
  }

  const compAmount = enrollment.compAmountCents ?? 0;
  const remainingBalance = Math.max(0, TUITION_TOTAL_CENTS - CLASS_PAID_FROM_FIRST_CENTS - compAmount);
  const metadata = {
    ...((enrollment.metadata as Record<string, unknown>) || {}),
    biweeklyOriginalDates: originalFutureDates.map((d) => d.toISOString()),
    membershipFirstRepairAt: new Date().toISOString(),
  };

  await db
    .update(programEnrollments)
    .set({
      totalCost: TUITION_TOTAL_CENTS,
      totalPaid: CLASS_PAID_FROM_FIRST_CENTS,
      remainingBalance,
      paymentStatus: remainingBalance <= 0 ? 'completed' : 'partial_payment',
      status: 'enrolled',
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(programEnrollments.id, ENROLLMENT_ID));

  const deleted = await db
    .delete(scheduledPayments)
    .where(
      and(
        eq(scheduledPayments.enrollmentId, ENROLLMENT_ID),
        sql`${scheduledPayments.status} in ('pending', 'overdue', 'failed', 'processing')`,
      ),
    )
    .returning({ id: scheduledPayments.id });
  console.log(`Deleted ${deleted.length} pending scheduled payment(s).`);

  const created: { id: number; amount: number; date: string }[] = [];
  for (let i = 0; i < 11; i++) {
    const [row] = await db
      .insert(scheduledPayments)
      .values({
        enrollmentId: ENROLLMENT_ID,
        parentId: parentUser.id,
        parentEmail: PARENT_EMAIL,
        amount: amounts[i] ?? 0,
        scheduledDate: originalFutureDates[i]!,
        status: 'pending',
        schoolId,
        currency: 'usd',
        frequency: 'one_time',
        installmentNumber: i + 1,
        totalInstallments: 11,
        stripePaymentIntentId: null,
        processedAt: null,
        failureReason: null,
        retryCount: 0,
        chargedBy: null,
        reminderCount: 0,
        lastReminderSentAt: null,
        metadata: {
          membershipFirstRepair: true,
          paymentNumber: i + 1,
          totalPayments: 11,
          originalCheckoutInstallment: i + 2,
          createdAt: new Date().toISOString(),
        },
      })
      .returning();
    if (row) {
      created.push({
        id: row.id,
        amount: row.amount,
        date: originalFutureDates[i]!.toISOString().slice(0, 10),
      });
    }
  }

  const [verify] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, ENROLLMENT_ID))
    .limit(1);
  const effective = verify
    ? computeEffectiveBalance(verify.totalCost ?? 0, verify.totalPaid ?? 0, verify.compAmountCents ?? 0)
    : 0;
  console.log('\n✅ Applied.');
  console.log(
    `Enrollment: total_paid=$${((verify?.totalPaid ?? 0) / 100).toFixed(2)}, effective=$${(effective / 100).toFixed(2)}`,
  );
  console.log(`Created ${created.length} scheduled payment(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
