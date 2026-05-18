import { and, eq, inArray, not } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { membershipEnrollments, programEnrollments, scheduledPayments } from '@shared/schema';
import { computeEffectiveBalance } from '@shared/schema';
import {
  sqlEnrollmentEffectiveBalanceColumn,
  sqlEnrollmentEffectiveBalancePositive,
} from './enrollment-balance';

const MEMBERSHIP_OWED_STATUSES = ['pending_payment', 'grace_period'] as const;

export type FamilyBalanceLineItem = {
  childName: string;
  className: string;
  amountCents: number;
  dueDate: Date | null;
  isOverdue: boolean;
  daysOverdue: number;
  kind: 'scheduled' | 'unscheduled' | 'membership';
};

export type FamilyBalanceEmailPayload = {
  parentEmail: string;
  parentName: string;
  schoolName: string;
  schoolId: number;
  lineItems: FamilyBalanceLineItem[];
  totalAmountCents: number;
  tuitionTotalCents: number;
  membershipTotalCents: number;
  overdueCount: number;
  overdueAmountCents: number;
};

export function getParentPaymentDeepLink(options?: { schoolId?: number; source?: string }): string {
  const base = (process.env.APP_URL || 'https://accounts.americanseekersacademy.com').replace(/\/$/, '');
  const params = new URLSearchParams();
  if (options?.schoolId) params.set('schoolId', String(options.schoolId));
  params.set('ref', options?.source || 'collections_reminder');
  const billingPath = `/billing?${params.toString()}`;
  return `${base}/login?returnTo=${encodeURIComponent(billingPath)}`;
}

/**
 * Build personalized balance summary for one family (tuition + membership).
 * Matches Collections / Outstanding Balances enrollment-first logic.
 */
