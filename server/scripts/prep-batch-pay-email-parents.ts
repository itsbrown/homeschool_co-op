/**
 * Pre-email prep: link Stripe customers + Winter pending rows for pay-path gaps.
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/prep-batch-pay-email-parents.ts
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users, programEnrollments } from '../../shared/schema';
import { storage } from '../storage';

async function main() {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');

  for (const [id, cus] of [
    [12, 'cus_T5zdT56Fiywzmh'],
    [128, 'cus_UGe8qH2tVdJW3X'],
    [109, 'cus_TuFTsCangRiJAk'],
  ] as const) {
    await db
      .update(users)
      .set({ stripeCustomerId: cus, updatedAt: new Date() })
      .where(eq(users.id, id));
    console.log(`Linked user ${id} → ${cus}`);
  }

  for (const row of [
    { enr: 177, parentId: 42, email: 'readytorespond316@gmail.com', amount: 48750 },
    { enr: 333, parentId: 109, email: 'odragoleaf@aol.com', amount: 27500 },
  ]) {
    const [enrollment] = await db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, row.enr))
      .limit(1);
    if (!enrollment) continue;

    const existing = await storage.getScheduledPaymentsByEnrollmentId(row.enr);
    if (existing.some((sp) => sp.status === 'pending')) {
      console.log(`Enrollment ${row.enr} already has pending SP — skip`);
      continue;
    }

    await storage.createScheduledPayment({
      schoolId: enrollment.schoolId,
      enrollmentId: row.enr,
      parentId: row.parentId,
      parentEmail: row.email,
      amount: row.amount,
      currency: 'usd',
      scheduledDate: new Date(),
      frequency: 'one_time',
      installmentNumber: 1,
      totalInstallments: 1,
      status: 'pending',
      stripePaymentIntentId: null,
      processedAt: null,
      failureReason: null,
      retryCount: 0,
      metadata: {
        enrollmentIds: [row.enr],
        paymentPlan: enrollment.paymentPlan || 'biweekly',
        description: 'Remaining balance — pay now',
        repairedAt: new Date().toISOString(),
        checkoutPaymentIntentId: 'prep-batch-pay-email-parents',
      },
    });
    console.log(`Created pending SP for enrollment ${row.enr} ($${(row.amount / 100).toFixed(2)})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
