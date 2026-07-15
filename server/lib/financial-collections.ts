import { and, desc, eq, gte, inArray, lte, not, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { membershipEnrollments, programEnrollments, scheduledPayments, users } from '@shared/schema';
import {
  sqlEnrollmentEffectiveBalanceColumn,
  sqlEnrollmentEffectiveBalancePositive,
} from './enrollment-balance';

const MEMBERSHIP_OWED_STATUSES = ['pending_payment', 'grace_period'] as const;

export type OutstandingBalanceRow = {
  id: number;
  enrollmentId: number;
  parentId: number;
  parentEmail: string;
  amount: number;
  scheduledDate: string | Date | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  status: string;
  reminderCount: number | null;
  lastReminderSentAt: string | Date | null;
  type: 'scheduled' | 'unscheduled' | 'membership';
  parent: { id: number; name: string; email: string; phone: string | null } | null;
  enrollment: { id: number; childName: string | null; className: string | null } | null;
  membershipYear?: number | null;
  enrollmentRemainingBalance: number;
  isOverdue: boolean;
  daysOverdue: number;
};

export type CollectionFamilyRow = {
  parentId: number;
  parentEmail: string;
  parentName: string;
  phone: string | null;
  autoPayEnabled: boolean;
  tuitionOwedCents: number;
  membershipOwedCents: number;
  totalOwedCents: number;
  overdueTuitionCents: number;
  hasPaymentPlan: boolean;
  hasLatePayment: boolean;
  neverPaidTuition: boolean;
  owesMembership: boolean;
  enrollmentCount: number;
  enrollments: Array<{
    enrollmentId: number;
    childName: string | null;
    className: string | null;
    outstandingCents: number;
    totalPaid: number;
    totalCost: number;
    hasPaymentPlan: boolean;
    isLate: boolean;
    neverPaid: boolean;
  }>;
  memberships: Array<{
    id: number;
    membershipYear: number;
    balanceDueCents: number;
    status: string;
    dueDate: string | null;
  }>;
  tags: string[];
};

async function loadParentInfo(parentIds: number[]) {
  const map = new Map<number, { id: number; name: string; email: string; phone: string | null; autoPayEnabled: boolean }>();
  if (parentIds.length === 0) return map;

  const db = await getDb();
  const uniqueIds = [...new Set(parentIds)];
  // Select autoPayEnabled via drizzle — do not use db.execute(...).rows (postgres-js returns an array).
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      autoPayEnabled: users.autoPayEnabled,
    })
    .from(users)
    .where(inArray(users.id, uniqueIds));

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name || row.email,
      email: row.email,
      phone: row.phone ?? null,
      autoPayEnabled: Boolean(row.autoPayEnabled),
    });
  }
  return map;
}

/**
 * Enrollment-first outstanding balances (matches summary card totals).
 * Lists every enrollment with positive effective balance, with optional pending installments.
 */