export async function buildFamilyBalanceEmailPayload(
  schoolId: number,
  parentEmail: string,
): Promise<FamilyBalanceEmailPayload | null> {
  const db = await getDb();
  const now = new Date();

  const outstandingPayments = await db
    .select({
      id: scheduledPayments.id,
      enrollmentId: scheduledPayments.enrollmentId,
      amount: scheduledPayments.amount,
      scheduledDate: scheduledPayments.scheduledDate,
    })
    .from(scheduledPayments)
    .where(
      and(
        eq(scheduledPayments.schoolId, schoolId),
        eq(scheduledPayments.parentEmail, parentEmail),
        eq(scheduledPayments.status, 'pending'),
      ),
    )
    .orderBy(scheduledPayments.scheduledDate);

  const enrollmentsWithBalance = await db
    .select({
      id: programEnrollments.id,
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
        eq(programEnrollments.parentEmail, parentEmail),
        not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
        sqlEnrollmentEffectiveBalancePositive(),
      ),
    );

  const parent = await storage.getUserByEmail(parentEmail);
  const parentUserId = parent?.id;

  const membershipRows =
    parentUserId != null
      ? await db
          .select({
            id: membershipEnrollments.id,
            membershipYear: membershipEnrollments.membershipYear,
            balanceDue: membershipEnrollments.balanceDue,
            remainingBalance: membershipEnrollments.remainingBalance,
            dueDate: membershipEnrollments.dueDate,
          })
          .from(membershipEnrollments)
          .where(
            and(
              eq(membershipEnrollments.schoolId, schoolId),
              eq(membershipEnrollments.parentUserId, parentUserId),
              inArray(membershipEnrollments.status, [...MEMBERSHIP_OWED_STATUSES]),
            ),
          )
      : [];

  const enrollmentById = new Map(
    enrollmentsWithBalance.map((e) => [e.id, e] as const),
  );

  if (
    outstandingPayments.length === 0 &&
    enrollmentsWithBalance.length === 0 &&
    membershipRows.length === 0
  ) {
    return null;
  }

  const school = await storage.getSchool(schoolId);
  const schoolName = school?.name || 'School';
  const parentName = parent?.name || parentEmail.split('@')[0];

  type ScheduledItem = FamilyBalanceLineItem;

  const scheduledDetails = (
    await Promise.all(
      outstandingPayments.map(async (payment): Promise<ScheduledItem | null> => {
        let childName = 'Student';
        let className = 'Class';

        if (payment.enrollmentId) {
          let enrollment = enrollmentById.get(payment.enrollmentId);
          if (!enrollment) {
            const [row] = await db
              .select({
                id: programEnrollments.id,
                childName: programEnrollments.childName,
                className: programEnrollments.className,
                totalCost: programEnrollments.totalCost,
                totalPaid: programEnrollments.totalPaid,
                outstandingCents: sqlEnrollmentEffectiveBalanceColumn(),
              })
              .from(programEnrollments)
              .where(eq(programEnrollments.id, payment.enrollmentId))
              .limit(1);
            enrollment = row;
          }
          if (enrollment) {
            childName = enrollment.childName || 'Student';
            className = enrollment.className || 'Class';

            const enrollmentRemainingBalance =
              Number(enrollment.outstandingCents) ||
              computeEffectiveBalance(
                enrollment.totalCost ?? 0,
                enrollment.totalPaid ?? 0,
                0,
              );

            if (enrollmentRemainingBalance <= 0) {
              storage.updateScheduledPaymentStatus(payment.id, 'cancelled').catch(() => {});
              return null;
            }
          }
        }

        const isOverdue = new Date(payment.scheduledDate) < now;
        const daysOverdue = isOverdue
          ? Math.floor((now.getTime() - new Date(payment.scheduledDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          childName,
          className,
          amountCents: payment.amount,
          dueDate: new Date(payment.scheduledDate),
          isOverdue,
          daysOverdue,
          kind: 'scheduled',
        };
      }),
    )
  ).filter((p): p is ScheduledItem => p !== null);

  const coveredEnrollmentIds = new Set(
    outstandingPayments.map((p) => p.enrollmentId).filter((id): id is number => id != null),
  );

  const unscheduledDetails: ScheduledItem[] = enrollmentsWithBalance
    .filter((e) => !coveredEnrollmentIds.has(e.id))
    .map((enrollment) => {
      const amount =
        Number(enrollment.outstandingCents) ||
        computeEffectiveBalance(
          enrollment.totalCost ?? 0,
          enrollment.totalPaid ?? 0,
          0,
        );
      return {
        childName: enrollment.childName || 'Student',
        className: enrollment.className || 'Class',
        amountCents: amount,
        dueDate: null,
        isOverdue: false,
        daysOverdue: 0,
        kind: 'unscheduled' as const,
      };
    })
    .filter((item) => item.amountCents > 0);

  const membershipDetails: ScheduledItem[] = membershipRows
    .map((mem) => {
      const amountCents = Math.max(Number(mem.balanceDue ?? 0), Number(mem.remainingBalance ?? 0));
      if (amountCents <= 0) return null;
      const dueDate = mem.dueDate ? new Date(mem.dueDate) : null;
      const isOverdue = dueDate ? dueDate < now : false;
      const daysOverdue =
        isOverdue && dueDate
          ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
      return {
        childName: 'Membership',
        className: `Annual membership ${mem.membershipYear}`,
        amountCents,
        dueDate,
        isOverdue,
        daysOverdue,
        kind: 'membership' as const,
      };
    })
    .filter((row): row is ScheduledItem => row != null);

  const lineItems = [...scheduledDetails, ...unscheduledDetails, ...membershipDetails];

  if (lineItems.length === 0) {
    return null;
  }

  const tuitionTotalCents = [...scheduledDetails, ...unscheduledDetails].reduce(
    (s, p) => s + p.amountCents,
    0,
  );
  const membershipTotalCents = membershipDetails.reduce((s, p) => s + p.amountCents, 0);
  const totalAmountCents = tuitionTotalCents + membershipTotalCents;
  const overduePayments = lineItems.filter((p) => p.isOverdue);
  const overdueCount = overduePayments.length;
  const overdueAmountCents = overduePayments.reduce((s, p) => s + p.amountCents, 0);

  return {
    parentEmail,
    parentName,
    schoolName,
    schoolId,
    lineItems,
    totalAmountCents,
    tuitionTotalCents,
    membershipTotalCents,
    overdueCount,
    overdueAmountCents,
  };
}

export async function sendFamilyBalanceEmail(
  schoolId: number,
  parentEmail: string,
  sentByUserId?: number,
): Promise<{ success: boolean; paymentCount: number; error?: string }> {
  const payload = await buildFamilyBalanceEmailPayload(schoolId, parentEmail);
  if (!payload) {
    return { success: false, paymentCount: 0, error: 'No outstanding balance for this family' };
  }

  const paymentUrl = getParentPaymentDeepLink({ schoolId, source: 'collections_reminder' });
  const { sendConsolidatedPaymentReminder } = await import('./email-service');

  const sent = await sendConsolidatedPaymentReminder({
    parentEmail: payload.parentEmail,
    parentName: payload.parentName,
    schoolName: payload.schoolName,
    totalAmountCents: payload.totalAmountCents,
    tuitionTotalCents: payload.tuitionTotalCents,
    membershipTotalCents: payload.membershipTotalCents,
    payments: payload.lineItems,
    overdueCount: payload.overdueCount,
    overdueAmountCents: payload.overdueAmountCents,
    paymentUrl,
  });

  if (!sent) {
    return { success: false, paymentCount: payload.lineItems.length, error: 'Email delivery failed' };
  }

  try {
    await storage.createPaymentReminderLog({
      schoolId,
      scheduledPaymentId: null,
      parentEmail: payload.parentEmail,
      parentName: payload.parentName,
      childName: `${payload.lineItems.length} item(s)`,
      className: 'collections_summary',
      amountCents: payload.totalAmountCents,
      reminderType: 'summary',
      status: 'sent',
      isManual: true,
      sentBy: sentByUserId ?? null,
      errorMessage: null,
    });
  } catch (logErr) {
    console.error('[Collections] Payment reminder log failed (email was sent):', logErr);
  }

  return { success: true, paymentCount: payload.lineItems.length };
}
