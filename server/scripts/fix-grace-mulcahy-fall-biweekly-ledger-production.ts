/**
 * Grace Mulcahy #66 — Fall 2026 Half Day marked paid after first biweekly charge.
 *
 * Aug 20 pi_3U6bUR charged $332.50 + $105 sibling credit. Fulfill allocated
 * originalAmountCents=$2,100 (plan total), so #656/#657 show $0 owed. Autopay
 * then cancelled Sep 3 / Sep 17 installments. Real leftover is $1,662.50.
 *
 * Also cancels leftover Stripe annual membership sub_1Rv5wX (app membership
 * already enrolled). Does not refund the Aug 22 $175 sub charge.
 * Restores cancelled installments 2–3 as pending (prod CHECK has no overdue).
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/fix-grace-mulcahy-fall-biweekly-ledger-production.ts --dry-run
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/fix-grace-mulcahy-fall-biweekly-ledger-production.ts
 */

import Stripe from 'stripe';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import {
  auditLogs,
  payments,
  programEnrollments,
  scheduledPayments,
  users,
} from '../../shared/schema';
import { computeEffectiveBalance } from '../../shared/schema';
import { allocatePaymentByBalance } from '../lib/splitIntegerEvenly';

const DRY_RUN = process.argv.includes('--dry-run');
const SCRIPT = 'fix-grace-mulcahy-fall-biweekly-ledger-production.ts';
const PARENT_ID = 66;
const PARENT_EMAIL = 'gciciotti29@gmail.com';
const SCHOOL_ID = 2;
const PI_ID = 'pi_3U6bURGhVuNOnUs70ehA46v8';
const PAYMENT_ID = 464;
const FALL_IDS = [656, 657] as const;
const LIST_CENTS = 105000;
const CARD_CENTS = 33250;
const CREDIT_CENTS = 10500;
const THIS_PAYMENT_GROSS = CARD_CENTS + CREDIT_CENTS;
const PHANTOM_PAID_CENTS = 105000;
const RESTORE_SP_IDS = [800, 801] as const;
const KEEP_PENDING_SP_IDS = [802, 803, 804] as const;
const SUB_ID = 'sub_1Rv5wXGhVuNOnUs7V7g9wu8z';
const STRIPE_CUSTOMER_ID = 'cus_SqnX6udAcwhiHX';

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL required');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY required (via .env.prod)');
  const stripe = new Stripe(stripeKey);

  console.log(`Grace Mulcahy Fall biweekly ledger — ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);

  const [parent] = await db.select().from(users).where(eq(users.id, PARENT_ID)).limit(1);
  if (!parent || parent.email?.toLowerCase() !== PARENT_EMAIL) {
    throw new Error(`Expected #${PARENT_ID} ${PARENT_EMAIL}, got ${parent?.email}`);
  }

  const rows = await db
    .select()
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, [...FALL_IDS]));
  if (rows.length !== FALL_IDS.length) {
    throw new Error(`Expected Fall seats ${FALL_IDS.join(',')}, found ${rows.map((r) => r.id)}`);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of FALL_IDS) {
    const row = byId.get(id);
    if (!row || row.parentId !== PARENT_ID) {
      throw new Error(`Fall #${id} missing or not parent #${PARENT_ID}`);
    }
    if (row.sessionId !== 2 || !String(row.className).toLowerCase().includes('half day')) {
      throw new Error(
        `Fall #${id} is not Fall 2026 Half Day (session=${row.sessionId} class=${row.className})`,
      );
    }
    if ((row.totalCost ?? 0) !== LIST_CENTS) {
      throw new Error(`Fall #${id} total_cost=${row.totalCost}, expected ${LIST_CENTS}`);
    }
    const paid = row.totalPaid ?? 0;
    const alreadyFixed = paid === 21875 && computeEffectiveBalance(LIST_CENTS, paid, 0) === 83125;
    if (paid !== PHANTOM_PAID_CENTS && !alreadyFixed) {
      throw new Error(`Fall #${id} total_paid=${paid} — expected ${PHANTOM_PAID_CENTS} or corrected 21875`);
    }
    console.log(
      `  Fall #${id} ${row.childName}: paid ${dollars(paid)} due ${dollars(
        computeEffectiveBalance(LIST_CENTS, paid, row.compAmountCents ?? 0),
      )} status=${row.status}/${row.paymentStatus}`,
    );
  }

  const allocation = allocatePaymentByBalance(
    THIS_PAYMENT_GROSS,
    FALL_IDS.map((id) => ({
      enrollmentId: id,
      effectiveBalanceCents: LIST_CENTS,
    })),
  );
  const paidById = new Map(allocation.map((a) => [a.enrollmentId, a.amountCents]));
  for (const id of FALL_IDS) {
    if (paidById.get(id) !== 21875) {
      throw new Error(`Unexpected split for #${id}: ${paidById.get(id)}`);
    }
  }

  const [pay] = await db.select().from(payments).where(eq(payments.id, PAYMENT_ID)).limit(1);
  if (!pay || pay.parentId !== PARENT_ID || pay.stripePaymentIntentId !== PI_ID) {
    throw new Error(`Payment #${PAYMENT_ID} is not ${PI_ID} for parent #${PARENT_ID}`);
  }
  console.log(
    `  Payment #${PAYMENT_ID} amount=${dollars(pay.amount)} stripeCharged=${
      (pay.metadata as Record<string, unknown> | null)?.stripeChargedCents
    }`,
  );

  const sps = await db
    .select()
    .from(scheduledPayments)
    .where(inArray(scheduledPayments.id, [...RESTORE_SP_IDS, ...KEEP_PENDING_SP_IDS]));
  const spById = new Map(sps.map((s) => [s.id, s]));
  for (const id of RESTORE_SP_IDS) {
    const sp = spById.get(id);
    if (!sp || sp.parentId !== PARENT_ID || sp.amount !== CARD_CENTS) {
      throw new Error(`SP #${id} missing or unexpected`);
    }
    console.log(`  SP #${id} inst ${sp.installmentNumber} ${sp.status} ${dollars(sp.amount)}`);
  }
  for (const id of KEEP_PENDING_SP_IDS) {
    const sp = spById.get(id);
    if (!sp || sp.status !== 'pending') {
      throw new Error(`SP #${id} expected pending, got ${sp?.status}`);
    }
  }

  const pi = await stripe.paymentIntents.retrieve(PI_ID);
  if (pi.status !== 'succeeded' || pi.amount !== CARD_CENTS) {
    throw new Error(`Stripe ${PI_ID} status=${pi.status} amount=${pi.amount}`);
  }

  const sub = await stripe.subscriptions.retrieve(SUB_ID);
  console.log(`  Stripe sub ${SUB_ID} status=${sub.status} customer=${sub.customer}`);
  if (sub.customer !== STRIPE_CUSTOMER_ID && String(sub.customer) !== STRIPE_CUSTOMER_ID) {
    throw new Error(`Sub customer ${sub.customer} ≠ ${STRIPE_CUSTOMER_ID}`);
  }

  const leftoverFamily = FALL_IDS.reduce(
    (sum, id) => sum + (LIST_CENTS - (paidById.get(id) ?? 0)),
    0,
  );
  console.log(
    `Proposed: each Fall seat paid ${dollars(21875)} leftover ${dollars(83125)}; family leftover ${dollars(leftoverFamily)}`,
  );
  console.log(`Proposed: restore SP #800/#801 as pending (past due); keep #802–#804 pending`);
  console.log(
    `Proposed: payment #464 amount ${dollars(pay.amount)} → ${dollars(THIS_PAYMENT_GROSS)}`,
  );
  console.log(
    `Proposed: cancel Stripe sub ${SUB_ID} (status now ${sub.status}; no refund of Aug 22 $175)`,
  );

  if (DRY_RUN) {
    console.log('DRY RUN complete — no changes.');
    process.exit(0);
  }

  const now = new Date();
  const alreadyLedgerFixed = rows.every((r) => (r.totalPaid ?? 0) === 21875);

  if (!alreadyLedgerFixed) {
    await db.transaction(async (tx) => {
      for (const id of FALL_IDS) {
        const row = byId.get(id)!;
        const nextPaid = paidById.get(id)!;
        const nextRemaining = LIST_CENTS - nextPaid;
        const priorMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        await tx
          .update(programEnrollments)
          .set({
            totalPaid: nextPaid,
            remainingBalance: nextRemaining,
            paymentStatus: 'partial_payment',
            status: 'enrolled',
            paymentPlan: 'biweekly',
            notes: `${row.notes || ''} | Fall first-installment phantom paid cleared (${SCRIPT})`.trim(),
            metadata: {
              ...priorMeta,
              ledgerCorrection: {
                correctedAt: now.toISOString(),
                script: SCRIPT,
                reason:
                  'First biweekly PI allocated plan-total originalAmountCents; reset paid to card+credit split',
                previousTotalPaidCents: row.totalPaid,
                previousRemainingBalanceCents: row.remainingBalance,
                stripePaymentIntentId: PI_ID,
                thisPaymentGrossCents: THIS_PAYMENT_GROSS,
              },
            },
            updatedAt: now,
          })
          .where(and(eq(programEnrollments.id, id), eq(programEnrollments.parentId, PARENT_ID)));
        console.log(`  Fall #${id} paid ${dollars(row.totalPaid ?? 0)} → ${dollars(nextPaid)}`);
      }

      for (const id of RESTORE_SP_IDS) {
        const sp = spById.get(id)!;
        if (sp.status === 'pending' || sp.status === 'overdue') {
          console.log(`  SP #${id} already ${sp.status}`);
          continue;
        }
        await tx
          .update(scheduledPayments)
          .set({
            status: 'pending',
            updatedAt: now,
          })
          .where(and(eq(scheduledPayments.id, id), eq(scheduledPayments.parentId, PARENT_ID)));
        console.log(`  SP #${id} ${sp.status} → pending`);
      }

      const payMeta = (pay.metadata as Record<string, unknown> | null) ?? {};
      await tx
        .update(payments)
        .set({
          amount: THIS_PAYMENT_GROSS,
          metadata: {
            ...payMeta,
            stripeChargedCents: CARD_CENTS,
            creditsAppliedCents: CREDIT_CENTS,
            originalAmountCents: THIS_PAYMENT_GROSS,
            ledgerCorrection: {
              correctedAt: now.toISOString(),
              script: SCRIPT,
              previousAmountCents: pay.amount,
            },
          },
          updatedAt: now,
        })
        .where(eq(payments.id, PAYMENT_ID));

      await tx.insert(auditLogs).values({
        actionType: 'admin_balance_correction',
        severity: 'info',
        actorId: null,
        actorEmail: 'system-script',
        targetType: 'user',
        targetId: String(PARENT_ID),
        schoolId: SCHOOL_ID,
        metadata: {
          script: SCRIPT,
          parentEmail: PARENT_EMAIL,
          stripePaymentIntentId: PI_ID,
          paymentId: PAYMENT_ID,
          fallEnrollmentIds: [...FALL_IDS],
          restoredScheduledPaymentIds: [...RESTORE_SP_IDS],
          thisPaymentGrossCents: THIS_PAYMENT_GROSS,
          familyLeftoverCents: leftoverFamily,
        },
      });
    });
  } else {
    console.log('Ledger already corrected; skipping enrollment/SP/payment writes.');
  }

  if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
    const canceled = await stripe.subscriptions.cancel(SUB_ID);
    console.log(`  Stripe sub ${SUB_ID} → ${canceled.status}`);
  } else {
    console.log(`  Stripe sub ${SUB_ID} already ${sub.status}`);
  }

  const after = await db
    .select()
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, [...FALL_IDS]));
  for (const row of after.sort((a, b) => a.id - b.id)) {
    console.log(
      `  After #${row.id} paid=${dollars(row.totalPaid ?? 0)} remaining=${dollars(row.remainingBalance ?? 0)} effective=${dollars(row.effectiveBalance ?? 0)} ${row.paymentStatus}`,
    );
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