export async function buildOutstandingBalanceRows(schoolId: number): Promise<{
  balances: OutstandingBalanceRow[];
  byFamily: Array<{
    parent: OutstandingBalanceRow['parent'];
    parentEmail: string;
    totalOutstandingCents: number;
    overdueAmountCents: number;
    payments: OutstandingBalanceRow[];
  }>;
  summary: {
    totalOutstandingCents: number;
    tuitionOutstandingCents: number;
    membershipOutstandingCents: number;
    overdueAmountCents: number;
    totalPaymentsDue: number;
    overduePayments: number;
    uniqueFamilies: number;
  };
}> {
  const db = await getDb();
  const now = new Date();

  const owingEnrollments = await db
    .select({
      id: programEnrollments.id,
      parentId: programEnrollments.parentId,
      parentEmail: programEnrollments.parentEmail,
      childName: programEnrollments.childName,
      className: programEnrollments.className,
      totalCost: programEnrollments.totalCost,
      totalPaid: programEnrollments.totalPaid,
      outstandingCents: sqlEnrollmentEffectiveBalanceColumn(),
    })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.schoolId, schoolId),
        not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
        sqlEnrollmentEffectiveBalancePositive(),
      ),
    );

  const pendingScheduled = await db
    .select({
      id: scheduledPayments.id,
      enrollmentId: scheduledPayments.enrollmentId,
      parentId: scheduledPayments.parentId,
      parentEmail: scheduledPayments.parentEmail,
      amount: scheduledPayments.amount,
      scheduledDate: scheduledPayments.scheduledDate,
      installmentNumber: scheduledPayments.installmentNumber,
      totalInstallments: scheduledPayments.totalInstallments,
      status: scheduledPayments.status,
      reminderCount: scheduledPayments.reminderCount,
      lastReminderSentAt: scheduledPayments.lastReminderSentAt,
    })
    .from(scheduledPayments)
    .where(and(eq(scheduledPayments.schoolId, schoolId), eq(scheduledPayments.status, 'pending')))
    .orderBy(scheduledPayments.scheduledDate);

  const pendingByEnrollment = new Map<number, typeof pendingScheduled>();
  for (const payment of pendingScheduled) {
    const list = pendingByEnrollment.get(payment.enrollmentId) ?? [];
    list.push(payment);
    pendingByEnrollment.set(payment.enrollmentId, list);
  }

  const membershipRows = await db
    .select({
      id: membershipEnrollments.id,
      parentUserId: membershipEnrollments.parentUserId,
      membershipYear: membershipEnrollments.membershipYear,
      balanceDue: membershipEnrollments.balanceDue,
      remainingBalance: membershipEnrollments.remainingBalance,
      status: membershipEnrollments.status,
      dueDate: membershipEnrollments.dueDate,
    })
    .from(membershipEnrollments)
    .where(
      and(
        eq(membershipEnrollments.schoolId, schoolId),
        inArray(membershipEnrollments.status, [...MEMBERSHIP_OWED_STATUSES]),
        sql`GREATEST(COALESCE(${membershipEnrollments.balanceDue}, 0), COALESCE(${membershipEnrollments.remainingBalance}, 0)) > 0`,
      ),
    );

  const parentIds = [
    ...owingEnrollments.map((e) => e.parentId),
    ...membershipRows.map((m) => m.parentUserId),
  ];
  const parentInfoMap = await loadParentInfo(parentIds);

  const validBalances: OutstandingBalanceRow[] = [];

  for (const enrollment of owingEnrollments) {
    const outstandingCents = Number(enrollment.outstandingCents) || 0;
    if (outstandingCents <= 0) continue;

    const parentInfo = parentInfoMap.get(enrollment.parentId) ?? null;
    const enrollmentInfo = {
      id: enrollment.id,
      childName: enrollment.childName || null,
      className: enrollment.className || null,
    };
    const pending = pendingByEnrollment.get(enrollment.id) ?? [];

    if (pending.length > 0) {
      for (const payment of pending) {
        const scheduledDate = payment.scheduledDate;
        const isOverdue = scheduledDate ? new Date(scheduledDate) < now : false;
        const daysOverdue = isOverdue && scheduledDate
          ? Math.floor((now.getTime() - new Date(scheduledDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        validBalances.push({
          id: payment.id,
          enrollmentId: enrollment.id,
          parentId: enrollment.parentId,
          parentEmail: enrollment.parentEmail,
          amount: payment.amount,
          scheduledDate,
          installmentNumber: payment.installmentNumber,
          totalInstallments: payment.totalInstallments,
          status: payment.status,
          reminderCount: payment.reminderCount,
          lastReminderSentAt: payment.lastReminderSentAt,
          type: 'scheduled',
          parent: parentInfo,
          enrollment: enrollmentInfo,
          enrollmentRemainingBalance: outstandingCents,
          isOverdue,
          daysOverdue,
        });
      }
    } else {
      validBalances.push({
        id: -enrollment.id,
        enrollmentId: enrollment.id,
        parentId: enrollment.parentId,
        parentEmail: enrollment.parentEmail,
        amount: outstandingCents,
        scheduledDate: null,
        installmentNumber: null,
        totalInstallments: null,
        status: 'unscheduled',
        reminderCount: null,
        lastReminderSentAt: null,
        type: 'unscheduled',
        parent: parentInfo,
        enrollment: enrollmentInfo,
        enrollmentRemainingBalance: outstandingCents,
        isOverdue: false,
        daysOverdue: 0,
      });
    }
  }

  for (const mem of membershipRows) {
    const balanceDueCents = Math.max(Number(mem.balanceDue ?? 0), Number(mem.remainingBalance ?? 0));
    if (balanceDueCents <= 0) continue;

    const parentInfo = parentInfoMap.get(mem.parentUserId) ?? null;
    const parentEmail = (parentInfo?.email || '').trim() || `parent-${mem.parentUserId}@unknown.local`;
    const dueDate = mem.dueDate;
    const isOverdue = dueDate ? new Date(dueDate) < now : false;
    const daysOverdue = isOverdue && dueDate
      ? Math.floor((now.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    validBalances.push({
      id: -1_000_000 - mem.id,
      enrollmentId: 0,
      parentId: mem.parentUserId,
      parentEmail,
      amount: balanceDueCents,
      scheduledDate: dueDate,
      installmentNumber: null,
      totalInstallments: null,
      status: mem.status,
      reminderCount: null,
      lastReminderSentAt: null,
      type: 'membership',
      parent: parentInfo,
      enrollment: {
        id: 0,
        childName: null,
        className: `Membership ${mem.membershipYear}`,
      },
      membershipYear: mem.membershipYear,
      enrollmentRemainingBalance: balanceDueCents,
      isOverdue,
      daysOverdue,
    });
  }

  type FamilyBalance = {
    parent: OutstandingBalanceRow['parent'];
    parentEmail: string;
    totalOutstandingCents: number;
    overdueAmountCents: number;
    payments: OutstandingBalanceRow[];
  };

  const byParent = validBalances.reduce((acc: Record<string, FamilyBalance>, balance) => {
    const email = balance.parentEmail;
    if (!acc[email]) {
      acc[email] = {
        parent: balance.parent,
        parentEmail: email,
        totalOutstandingCents: 0,
        overdueAmountCents: 0,
        payments: [],
      };
    }
    if (balance.isOverdue) {
      acc[email].overdueAmountCents += balance.amount;
    }
    acc[email].payments.push(balance);
    return acc;
  }, {});

  for (const family of Object.values(byParent)) {
    const seenEnrollments = new Set<number>();
    let totalOutstandingCents = 0;
    for (const balance of family.payments) {
      if (balance.type === 'membership') {
        totalOutstandingCents += balance.amount;
        continue;
      }
      if (seenEnrollments.has(balance.enrollmentId)) continue;
      seenEnrollments.add(balance.enrollmentId);
      totalOutstandingCents += balance.enrollmentRemainingBalance;
    }
    family.totalOutstandingCents = totalOutstandingCents;
  }

  const tuitionByEnrollment = new Map<number, number>();
  for (const enr of owingEnrollments) {
    tuitionByEnrollment.set(enr.id, Number(enr.outstandingCents) || 0);
  }

  const membershipOutstandingCents = membershipRows.reduce((sum, mem) => {
    const cents = Math.max(Number(mem.balanceDue ?? 0), Number(mem.remainingBalance ?? 0));
    return cents > 0 ? sum + cents : sum;
  }, 0);
  const tuitionOutstandingCents = [...tuitionByEnrollment.values()].reduce((s, v) => s + v, 0);

  const summary = {
    totalOutstandingCents: tuitionOutstandingCents + membershipOutstandingCents,
    tuitionOutstandingCents,
    membershipOutstandingCents,
    overdueAmountCents: validBalances.filter((b) => b.isOverdue).reduce((s, b) => s + b.amount, 0),
    totalPaymentsDue: validBalances.length,
    overduePayments: validBalances.filter((b) => b.isOverdue).length,
    uniqueFamilies: Object.keys(byParent).length,
  };

  return {
    balances: validBalances,
    byFamily: Object.values(byParent),
    summary,
  };
}

/** Family-level collections dashboard: who owes, plans, autopay, late, never paid, membership. */
export async function buildCollectionsOverview(schoolId: number): Promise<{
  families: CollectionFamilyRow[];
  summary: {
    familiesWithBalance: number;
    totalTuitionOwedCents: number;
    totalMembershipOwedCents: number;
    totalOwedCents: number;
    lateFamilies: number;
    noPaymentPlanFamilies: number;
    autoPayFamilies: number;
    neverPaidFamilies: number;
    membershipOwedFamilies: number;
  };
}> {
  const db = await getDb();
  const now = new Date();

  const owingEnrollments = await db
    .select({
      id: programEnrollments.id,
      parentId: programEnrollments.parentId,
      parentEmail: programEnrollments.parentEmail,
      childName: programEnrollments.childName,
      className: programEnrollments.className,
      totalCost: programEnrollments.totalCost,
      totalPaid: programEnrollments.totalPaid,
      outstandingCents: sqlEnrollmentEffectiveBalanceColumn(),
    })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.schoolId, schoolId),
        not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
        sqlEnrollmentEffectiveBalancePositive(),
      ),
    );

  const pendingScheduled = await db
    .select({
      enrollmentId: scheduledPayments.enrollmentId,
      scheduledDate: scheduledPayments.scheduledDate,
    })
    .from(scheduledPayments)
    .where(and(eq(scheduledPayments.schoolId, schoolId), eq(scheduledPayments.status, 'pending')));

  const enrollmentsWithPending = new Set(pendingScheduled.map((p) => p.enrollmentId));
  const lateEnrollmentIds = new Set(
    pendingScheduled
      .filter((p) => p.scheduledDate && new Date(p.scheduledDate) < now)
      .map((p) => p.enrollmentId),
  );

  const membershipRows = await db
    .select({
      id: membershipEnrollments.id,
      parentUserId: membershipEnrollments.parentUserId,
      membershipYear: membershipEnrollments.membershipYear,
      balanceDue: membershipEnrollments.balanceDue,
      remainingBalance: membershipEnrollments.remainingBalance,
      status: membershipEnrollments.status,
      dueDate: membershipEnrollments.dueDate,
    })
    .from(membershipEnrollments)
    .where(
      and(
        eq(membershipEnrollments.schoolId, schoolId),
        inArray(membershipEnrollments.status, [...MEMBERSHIP_OWED_STATUSES]),
        sql`GREATEST(COALESCE(${membershipEnrollments.balanceDue}, 0), COALESCE(${membershipEnrollments.remainingBalance}, 0)) > 0`,
      ),
    );

  const parentIds = [
    ...owingEnrollments.map((e) => e.parentId),
    ...membershipRows.map((m) => m.parentUserId),
  ];
  const parentInfoMap = await loadParentInfo(parentIds);

  const familyMap = new Map<string, CollectionFamilyRow>();

  const resolveParentEmail = (parentId: number, parentEmail?: string | null) => {
    const trimmed = (parentEmail || '').trim();
    if (trimmed) return trimmed;
    return (parentInfoMap.get(parentId)?.email || '').trim();
  };

  const familyKey = (parentId: number, parentEmail?: string | null) => {
    const email = resolveParentEmail(parentId, parentEmail);
    return email ? email.toLowerCase() : `parent-id:${parentId}`;
  };

  const ensureFamily = (parentId: number, parentEmail?: string | null) => {
    const key = familyKey(parentId, parentEmail);
    const resolvedEmail = resolveParentEmail(parentId, parentEmail) || `parent-${parentId}@unknown.local`;
    if (!familyMap.has(key)) {
      const info = parentInfoMap.get(parentId);
      familyMap.set(key, {
        parentId,
        parentEmail: resolvedEmail,
        parentName: info?.name ?? resolvedEmail,
        phone: info?.phone ?? null,
        autoPayEnabled: info?.autoPayEnabled ?? false,
        tuitionOwedCents: 0,
        membershipOwedCents: 0,
        totalOwedCents: 0,
        overdueTuitionCents: 0,
        hasPaymentPlan: false,
        hasLatePayment: false,
        neverPaidTuition: false,
        owesMembership: false,
        enrollmentCount: 0,
        enrollments: [],
        memberships: [],
        tags: [],
      });
    }
    return familyMap.get(key)!;
  };

  for (const enr of owingEnrollments) {
    const outstandingCents = Number(enr.outstandingCents) || 0;
    if (outstandingCents <= 0) continue;

    const family = ensureFamily(enr.parentId, enr.parentEmail);
    const hasPlan = enrollmentsWithPending.has(enr.id);
    const isLate = lateEnrollmentIds.has(enr.id);
    const neverPaid = (enr.totalPaid ?? 0) <= 0;

    family.tuitionOwedCents += outstandingCents;
    family.enrollmentCount += 1;
    if (hasPlan) family.hasPaymentPlan = true;
    if (isLate) {
      family.hasLatePayment = true;
      family.overdueTuitionCents += outstandingCents;
    }
    if (neverPaid) family.neverPaidTuition = true;

    family.enrollments.push({
      enrollmentId: enr.id,
      childName: enr.childName,
      className: enr.className,
      outstandingCents,
      totalPaid: enr.totalPaid ?? 0,
      totalCost: enr.totalCost ?? 0,
      hasPaymentPlan: hasPlan,
      isLate,
      neverPaid,
    });
  }

  for (const mem of membershipRows) {
    const balanceDueCents = Math.max(Number(mem.balanceDue ?? 0), Number(mem.remainingBalance ?? 0));
    if (balanceDueCents <= 0) continue;

    const parent = parentInfoMap.get(mem.parentUserId);
    const family = ensureFamily(mem.parentUserId, parent?.email ?? null);
    family.membershipOwedCents += balanceDueCents;
    family.owesMembership = true;
    family.memberships.push({
      id: mem.id,
      membershipYear: mem.membershipYear,
      balanceDueCents,
      status: mem.status,
      dueDate: mem.dueDate ? new Date(mem.dueDate).toISOString() : null,
    });
  }

  const families = [...familyMap.values()]
    .map((family) => {
      family.totalOwedCents = family.tuitionOwedCents + family.membershipOwedCents;
      const tags: string[] = [];
      if (family.tuitionOwedCents > 0) tags.push('owes_tuition');
      if (family.membershipOwedCents > 0) tags.push('owes_membership');
      if (family.hasLatePayment) tags.push('late');
      if (family.tuitionOwedCents > 0 && !family.hasPaymentPlan) tags.push('no_payment_plan');
      if (family.autoPayEnabled) tags.push('auto_pay');
      if (family.neverPaidTuition) tags.push('never_paid');
      family.tags = tags;
      return family;
    })
    .filter((f) => f.totalOwedCents > 0)
    .sort((a, b) => b.totalOwedCents - a.totalOwedCents);

  const summary = {
    familiesWithBalance: families.length,
    totalTuitionOwedCents: families.reduce((s, f) => s + f.tuitionOwedCents, 0),
    totalMembershipOwedCents: families.reduce((s, f) => s + f.membershipOwedCents, 0),
    totalOwedCents: families.reduce((s, f) => s + f.totalOwedCents, 0),
    lateFamilies: families.filter((f) => f.hasLatePayment).length,
    noPaymentPlanFamilies: families.filter((f) => f.tuitionOwedCents > 0 && !f.hasPaymentPlan).length,
    autoPayFamilies: families.filter((f) => f.autoPayEnabled && f.totalOwedCents > 0).length,
    neverPaidFamilies: families.filter((f) => f.neverPaidTuition).length,
    membershipOwedFamilies: families.filter((f) => f.owesMembership).length,
  };

  return { families, summary };
}

export type AutoPayHistoryRecord = {
  id: number;
  parentEmail: string;
  parentName: string;
  amount: number;
  status: string;
  processedAt: Date | null;
  scheduledDate: Date | null;
  childName: string | null;
  className: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  failureReason: string | null;
  stripePaymentIntentId: string | null;
};

/** Scheduled payments charged via auto-pay (shared by API + CSV export). */
export async function fetchAutoPayHistoryRecords(
  schoolId: number,
  options: { startDate: Date; endDate: Date; status?: 'all' | 'completed' | 'failed' },
): Promise<AutoPayHistoryRecord[]> {
  const db = await getDb();
  const statusFilter = options.status ?? 'all';
  const conditions = [
    eq(scheduledPayments.schoolId, schoolId),
    gte(scheduledPayments.processedAt, options.startDate),
    lte(scheduledPayments.processedAt, options.endDate),
    or(
      sql`${scheduledPayments.completionSource} LIKE '%autopay%'`,
      eq(scheduledPayments.chargedBy, 'auto_pay'),
    ),
  ];
  if (statusFilter === 'completed') {
    conditions.push(eq(scheduledPayments.status, 'completed'));
  } else if (statusFilter === 'failed') {
    conditions.push(eq(scheduledPayments.status, 'failed'));
  }

  const rows = await db
    .select({
      id: scheduledPayments.id,
      parentEmail: scheduledPayments.parentEmail,
      amount: scheduledPayments.amount,
      status: scheduledPayments.status,
      processedAt: scheduledPayments.processedAt,
      scheduledDate: scheduledPayments.scheduledDate,
      installmentNumber: scheduledPayments.installmentNumber,
      totalInstallments: scheduledPayments.totalInstallments,
      failureReason: scheduledPayments.failureReason,
      stripePaymentIntentId: scheduledPayments.stripePaymentIntentId,
      enrollmentId: scheduledPayments.enrollmentId,
    })
    .from(scheduledPayments)
    .where(and(...conditions))
    .orderBy(desc(scheduledPayments.processedAt));

  return Promise.all(
    rows.map(async (row) => {
      let childName: string | null = null;
      let className: string | null = null;
      try {
        const enrollment = await storage.getProgramEnrollmentById(row.enrollmentId);
        if (enrollment) {
          childName = enrollment.childName ?? null;
          className = enrollment.className ?? null;
        }
      } catch {
        // optional enrichment
      }
      return {
        id: row.id,
        parentEmail: row.parentEmail,
        parentName: row.parentEmail,
        amount: row.amount ?? 0,
        status: row.status,
        processedAt: row.processedAt,
        scheduledDate: row.scheduledDate,
        childName,
        className,
        installmentNumber: row.installmentNumber,
        totalInstallments: row.totalInstallments,
        failureReason: row.failureReason,
        stripePaymentIntentId: row.stripePaymentIntentId,
      };
    }),
  );
}
