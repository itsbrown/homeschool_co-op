/**
 * Marks membership as enrolled + fully paid for parents who already paid more than
 * $175 via class totals, completed payments, or completed scheduled installments,
 * but do not have an active paid membership for the current or next calendar year.
 *
 * Default is dry-run. Requires --execute to write.
 *
 *   npx tsx server/scripts/backfill-membership-paid-heavy-payers.ts --dry-run
 *   npx tsx server/scripts/backfill-membership-paid-heavy-payers.ts --execute
 *   npx tsx server/scripts/backfill-membership-paid-heavy-payers.ts --execute --school-id=2
 */

import { and, eq, gt, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { generateMemberId } from '../utils/membership';
import {
  schools,
  programEnrollments,
  scheduledPayments,
  payments,
  membershipEnrollments,
} from '../../shared/schema';

const THRESHOLD_CENTS = 17500; // $175.00

function parseArgs(argv: string[]) {
  let execute = false;
  let dryRun = true;
  let schoolId: number | undefined;
  for (const a of argv) {
    if (a === '--execute') {
      execute = true;
      dryRun = false;
    }
    if (a === '--dry-run') {
      dryRun = true;
      execute = false;
    }
    const m = a.match(/^--school-id=(\d+)$/);
    if (m) schoolId = parseInt(m[1], 10);
  }
  return { execute, dryRun, schoolId };
}

function computeSchoolTermDates(
  school: {
    membershipRenewalMonth: number | null;
    membershipRenewalDay: number | null;
    membershipGracePeriodDays: number | null;
  },
  membershipYear: number,
) {
  const renewalMonth = school.membershipRenewalMonth ?? 9;
  const renewalDay = school.membershipRenewalDay ?? 1;
  const gracePeriodDays = school.membershipGracePeriodDays ?? 30;
  const dueDate = new Date(membershipYear, renewalMonth - 1, renewalDay);
  const expirationDate = new Date(membershipYear + 1, renewalMonth - 1, renewalDay);
  const gracePeriodEnd = new Date(expirationDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
  return { dueDate, expirationDate, gracePeriodEnd, endDate: expirationDate };
}

function appendBackfillNote(existing: string | null | undefined, runId: string): string {
  const tag = `[backfill-membership-paid-heavy-payers ${runId}] Set enrolled + paid (>${THRESHOLD_CENTS / 100} USD class/payment activity).`;
  const base = (existing || '').trim();
  return base ? `${base}\n${tag}` : tag;
}

function membershipTermEndMs(me: {
  expirationDate: Date | string;
  gracePeriodEnd: Date | string | null;
}): number {
  const exp = new Date(me.expirationDate).getTime();
  if (me.gracePeriodEnd) {
    const g = new Date(me.gracePeriodEnd).getTime();
    return Math.max(exp, g);
  }
  return exp;
}

async function hasValidActivePaidMembership(
  db: Awaited<ReturnType<typeof getDb>>,
  parentUserId: number,
  schoolId: number,
  y0: number,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(membershipEnrollments)
    .where(
      and(
        eq(membershipEnrollments.parentUserId, parentUserId),
        eq(membershipEnrollments.schoolId, schoolId),
        inArray(membershipEnrollments.membershipYear, [y0, y0 + 1]),
      ),
    );

  const now = Date.now();
  for (const me of rows) {
    if (now > membershipTermEndMs(me)) continue;
    const rb = me.remainingBalance ?? 0;
    if (me.status === 'enrolled' || me.status === 'grace_period' || rb <= 0) {
      return true;
    }
  }
  return false;
}

async function collectCandidates(
  db: Awaited<ReturnType<typeof getDb>>,
  reqSchoolIds: number[],
  schoolFilter?: number,
): Promise<{ parentId: number; schoolId: number }[]> {
  const reqSet = new Set(reqSchoolIds);
  const key = (p: number, s: number) => `${p}:${s}`;
  const out = new Map<string, { parentId: number; schoolId: number }>();

  const add = (parentId: number | null, schoolId: number | null) => {
    if (parentId == null || schoolId == null) return;
    if (!reqSet.has(schoolId)) return;
    if (schoolFilter != null && schoolId !== schoolFilter) return;
    out.set(key(parentId, schoolId), { parentId, schoolId });
  };

  if (reqSchoolIds.length === 0) return [];

  const spRows = await db
    .selectDistinct({
      parentId: scheduledPayments.parentId,
      schoolId: scheduledPayments.schoolId,
    })
    .from(scheduledPayments)
    .where(
      and(
        eq(scheduledPayments.status, 'completed'),
        gt(scheduledPayments.amount, THRESHOLD_CENTS),
        inArray(scheduledPayments.schoolId, reqSchoolIds),
      ),
    );
  for (const r of spRows) add(r.parentId, r.schoolId);

  const payRows = await db
    .selectDistinct({
      parentId: payments.parentId,
      schoolId: payments.schoolId,
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'completed'),
        gt(payments.amount, THRESHOLD_CENTS),
        isNotNull(payments.parentId),
        inArray(payments.schoolId, reqSchoolIds),
      ),
    );
  for (const r of payRows) add(r.parentId, r.schoolId);

  const aggRows = await db
    .select({
      parentId: programEnrollments.parentId,
      schoolId: programEnrollments.schoolId,
      totalPaid: sql<string>`sum(${programEnrollments.totalPaid})`,
    })
    .from(programEnrollments)
    .where(
      and(
        notInArray(programEnrollments.status, ['cancelled', 'withdrawn', 'failed']),
        inArray(programEnrollments.schoolId, reqSchoolIds),
      ),
    )
    .groupBy(programEnrollments.parentId, programEnrollments.schoolId);

  for (const r of aggRows) {
    if (Number(r.totalPaid) > THRESHOLD_CENTS) add(r.parentId, r.schoolId);
  }

  return [...out.values()].sort((a, b) =>
    a.schoolId !== b.schoolId ? a.schoolId - b.schoolId : a.parentId - b.parentId,
  );
}

async function ensureMemberId(parentUserId: number, dryRun: boolean) {
  const user = await storage.getUser(parentUserId);
  if (!user) return;
  const mid = user.memberId?.trim();
  if (mid) return;
  const newId = generateMemberId();
  console.log(`   … would assign memberId ${newId} to user ${parentUserId}`);
  if (!dryRun) {
    await storage.updateUser(parentUserId, { memberId: newId });
  }
}

async function main() {
  const { execute, dryRun, schoolId } = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().slice(0, 19);

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log(
    dryRun
      ? '🔎 DRY RUN — no database writes (pass --execute to apply)\n'
      : '⚠️  EXECUTE — applying updates\n',
  );
  if (schoolId != null) console.log(`   School filter: ${schoolId}\n`);

  const db = await getDb();
  const y0 = new Date().getFullYear();

  const reqSchoolRows = await db
    .select({ id: schools.id })
    .from(schools)
    .where(
      sql`COALESCE(${schools.membershipRequired}, true) = true AND COALESCE(${schools.membershipFeeAmount}, 0) > 0`,
    );
  const reqSchoolIds = reqSchoolRows.map((r) => r.id);
  const candidates = await collectCandidates(db, reqSchoolIds, schoolId);

  let wouldUpdate = 0;
  let wouldCreate = 0;
  let skippedOk = 0;

  for (const { parentId, schoolId: sid } of candidates) {
    if (await hasValidActivePaidMembership(db, parentId, sid, y0)) {
      skippedOk++;
      continue;
    }

    const school = await storage.getSchool(sid);
    if (!school) continue;
    const fee = school.membershipFeeAmount ?? THRESHOLD_CENTS;
    if (fee <= 0) continue;

    const rowY0 = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(parentId, sid, y0);
    const rowY1 = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(parentId, sid, y0 + 1);
    const target = rowY0 ?? rowY1;

    await ensureMemberId(parentId, dryRun);

    if (target) {
      const amountCents = Math.max(target.amount ?? 0, fee);
      const now = new Date();
      const termEndMs = membershipTermEndMs(target);
      const keepTermDates =
        target.status === 'pending_payment' && termEndMs > now.getTime() && target.expirationDate;

      const dates = keepTermDates
        ? {
            dueDate: target.dueDate,
            expirationDate: target.expirationDate,
            gracePeriodEnd: target.gracePeriodEnd,
            endDate: target.endDate,
            renewalDate: target.renewalDate ?? target.expirationDate,
          }
        : (() => {
            const d = computeSchoolTermDates(school, target.membershipYear);
            return {
              dueDate: d.dueDate,
              expirationDate: d.expirationDate,
              gracePeriodEnd: d.gracePeriodEnd,
              endDate: d.endDate,
              renewalDate: d.expirationDate,
            };
          })();

      const startDate = target.startDate && new Date(target.startDate) <= now ? target.startDate : now;

      console.log(
        `${dryRun ? '[dry-run]' : '[apply]'} parent ${parentId} school ${sid} membership id ${target.id} year ${target.membershipYear} → enrolled, paid ${amountCents}c`,
      );

      if (!dryRun) {
        await storage.updateMembershipEnrollment(target.id, {
          status: 'enrolled',
          amount: amountCents,
          amountPaid: amountCents,
          remainingBalance: 0,
          balanceDue: 0,
          totalAmount: amountCents,
          paymentMethod: 'other',
          startDate,
          ...dates,
          notes: appendBackfillNote(target.notes ?? undefined, runId),
        });
      }
      wouldUpdate++;
    } else {
      const d = computeSchoolTermDates(school, y0);
      console.log(
        `${dryRun ? '[dry-run]' : '[apply]'} parent ${parentId} school ${sid} → CREATE membership year ${y0} enrolled, paid ${fee}c`,
      );
      if (!dryRun) {
        await storage.createMembershipEnrollment({
          schoolId: sid,
          parentUserId: parentId,
          membershipYear: y0,
          membershipTier: 'basic',
          amount: fee,
          amountPaid: fee,
          remainingBalance: 0,
          totalAmount: fee,
          balanceDue: 0,
          status: 'enrolled',
          dueDate: d.dueDate,
          expirationDate: d.expirationDate,
          gracePeriodEnd: d.gracePeriodEnd,
          endDate: d.endDate,
          startDate: new Date(),
          renewalDate: d.expirationDate,
          paymentMethod: 'other',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          notes: appendBackfillNote(null, runId),
        });
      }
      wouldCreate++;
    }
  }

  console.log('\n--- summary ---');
  console.log(`Candidates considered: ${candidates.length}`);
  console.log(`Skipped (already valid membership): ${skippedOk}`);
  console.log(`Membership rows ${dryRun ? 'to update' : 'updated'}: ${wouldUpdate}`);
  console.log(`Membership rows ${dryRun ? 'to create' : 'created'}: ${wouldCreate}`);
  if (dryRun) console.log('\nRe-run with --execute after review.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
