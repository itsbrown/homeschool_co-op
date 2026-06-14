/**
 * Production: apply $125 membership from checkout PI for Zoryana Tsygyrlash.
 * Removes orphan child profile #197 ("E T") created during registration.
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-zoryana-membership-checkout-production.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/apply-zoryana-membership-checkout-production.ts
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  auditLogs,
  children,
  membershipEnrollments,
  schoolStudents,
  users,
} from '../../shared/schema';

const PARENT_ID = 175;
const PARENT_EMAIL = 'smikhzoryana@gmail.com';
const MEMBERSHIP_ID = 419;
const ORPHAN_CHILD_ID = 197;
const STRIPE_PI = 'pi_3Te2akGhVuNOnUs71jPQxrxo';
const STRIPE_CUSTOMER = 'cus_Ucuyb2aajWPjFr';
const MEMBERSHIP_CENTS = 12500;

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = await getDb();

  const [membership] = await db
    .select()
    .from(membershipEnrollments)
    .where(eq(membershipEnrollments.id, MEMBERSHIP_ID))
    .limit(1);

  if (!membership || membership.parentUserId !== PARENT_ID) {
    throw new Error(`Membership #${MEMBERSHIP_ID} not found for parent ${PARENT_ID}`);
  }

  const [parent] = await db
    .select()
    .from(users)
    .where(eq(users.id, PARENT_ID))
    .limit(1);

  if (!parent || parent.email !== PARENT_EMAIL) {
    throw new Error(`Parent mismatch for id ${PARENT_ID}`);
  }

  const [orphanChild] = await db
    .select()
    .from(children)
    .where(eq(children.id, ORPHAN_CHILD_ID))
    .limit(1);

  const [orphanSchoolStudent] = await db
    .select()
    .from(schoolStudents)
    .where(eq(schoolStudents.childId, ORPHAN_CHILD_ID))
    .limit(1);

  console.log('Before membership:', {
    id: membership.id,
    status: membership.status,
    amount: membership.amount,
    amountPaid: membership.amountPaid,
    remainingBalance: membership.remainingBalance,
    notes: membership.notes,
  });

  if (
    membership.status === 'enrolled' &&
    (membership.amountPaid ?? 0) >= MEMBERSHIP_CENTS &&
    (membership.remainingBalance ?? 0) <= 0
  ) {
    console.log('Membership already paid in full — skipping membership update.');
  } else if (DRY_RUN) {
    console.log('DRY RUN would update membership #419 → enrolled, amount_paid $125');
  } else {
    await db
      .update(membershipEnrollments)
      .set({
        amountPaid: MEMBERSHIP_CENTS,
        remainingBalance: 0,
        balanceDue: 0,
        status: 'enrolled',
        stripeCustomerId: STRIPE_CUSTOMER,
        notes: `Membership paid via cart checkout (${STRIPE_PI}) — ledger correction`,
        updatedAt: new Date(),
      })
      .where(eq(membershipEnrollments.id, MEMBERSHIP_ID));

    await db.insert(auditLogs).values({
      actionType: 'admin_balance_correction',
      severity: 'info',
      actorId: null,
      actorEmail: 'system-script',
      targetType: 'membership_enrollment',
      targetId: String(MEMBERSHIP_ID),
      metadata: {
        script: 'apply-zoryana-membership-checkout-production.ts',
        parentId: PARENT_ID,
        stripePaymentIntentId: STRIPE_PI,
        amountCents: MEMBERSHIP_CENTS,
      },
    });

    console.log('Updated membership #419 → enrolled, $125 paid');
  }

  if (!parent.stripeCustomerId) {
    if (DRY_RUN) {
      console.log(`DRY RUN would set users.stripe_customer_id = ${STRIPE_CUSTOMER}`);
    } else {
      await db
        .update(users)
        .set({ stripeCustomerId: STRIPE_CUSTOMER, updatedAt: new Date() })
        .where(eq(users.id, PARENT_ID));
      console.log(`Linked Stripe customer ${STRIPE_CUSTOMER} on parent #${PARENT_ID}`);
    }
  }

  if (!orphanChild) {
    console.log(`Orphan child #${ORPHAN_CHILD_ID} not found — skip cleanup.`);
  } else {
    console.log('Orphan child to remove:', {
      id: orphanChild.id,
      name: `${orphanChild.firstName} ${orphanChild.lastName}`,
      createdAt: orphanChild.createdAt,
      schoolStudentId: orphanSchoolStudent?.id ?? null,
    });

    if (DRY_RUN) {
      console.log(
        `DRY RUN would delete school_students #${orphanSchoolStudent?.id ?? 'n/a'} and child #${ORPHAN_CHILD_ID}`,
      );
    } else {
      if (orphanSchoolStudent) {
        await db.delete(schoolStudents).where(eq(schoolStudents.id, orphanSchoolStudent.id));
        console.log(`Deleted school_students #${orphanSchoolStudent.id}`);
      }
      await db.delete(children).where(eq(children.id, ORPHAN_CHILD_ID));
      console.log(`Deleted orphan child #${ORPHAN_CHILD_ID}`);
    }
  }

  if (!DRY_RUN) {
    const [after] = await db
      .select()
      .from(membershipEnrollments)
      .where(eq(membershipEnrollments.id, MEMBERSHIP_ID))
      .limit(1);
    console.log('After membership:', {
      status: after?.status,
      amountPaid: after?.amountPaid,
      remainingBalance: after?.remainingBalance,
    });
  }

  console.log(DRY_RUN ? 'DRY RUN complete.' : 'Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
