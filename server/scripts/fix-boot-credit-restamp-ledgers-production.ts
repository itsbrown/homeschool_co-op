/**
 * Undo boot-time credit restamps. Posts only money that was actually collected.
 *
 *   Grace Mulcahy #66  — $332.50 + $105, then Sep 18 autopay $332.50. Owed $1,330.
 *   Jennifer Brew #128 — no Fall card charge. Revoke phantom credits #81/#82.
 *   Amy Misso #91      — first charge $701.66 + $290 credit. Two $290 restamps removed.
 *   Alanna Thomas #70  — first charge $603.75 + $585 credit. One $585 restamp removed.
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/fix-boot-credit-restamp-ledgers-production.ts --dry-run
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/fix-boot-credit-restamp-ledgers-production.ts
 */

import Stripe from 'stripe';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { auditLogs, credits, programEnrollments, scheduledPayments, users } from '../../shared/schema';

const DRY_RUN = process.argv.includes('--dry-run');
const SCRIPT = 'fix-boot-credit-restamp-ledgers-production.ts';
const SCHOOL_ID = 2;

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type SeatFix = {
  id: number;
  childName: string;
  currentPaid: number;
  nextPaid: number;
  listCents: number;
  status: string;
  paymentStatus: string;
};

async function main() {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL required');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey?.startsWith('sk_')) throw new Error('STRIPE_SECRET_KEY required (via .env.prod)');
  const stripe = new Stripe(stripeKey);

  console.log(`Boot credit restamp ledger restore — ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}\n`);

  const graceSeats: SeatFix[] = [
    { id: 656, childName: 'Delaney Mulcahy', currentPaid: 70000, nextPaid: 38500, listCents: 105000, status: 'enrolled', paymentStatus: 'partial_payment' },
    { id: 657, childName: 'Dutton Mulcahy', currentPaid: 70000, nextPaid: 38500, listCents: 105000, status: 'enrolled', paymentStatus: 'partial_payment' },
  ];
  const amySeats: SeatFix[] = [
    { id: 612, childName: 'Juliette misso', currentPaid: 91056, nextPaid: 33056, listCents: 150000, status: 'enrolled', paymentStatus: 'partial_payment' },
    { id: 613, childName: 'Eden misso', currentPaid: 91055, nextPaid: 33055, listCents: 150000, status: 'enrolled', paymentStatus: 'partial_payment' },
    { id: 614, childName: 'Theodore Misso', currentPaid: 91055, nextPaid: 33055, listCents: 150000, status: 'enrolled', paymentStatus: 'partial_payment' },
  ];
  const alannaSeats: SeatFix[] = [
    { id: 865, childName: 'Blaire Thomas', currentPaid: 117938, nextPaid: 59438, listCents: 150000, status: 'enrolled', paymentStatus: 'partial_payment' },
    { id: 866, childName: 'Hailey Thomas', currentPaid: 117937, nextPaid: 59437, listCents: 150000, status: 'enrolled', paymentStatus: 'partial_payment' },
  ];
  const jenniferSeats: SeatFix[] = [
    { id: 1060, childName: 'Amelia Campbell', currentPaid: 65000, nextPaid: 0, listCents: 150000, status: 'pending_payment', paymentStatus: 'pending' },
    { id: 1061, childName: 'Amaya Campbell', currentPaid: 65000, nextPaid: 0, listCents: 150000, status: 'pending_payment', paymentStatus: 'pending' },
  ];

  await assertParent(db, 66, 'gciciotti29@gmail.com');
  await assertParent(db, 128, 'yetter.j8@gmail.com');
  await assertParent(db, 91, 'amym151@gmail.com');
  await assertParent(db, 70, 'atierson2@gmail.com');

  await assertSeats(db, 66, graceSeats);
  await assertSeats(db, 128, jenniferSeats);
  await assertSeats(db, 91, amySeats);
  await assertSeats(db, 70, alannaSeats);

  const [sp800] = await db.select().from(scheduledPayments).where(eq(scheduledPayments.id, 800)).limit(1);
  if (!sp800 || sp800.parentId !== 66 || sp800.amount !== 33250 || sp800.installmentNumber !== 2) {
    throw new Error(`SP #800 is not Grace installment 2 for $332.50`);
  }
  if (sp800.status === 'processing') {
    if (sp800.chargedBy !== 'parent_manual' || sp800.stripePaymentIntentId !== 'pi_3UH4LsGhVuNOnUs70zbYoVxX') {
      throw new Error(`SP #800 processing row is not the abandoned Pay Now PI`);
    }
  } else if (sp800.status !== 'pending' || sp800.stripePaymentIntentId) {
    throw new Error(`SP #800 status=${sp800.status} pi=${sp800.stripePaymentIntentId}`);
  }

  const abandoned = await stripe.paymentIntents.retrieve('pi_3UH4LsGhVuNOnUs70zbYoVxX');
  if (abandoned.amount !== 33250) throw new Error(`Abandoned PI amount ${abandoned.amount}`);
  if (!['requires_payment_method', 'canceled'].includes(abandoned.status)) {
    throw new Error(`Refusing to cancel pi_3UH4Ls in status ${abandoned.status}`);
  }
  if ((abandoned.amount_received ?? 0) !== 0) {
    throw new Error(`pi_3UH4Ls already received ${abandoned.amount_received}`);
  }

  const inst1 = await stripe.paymentIntents.retrieve('pi_3U6bURGhVuNOnUs70ehA46v8');
  const inst3 = await stripe.paymentIntents.retrieve('pi_3UH7joGhVuNOnUs70CbUj6s7');
  if (inst1.status !== 'succeeded' || inst1.amount !== 33250) throw new Error('Grace installment 1 mismatch');
  if (inst3.status !== 'succeeded' || inst3.amount !== 33250) throw new Error('Grace installment 3 mismatch');

  const creditRows = await db.select().from(credits).where(inArray(credits.id, [81, 82]));
  if (creditRows.length !== 2) throw new Error('Expected credits #81 and #82');
  for (const credit of creditRows) {
    if (credit.userId !== 128 || credit.creditAmountCents !== 65000 || (credit.usedAmountCents ?? 0) !== 0) {
      throw new Error(`Credit #${credit.id} is not an unused $650 Jennifer credit`);
    }
    if (credit.status !== 'approved' && credit.status !== 'revoked') {
      throw new Error(`Credit #${credit.id} status ${credit.status}`);
    }
    console.log(`  Credit #${credit.id} ${credit.status} ${dollars(credit.creditAmountCents)}`);
  }

  const families = [
    { parentId: 66, email: 'gciciotti29@gmail.com', seats: graceSeats },
    { parentId: 128, email: 'yetter.j8@gmail.com', seats: jenniferSeats },
    { parentId: 91, email: 'amym151@gmail.com', seats: amySeats },
    { parentId: 70, email: 'atierson2@gmail.com', seats: alannaSeats },
  ];
  for (const family of families) {
    const owed = family.seats.reduce((sum, seat) => sum + (seat.listCents - seat.nextPaid), 0);
    console.log(`\n${family.email} family owed after restore: ${dollars(owed)}`);
    for (const seat of family.seats) {
      console.log(
        `  #${seat.id} ${seat.childName}: ${dollars(seat.currentPaid)} → ${dollars(seat.nextPaid)} owed ${dollars(seat.listCents - seat.nextPaid)}`,
      );
    }
  }
  console.log(`\nSP #800 ${sp800.status} → pending; cancel ${abandoned.id} (${abandoned.status}, $0 received)`);

  if (DRY_RUN) {
    console.log('\nDRY RUN complete — no changes.');
    process.exit(0);
  }

  if (abandoned.status === 'requires_payment_method') {
    await stripe.paymentIntents.cancel('pi_3UH4LsGhVuNOnUs70zbYoVxX');
    console.log('Cancelled pi_3UH4Ls');
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const family of families) {
      for (const seat of family.seats) {
        const [row] = await tx
          .select()
          .from(programEnrollments)
          .where(eq(programEnrollments.id, seat.id))
          .limit(1);
        if (!row || (row.totalPaid ?? 0) !== seat.currentPaid) {
          throw new Error(`#${seat.id} paid changed before write (${row?.totalPaid})`);
        }
        const priorMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        await tx
          .update(programEnrollments)
          .set({
            totalPaid: seat.nextPaid,
            remainingBalance: seat.listCents - seat.nextPaid,
            paymentStatus: seat.paymentStatus,
            status: seat.status,
            metadata: {
              ...priorMeta,
              bootCreditRestampCleared: {
                script: SCRIPT,
                correctedAt: now.toISOString(),
                previousTotalPaidCents: seat.currentPaid,
                nextTotalPaidCents: seat.nextPaid,
              },
            },
            updatedAt: now,
          })
          .where(and(eq(programEnrollments.id, seat.id), eq(programEnrollments.parentId, family.parentId)));
      }
      await tx.insert(auditLogs).values({
        actionType: 'admin_balance_correction',
        severity: 'info',
        actorRole: 'script',
        actorEmail: 'ops-script',
        targetType: 'user',
        targetId: String(family.parentId),
        schoolId: SCHOOL_ID,
        metadata: {
          script: SCRIPT,
          parentEmail: family.email,
          seats: family.seats.map((seat) => ({
            id: seat.id,
            previousPaidCents: seat.currentPaid,
            nextPaidCents: seat.nextPaid,
          })),
        },
      });
    }

    if (sp800.status === 'processing') {
      await tx
        .update(scheduledPayments)
        .set({
          status: 'pending',
          chargedBy: null,
          stripePaymentIntentId: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(scheduledPayments.id, 800),
            eq(scheduledPayments.parentId, 66),
            eq(scheduledPayments.status, 'processing'),
          ),
        );
    }

    for (const credit of creditRows) {
      if (credit.status === 'revoked') continue;
      await tx
        .update(credits)
        .set({
          status: 'revoked',
          rejectionReason:
            'Created from phantom Fall paid that the boot credit repair copied off Spring credit #58. No Fall card charge.',
          updatedAt: now,
        })
        .where(and(eq(credits.id, credit.id), eq(credits.userId, 128), eq(credits.status, 'approved')));
    }
  });

  console.log('\nDONE');
  process.exit(0);
}

