/**
 * Audit Spring owing parents: real balance, billing-summary visibility, pay paths.
 * Optionally repair missing pending scheduled payments (Pay Now + pay-in-full support).
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/audit-spring-pay-readiness.ts
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/audit-spring-pay-readiness.ts --apply
 */

import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { programEnrollments, scheduledPayments } from '../../shared/schema';
import { storage } from '../storage';
import { getChildrenForAuthenticatedParent, resolveParentDbUser } from '../lib/parent-auth-scope';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';
import { resolveEnrollmentOutstandingCents } from '../lib/enrollment-balance';

const SPRING_PARENT_EMAILS = [
  'denisedotres@gmail.com',
  'sleary212@yahoo.com',
  'ninaresser@yahoo.com',
  'karnatht07@gmail.com',
  'yetter.j8@gmail.com',
  'yates.stephaniej@gmail.com',
  'atierson2@gmail.com',
  'beigel.shaley@gmail.com',
  'odragoleaf@aol.com',
  'readytorespond316@gmail.com',
  'tiffanykarnath@yahoo.com',
  'hlcelso@mail.naz.edu',
];

const APPLY = process.argv.includes('--apply');

type EnrAudit = {
  id: number;
  child: string;
  className: string;
  dbBalanceCents: number;
  inBillingSummary: boolean;
  billingExcludedReason?: string;
  actionableSp: number;
  payNowOk: boolean;
  payInFullOk: boolean;
  repaired?: string;
};

type ParentAudit = {
  email: string;
  parentId: number | null;
  name: string;
  billingTotalCents: number;
  dbSpringOwingCents: number;
  enrollments: EnrAudit[];
  allOk: boolean;
};

async function simulateBillingSummary(email: string) {
  const parent = await resolveParentDbUser(storage, { email });
  const children = await getChildrenForAuthenticatedParent(storage, { email });
  if (!parent || children.length === 0) {
    return { parent, totalBalance: 0, details: [] as Array<{ enrollmentId: number; balance: number }> };
  }

  let totalBalance = 0;
  const details: Array<{ enrollmentId: number; balance: number; included: boolean; reason?: string }> = [];

  for (const child of children) {
    const rows = await storage.getEnrollmentsByChildId(child.id);
    for (const enrollment of rows) {
      const childMatch = children.find((c) => c.id === enrollment.childId);
      const balance = resolveEnrollmentEffectiveBalance(enrollment);
      if (!childMatch) {
        details.push({ enrollmentId: enrollment.id, balance, included: false, reason: 'child id mismatch' });
        continue;
      }
      details.push({ enrollmentId: enrollment.id, balance, included: true });
      if (balance > 0) totalBalance += balance;
    }
  }

  return { parent, totalBalance, details };
}

async function countActionableSp(enrollmentId: number): Promise<number> {
  const rows = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
  return rows.filter((sp) =>
    ['pending', 'failed', 'overdue', 'processing'].includes(String(sp.status).toLowerCase()),
  ).length;
}

async function repairEnrollment(enrollmentId: number): Promise<string | null> {
  const db = await getDb();
  const [enrollment] = await db!
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, enrollmentId))
    .limit(1);
  if (!enrollment) return null;

  const outstanding = resolveEnrollmentOutstandingCents(enrollment);
  if (outstanding <= 0) return 'skip-zero-balance';

  const existing = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
  const actionable = existing.filter((sp) =>
    ['pending', 'failed', 'overdue', 'processing'].includes(String(sp.status).toLowerCase()),
  );
  if (actionable.length > 0) return 'skip-has-actionable-sp';

  const cancelledMatch = existing.find(
    (sp) =>
      sp.status === 'cancelled' &&
      sp.amount === outstanding &&
      sp.installmentNumber === 1 &&
      sp.totalInstallments === 1,
  );

  if (!APPLY) {
    return cancelledMatch
      ? `dry-run-reactivate-sp-${cancelledMatch.id}`
      : `dry-run-create-sp-$${(outstanding / 100).toFixed(2)}`;
  }

  const parent = await storage.getUser(enrollment.parentId);
  if (!parent?.email) return 'skip-no-parent-email';

  if (cancelledMatch) {
    await db!
      .update(scheduledPayments)
      .set({
        status: 'pending',
        chargedBy: null,
        stripePaymentIntentId: null,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(scheduledPayments.id, cancelledMatch.id));
    return `reactivated-sp-${cancelledMatch.id}`;
  }

  await storage.createScheduledPayment({
    schoolId: enrollment.schoolId ?? 2,
    enrollmentId,
    parentId: enrollment.parentId,
    parentEmail: parent.email,
    amount: outstanding,
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
      enrollmentIds: [enrollmentId],
      paymentPlan: enrollment.paymentPlan || 'biweekly',
      description: 'Remaining Spring 2026 balance',
      repairedAt: new Date().toISOString(),
      checkoutPaymentIntentId: 'audit-spring-pay-readiness',
    },
  });

  await db!
    .update(programEnrollments)
    .set({ paymentStatus: 'partial_payment', updatedAt: new Date() })
    .where(eq(programEnrollments.id, enrollmentId));

  return `created-sp-$${(outstanding / 100).toFixed(2)}`;
}