async function assertParent(db: Awaited<ReturnType<typeof getDb>>, id: number, email: string) {
  const [parent] = await db!.select().from(users).where(eq(users.id, id)).limit(1);
  if (!parent || parent.email?.toLowerCase() !== email) {
    throw new Error(`Expected parent #${id} ${email}, got ${parent?.email}`);
  }
}

async function assertSeats(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, parentId: number, seats: SeatFix[]) {
  const rows = await db
    .select()
    .from(programEnrollments)
    .where(inArray(programEnrollments.id, seats.map((seat) => seat.id)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const seat of seats) {
    const row = byId.get(seat.id);
    if (!row || row.parentId !== parentId || row.childName !== seat.childName) {
      throw new Error(`Seat #${seat.id} is not ${seat.childName} for parent ${parentId}`);
    }
    if ((row.totalCost ?? 0) !== seat.listCents) {
      throw new Error(`#${seat.id} total_cost=${row.totalCost}`);
    }
    const paid = row.totalPaid ?? 0;
    if (paid !== seat.currentPaid && paid !== seat.nextPaid) {
      throw new Error(`#${seat.id} total_paid=${paid}, expected ${seat.currentPaid} or already ${seat.nextPaid}`);
    }
    if (paid === seat.nextPaid) {
      seat.currentPaid = seat.nextPaid;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