async function auditParent(email: string): Promise<ParentAudit> {
  const db = await getDb();
  const springRows = await db!.execute(sql`
    SELECT pe.id, pe.child_name, pe.class_name,
      GREATEST(0, pe.total_cost - pe.total_paid - COALESCE(pe.comp_amount_cents, 0)) AS balance_cents
    FROM program_enrollments pe
    WHERE lower(pe.parent_email) = lower(${email})
      AND pe.status = 'enrolled'
      AND pe.school_id = 2
      AND pe.created_at >= '2026-01-01'
      AND pe.class_name LIKE '%|%'
      AND GREATEST(0, pe.total_cost - pe.total_paid - COALESCE(pe.comp_amount_cents, 0)) > 0
    ORDER BY pe.id
  `);

  const { parent, totalBalance, details } = await simulateBillingSummary(email);
  const detailMap = new Map(details.map((d) => [d.enrollmentId, d]));

  const enrollments: EnrAudit[] = [];
  let dbSpringOwing = 0;

  for (const row of springRows as Array<{
    id: number;
    child_name: string;
    class_name: string;
    balance_cents: number;
  }>) {
    dbSpringOwing += Number(row.balance_cents);
    const d = detailMap.get(row.id);
    const inSummary = d?.included === true && (d.balance ?? 0) > 0;
    const actionableSp = await countActionableSp(row.id);
    const payNowOk = actionableSp > 0;
    const payInFullOk = inSummary && (d?.balance ?? 0) > 0;

    let repaired: string | undefined;
    if (!payNowOk && Number(row.balance_cents) > 0) {
      const repairResult = await repairEnrollment(row.id);
      if (repairResult && !repairResult.startsWith('skip')) {
        repaired = repairResult;
      }
    }

    enrollments.push({
      id: row.id,
      child: row.child_name,
      className: row.class_name,
      dbBalanceCents: Number(row.balance_cents),
      inBillingSummary: inSummary,
      billingExcludedReason: d && !d.included ? d.reason : undefined,
      actionableSp: repaired?.includes('reactivated') || repaired?.includes('created')
        ? 1
        : actionableSp,
      payNowOk: payNowOk || !!repaired,
      payInFullOk,
      repaired,
    });
  }

  const allOk =
    enrollments.length > 0 &&
    enrollments.every((e) => e.payInFullOk && e.payNowOk) &&
    Math.abs(totalBalance - dbSpringOwing) <= 1;

  return {
    email,
    parentId: parent?.id ?? null,
    name: parent ? `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.trim() : '',
    billingTotalCents: totalBalance,
    dbSpringOwingCents: dbSpringOwing,
    enrollments,
    allOk,
  };
}

async function main() {
  console.log(`Spring pay readiness audit (${APPLY ? 'APPLY' : 'AUDIT ONLY'})\n`);
  const results: ParentAudit[] = [];

  for (const email of SPRING_PARENT_EMAILS) {
    const r = await auditParent(email);
    results.push(r);
  }

  for (const r of results) {
    if (r.enrollments.length === 0) {
      console.log(`\n${r.email} — no enrolled Spring campus balance (skip)`);
      continue;
    }
    console.log(`\n${'='.repeat(72)}`);
    console.log(`${r.name} <${r.email}> parent#${r.parentId}`);
    console.log(
      `DB Spring owed: $${(r.dbSpringOwingCents / 100).toFixed(2)} | Billing summary: $${(r.billingTotalCents / 100).toFixed(2)} | ${r.allOk ? 'OK' : 'NEEDS ATTENTION'}`,
    );
    for (const e of r.enrollments) {
      console.log(
        `  enr#${e.id} ${e.child} $${(e.dbBalanceCents / 100).toFixed(2)} | UI balance: ${e.inBillingSummary ? 'yes' : 'NO'} | Pay Now: ${e.payNowOk ? 'yes' : 'NO'} | Pay in full: ${e.payInFullOk ? 'yes' : 'NO'}${e.repaired ? ` | ${e.repaired}` : ''}${e.billingExcludedReason ? ` (${e.billingExcludedReason})` : ''}`,
      );
    }
  }

  const needing = results.filter((r) => r.enrollments.length > 0 && !r.allOk);
  console.log(`\n${'='.repeat(72)}`);
  console.log(`Parents with Spring balance: ${results.filter((r) => r.enrollments.length > 0).length}`);
  console.log(`All clear: ${results.filter((r) => r.enrollments.length > 0 && r.allOk).length}`);
  console.log(`Still need attention: ${needing.length}`);
  if (needing.length > 0) {
    for (const r of needing) {
      console.log(`  - ${r.email}`);
    }
  }
  if (!APPLY && needing.length > 0) {
    console.log('\nRe-run with --apply to create/reactivate pending scheduled payments.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
