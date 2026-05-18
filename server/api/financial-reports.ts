import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';
import { storage } from '../storage';
import { getDb } from '../db';
import {
  payments,
  scheduledPayments,
  programEnrollments,
  membershipEnrollments,
  users,
  refunds,
  schools,
  classes,
  schoolClasses,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull, not, inArray } from 'drizzle-orm';
import { generateCFOInsights, isAIAvailable } from '../services/cfoInsightsService';
import { reconcileSchoolScheduledPayments, cleanupScheduledPayments, generateMissingScheduledPayments } from '../services/scheduled-payment-reconciliation';
import { computeEffectiveBalance } from '@shared/schema';
import {
  resolveEnrollmentOutstandingCents,
  sqlEnrollmentEffectiveBalancePositive,
  sqlSumCompAmountCents,
  sqlSumEnrollmentEffectiveBalance,
} from '../lib/enrollment-balance';
import {
  buildCollectionsOverview,
  buildOutstandingBalanceRows,
  fetchAutoPayHistoryRecords,
} from '../lib/financial-collections';
import { resolveAdminSchoolId, sqlStripeHistoryUserAtSchool } from '../lib/admin-school-context';
import { isSchoolFeatureEnabled } from '../lib/school-features';
import { schoolScopedLedgerPayments } from '../lib/school-payment-scope';
import { fetchSucceededPaymentIntentsForSchool } from '../services/school-stripe-transactions';

const AI_MODEL = 'claude-sonnet-4-20250514';

let anthropic: Anthropic | null = null;
try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch (e) {
  console.error('Failed to initialize Anthropic for financial reports:', e);
}

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Too many requests. Please wait a moment before sending another message.' }
});

/** Prevent accidental double-runs of destructive scheduled-payment sync. */
const reconcileScheduledPaymentsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Sync already ran recently. Please wait a minute before syncing again.' },
});

const router = express.Router();

interface FinancialReportUser {
  user: any;
  schoolId: number;
}

interface FinancialReportError {
  error: string;
  status: number;
}

async function getSchoolAdminWithFeatureCheck(req: any, featureName: string): Promise<FinancialReportUser | FinancialReportError> {
  const userEmail = req.user?.email || req.auth?.email;
  if (!userEmail) {
    return { error: 'Authentication required', status: 401 };
  }

  const user = await storage.getUserByEmail(userEmail);
  if (!user) {
    return { error: 'User not found', status: 404 };
  }

  // Check BOTH legacy users.role AND user_roles table (per asa-auth-patterns multi-role pattern)
  const userRoles = await storage.getUserRolesByUserId(user.id);
  const adminRoleNames = ['schoolAdmin', 'admin', 'superAdmin', 'director'] as const;
  const hasAdminRole =
    userRoles.some((r) => adminRoleNames.includes(r.role as (typeof adminRoleNames)[number])) ||
    adminRoleNames.includes(user.role as (typeof adminRoleNames)[number]) ||
    user.role === 'superAdmin';

  if (!hasAdminRole) {
    return { error: 'Only school administrators can access financial reports', status: 403 };
  }

  const schoolId = await resolveAdminSchoolId(req, user);

  if (!schoolId) {
    return { error: 'No school associated with this admin account', status: 400 };
  }

  const features = await storage.getSchoolFeatures(schoolId);
  if (!isSchoolFeatureEnabled(features, featureName)) {
    return { error: 'This feature is not enabled for your school. Please contact support to upgrade.', status: 403 };
  }

  return { user, schoolId };
}

function isError(result: FinancialReportUser | FinancialReportError): result is FinancialReportError {
  return 'error' in result;
}

/** Ledger rows treated as collected revenue for admin reporting */
function reportedLedgerPaymentStatuses() {
  return sql`${payments.status} IN ('completed', 'succeeded')`;
}

/**
 * Stripe-synced succeeded charges attributed to this school that do not appear on the school's
 * `payments` ledger (same PI id). Avoids double-count when both exist.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function stripeOrphanRevenueForSchool(
  schoolId: number,
  since?: Date,
): Promise<{ cents: number; count: number }> {
  try {
    return await stripeOrphanRevenueForSchoolQuery(schoolId, since);
  } catch (error) {
    console.warn('stripeOrphanRevenueForSchool skipped:', errorMessage(error));
    return { cents: 0, count: 0 };
  }
}

async function stripeOrphanRevenueForSchoolQuery(
  schoolId: number,
  since?: Date,
): Promise<{ cents: number; count: number }> {
  const db = await getDb();
  const sinceFilter = since ? sql`AND sph.stripe_created_at >= ${since}` : sql``;

  const result = await db.execute(sql`
    SELECT COALESCE(SUM(sph.amount), 0)::integer AS cents,
           COUNT(*)::integer AS cnt
    FROM stripe_payment_history sph
    WHERE sph.status = 'succeeded'
      ${sinceFilter}
      AND ${sqlStripeHistoryUserAtSchool(schoolId)}
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.stripe_payment_intent_id IS NOT NULL
          AND p.stripe_payment_intent_id = sph.payment_intent_id
          AND (
            p.school_id = ${schoolId}
            OR EXISTS (
              SELECT 1
              FROM program_enrollments pe
              CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.enrollment_ids, '[]'::jsonb)) AS enr(elem)
              WHERE pe.school_id = ${schoolId}
                AND pe.id = (enr.elem)::text::int
            )
          )
      )
  `);

  const row = result.rows[0] as { cents?: unknown; cnt?: unknown } | undefined;
  return {
    cents: Number(row?.cents ?? 0),
    count: Number(row?.cnt ?? 0),
  };
}

async function stripeOrphanMonthlyRevenueForSchool(
  schoolId: number,
  startDate: Date,
): Promise<Array<{ month: string; revenue: number; paymentCount: number }>> {
  try {
    return await stripeOrphanMonthlyRevenueForSchoolQuery(schoolId, startDate);
  } catch (error) {
    console.warn('stripeOrphanMonthlyRevenueForSchool skipped:', errorMessage(error));
    return [];
  }
}

async function stripeOrphanMonthlyRevenueForSchoolQuery(
  schoolId: number,
  startDate: Date,
): Promise<Array<{ month: string; revenue: number; paymentCount: number }>> {
  const db = await getDb();
  const result = await db.execute(sql`
    SELECT TO_CHAR(sph.stripe_created_at, 'YYYY-MM') AS month,
           COALESCE(SUM(sph.amount), 0)::integer AS revenue,
           COUNT(*)::integer AS payment_count
    FROM stripe_payment_history sph
    WHERE sph.status = 'succeeded'
      AND sph.stripe_created_at >= ${startDate}
      AND ${sqlStripeHistoryUserAtSchool(schoolId)}
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.stripe_payment_intent_id IS NOT NULL
          AND p.stripe_payment_intent_id = sph.payment_intent_id
          AND (
            p.school_id = ${schoolId}
            OR EXISTS (
              SELECT 1
              FROM program_enrollments pe
              CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.enrollment_ids, '[]'::jsonb)) AS enr(elem)
              WHERE pe.school_id = ${schoolId}
                AND pe.id = (enr.elem)::text::int
            )
          )
      )
    GROUP BY TO_CHAR(sph.stripe_created_at, 'YYYY-MM')
    ORDER BY 1
  `);

  return (result.rows as Array<{ month: string; revenue: unknown; payment_count: unknown }>).map((r) => ({
    month: String(r.month),
    revenue: Number(r.revenue ?? 0),
    paymentCount: Number(r.payment_count ?? 0),
  }));
}

router.get('/summary', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const db = await getDb();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [
      completedPaymentsResult,
      last30DaysRevenueResult,
      ytdRevenueResult,
      outstandingBalancesResult,
      overdueBalancesResult,
      refundsResult,
      activePaymentPlansResult,
      totalEnrollmentsResult,
      totalCompedResult,
      stripeOrphanAll,
      stripeOrphan30,
      stripeOrphanYtd,
      membershipOutstandingResult,
    ] = await Promise.all([
      db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
          paymentCount: sql<number>`COUNT(*)::integer`,
        })
        .from(payments)
        .where(and(schoolScopedLedgerPayments(schoolId), reportedLedgerPaymentStatuses())),
      db
        .select({
          revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
        })
        .from(payments)
        .where(
          and(
            schoolScopedLedgerPayments(schoolId),
            reportedLedgerPaymentStatuses(),
            gte(payments.createdAt, thirtyDaysAgo),
          ),
        ),
      db
        .select({
          revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
        })
        .from(payments)
        .where(
          and(schoolScopedLedgerPayments(schoolId), reportedLedgerPaymentStatuses(), gte(payments.createdAt, yearStart)),
        ),
      db
        .select({
          totalOutstanding: sqlSumEnrollmentEffectiveBalance(),
        })
        .from(programEnrollments)
        .where(
          and(
            eq(programEnrollments.schoolId, schoolId),
            not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
            sqlEnrollmentEffectiveBalancePositive(),
          ),
        ),
      db
        .select({
          overdueCount: sql<number>`COUNT(*)::integer`,
          overdueAmount: sql<number>`COALESCE(SUM(${scheduledPayments.amount}), 0)::integer`,
        })
        .from(scheduledPayments)
        .where(
          and(
            eq(scheduledPayments.schoolId, schoolId),
            eq(scheduledPayments.status, 'pending'),
            sql`${scheduledPayments.scheduledDate} < NOW()`,
          ),
        ),
      db
        .select({
          totalRefunded: sql<number>`COALESCE(SUM(${refunds.amount}), 0)::integer`,
          refundCount: sql<number>`COUNT(*)::integer`,
        })
        .from(refunds)
        .where(and(eq(refunds.schoolId, schoolId), eq(refunds.status, 'completed'))),
      db
        .select({
          activePlans: sql<number>`COUNT(*)::integer`,
        })
        .from(programEnrollments)
        .where(
          and(
            eq(programEnrollments.schoolId, schoolId),
            not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
            sqlEnrollmentEffectiveBalancePositive(),
          ),
        ),
      db
        .select({
          count: sql<number>`COUNT(*)::integer`,
        })
        .from(programEnrollments)
        .where(and(eq(programEnrollments.schoolId, schoolId), not(eq(programEnrollments.status, 'cancelled')))),
      db
        .select({
          totalComped: sqlSumCompAmountCents(),
        })
        .from(programEnrollments)
        .where(eq(programEnrollments.schoolId, schoolId)),
      stripeOrphanRevenueForSchool(schoolId),
      stripeOrphanRevenueForSchool(schoolId, thirtyDaysAgo),
      stripeOrphanRevenueForSchool(schoolId, yearStart),
      db
        .select({
          totalOutstanding: sql<number>`COALESCE(SUM(GREATEST(COALESCE(${membershipEnrollments.balanceDue}, 0), COALESCE(${membershipEnrollments.remainingBalance}, 0))), 0)::integer`,
          familyCount: sql<number>`COUNT(DISTINCT ${membershipEnrollments.parentUserId})::integer`,
        })
        .from(membershipEnrollments)
        .where(
          and(
            eq(membershipEnrollments.schoolId, schoolId),
            inArray(membershipEnrollments.status, ['pending_payment', 'grace_period']),
            sql`GREATEST(COALESCE(${membershipEnrollments.balanceDue}, 0), COALESCE(${membershipEnrollments.remainingBalance}, 0)) > 0`,
          ),
        ),
    ]);

    const ledgerTotal = completedPaymentsResult[0]?.totalRevenue || 0;
    const ledger30 = last30DaysRevenueResult[0]?.revenue || 0;
    const ledgerYtd = ytdRevenueResult[0]?.revenue || 0;
    const ledgerCount = completedPaymentsResult[0]?.paymentCount || 0;

    const tuitionOutstandingCents = outstandingBalancesResult[0]?.totalOutstanding || 0;
    const membershipOutstandingCents = membershipOutstandingResult[0]?.totalOutstanding || 0;

    const payload: Record<string, unknown> = {
      summary: {
        totalRevenueCents: ledgerTotal + stripeOrphanAll.cents,
        last30DaysRevenueCents: ledger30 + stripeOrphan30.cents,
        ytdRevenueCents: ledgerYtd + stripeOrphanYtd.cents,
        totalPayments: ledgerCount + stripeOrphanAll.count,
        outstandingBalanceCents: tuitionOutstandingCents + membershipOutstandingCents,
        tuitionOutstandingCents,
        membershipOutstandingCents,
        membershipOwedFamilies: membershipOutstandingResult[0]?.familyCount || 0,
        overduePayments: overdueBalancesResult[0]?.overdueCount || 0,
        overdueAmountCents: overdueBalancesResult[0]?.overdueAmount || 0,
        totalRefundedCents: refundsResult[0]?.totalRefunded || 0,
        refundCount: refundsResult[0]?.refundCount || 0,
        activePaymentPlans: activePaymentPlansResult[0]?.activePlans || 0,
        totalEnrollments: totalEnrollmentsResult[0]?.count || 0,
        totalCompedCents: totalCompedResult[0]?.totalComped || 0,
      },
      schoolId,
      generatedAt: new Date().toISOString(),
    };

    if (req.query.debug === '1') {
      const [ledgerBySchoolOnly, enrollmentsAtSchool, stripeHistoryRows] = await Promise.all([
        db
          .select({ c: sql<number>`COUNT(*)::integer` })
          .from(payments)
          .where(and(eq(payments.schoolId, schoolId), reportedLedgerPaymentStatuses())),
        db
          .select({ c: sql<number>`COUNT(*)::integer` })
          .from(programEnrollments)
          .where(eq(programEnrollments.schoolId, schoolId)),
        db.execute(sql`
          SELECT COUNT(*)::integer AS c FROM stripe_payment_history sph
          WHERE sph.status = 'succeeded' AND ${sqlStripeHistoryUserAtSchool(schoolId)}
        `),
      ]);
      payload.diagnostics = {
        ledgerPaymentsScoped: ledgerCount,
        ledgerPaymentsSchoolIdColumnOnly: ledgerBySchoolOnly[0]?.c ?? 0,
        stripeOrphanRevenueCents: stripeOrphanAll.cents,
        stripeOrphanPaymentCount: stripeOrphanAll.count,
        enrollmentsAtSchool: enrollmentsAtSchool[0]?.c ?? 0,
        stripeHistorySucceededRows: Number((stripeHistoryRows.rows[0] as { c?: unknown })?.c ?? 0),
      };
    }

    res.json(payload);
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    const body: Record<string, unknown> = { error: 'Failed to fetch financial summary' };
    if (req.query.debug === '1') {
      body.errorDetail = errorMessage(error);
    }
    res.status(500).json(body);
  }
});

router.get('/revenue-trends', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const db = await getDb();
    const months = parseInt(req.query.months as string) || 12;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const [monthlyRevenue, stripeOrphanMonthly] = await Promise.all([
      db
        .select({
          month: sql<string>`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`,
          revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
          paymentCount: sql<number>`COUNT(*)::integer`,
        })
        .from(payments)
        .where(
          and(schoolScopedLedgerPayments(schoolId), reportedLedgerPaymentStatuses(), gte(payments.createdAt, startDate)),
        )
        .groupBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`),
      stripeOrphanMonthlyRevenueForSchool(schoolId, startDate),
    ]);

    const monthlyRefunds = await db
      .select({
        month: sql<string>`TO_CHAR(${refunds.createdAt}, 'YYYY-MM')`,
        refunded: sql<number>`COALESCE(SUM(${refunds.amount}), 0)::integer`,
        refundCount: sql<number>`COUNT(*)::integer`,
      })
      .from(refunds)
      .where(
        and(
          eq(refunds.schoolId, schoolId),
          eq(refunds.status, 'completed'),
          gte(refunds.createdAt, startDate)
        )
      )
      .groupBy(sql`TO_CHAR(${refunds.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${refunds.createdAt}, 'YYYY-MM')`);

    type RevenueRecord = { month: string; revenue: number; paymentCount: number };
    type RefundRecord = { month: string; refunded: number; refundCount: number };

    const revenueMap = new Map<string, RevenueRecord>(monthlyRevenue.map((r: RevenueRecord) => [r.month, r]));
    for (const row of stripeOrphanMonthly) {
      const prev = revenueMap.get(row.month);
      if (prev) {
        revenueMap.set(row.month, {
          month: row.month,
          revenue: prev.revenue + row.revenue,
          paymentCount: prev.paymentCount + row.paymentCount,
        });
      } else {
        revenueMap.set(row.month, {
          month: row.month,
          revenue: row.revenue,
          paymentCount: row.paymentCount,
        });
      }
    }

    const refundMap = new Map<string, RefundRecord>(monthlyRefunds.map((r: RefundRecord) => [r.month, r]));

    const allMonths = new Set([...revenueMap.keys(), ...refundMap.keys()]);
    const trends = Array.from(allMonths).sort().map(month => ({
      month,
      revenueCents: revenueMap.get(month)?.revenue || 0,
      paymentCount: revenueMap.get(month)?.paymentCount || 0,
      refundedCents: refundMap.get(month)?.refunded || 0,
      refundCount: refundMap.get(month)?.refundCount || 0,
      netRevenueCents: (revenueMap.get(month)?.revenue || 0) - (refundMap.get(month)?.refunded || 0),
    }));

    res.json({ trends });
  } catch (error) {
    console.error('Error fetching revenue trends:', error);
    res.status(500).json({ error: 'Failed to fetch revenue trends' });
  }
});

router.get('/outstanding-balances', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;
    const payload = await buildOutstandingBalanceRows(schoolId);
    res.json(payload);
  } catch (error) {
    console.error('Error fetching outstanding balances:', error);
    res.status(500).json({ error: 'Failed to fetch outstanding balances' });
  }
});

router.get('/collections-overview', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;
    const payload = await buildCollectionsOverview(schoolId);
    if (req.query.debug === '1') {
      return res.json({
        ...payload,
        debug: { schoolId },
      });
    }
    res.json(payload);
  } catch (error) {
    console.error('Error fetching collections overview:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch collections overview';
    res.status(500).json({ error: message });
  }
});

router.get('/payment-plans', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const db = await getDb();

    const allScheduledPayments = await db
      .select()
      .from(scheduledPayments)
      .where(eq(scheduledPayments.schoolId, schoolId))
      .orderBy(scheduledPayments.enrollmentId, scheduledPayments.installmentNumber);

    type PlanAccumulator = Record<number, {
      enrollmentId: number;
      parentEmail: string;
      parentId: number;
      totalInstallments: number;
      installments: (typeof allScheduledPayments[number])[];
    }>;

    const plansByEnrollment: PlanAccumulator = allScheduledPayments.reduce((acc: PlanAccumulator, payment: typeof allScheduledPayments[number]) => {
      const key = payment.enrollmentId;
      if (!acc[key]) {
        acc[key] = {
          enrollmentId: key,
          parentEmail: payment.parentEmail,
          parentId: payment.parentId,
          totalInstallments: payment.totalInstallments,
          installments: [],
        };
      }
      acc[key].installments.push(payment);
      return acc;
    }, {});

    const enrichedPlans = await Promise.all(
      Object.values(plansByEnrollment).map(async (plan) => {
        let parentInfo: { id: number; name: string; email: string } | null = null;
        let enrollmentInfo: { id: number; childName: string | null; className: string | null } | null = null;

        try {
          const parent = await storage.getUser(plan.parentId);
          if (parent) {
            parentInfo = {
              id: parent.id,
              name: parent.name || parent.email,
              email: parent.email,
            };
          }
        } catch (e) {}

        try {
          const enrollment = await storage.getProgramEnrollmentById(plan.enrollmentId);
          if (enrollment) {
            enrollmentInfo = {
              id: enrollment.id,
              childName: enrollment.childName || null,
              className: enrollment.className || null,
            };
          }
        } catch (e) {}

        const completed = plan.installments.filter(i => i.status === 'completed');
        const pending = plan.installments.filter(i => i.status === 'pending');
        const failed = plan.installments.filter(i => i.status === 'failed');

        const totalAmountCents = plan.installments.reduce((sum, i) => sum + i.amount, 0);
        const paidAmountCents = completed.reduce((sum, i) => sum + i.amount, 0);
        const remainingAmountCents = pending.reduce((sum, i) => sum + i.amount, 0);

        const now = new Date();
        const overdueInstallments = pending.filter(i => new Date(i.scheduledDate) < now);

        return {
          enrollmentId: plan.enrollmentId,
          parent: parentInfo,
          enrollment: enrollmentInfo,
          totalInstallments: plan.totalInstallments,
          completedInstallments: completed.length,
          pendingInstallments: pending.length,
          failedInstallments: failed.length,
          totalAmountCents,
          paidAmountCents,
          remainingAmountCents,
          progressPercent: Math.round((paidAmountCents / totalAmountCents) * 100) || 0,
          isOverdue: overdueInstallments.length > 0,
          overdueCount: overdueInstallments.length,
          overdueAmountCents: overdueInstallments.reduce((sum, i) => sum + i.amount, 0),
          nextPaymentDate: pending.length > 0 
            ? pending.sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0].scheduledDate
            : null,
          installments: plan.installments,
        };
      })
    );

    const activePlans = enrichedPlans.filter(p => p.pendingInstallments > 0);
    const completedPlans = enrichedPlans.filter(p => p.pendingInstallments === 0 && p.completedInstallments > 0);
    const overduePlans = activePlans.filter(p => p.isOverdue);

    const summary = {
      totalPlans: enrichedPlans.length,
      activePlans: activePlans.length,
      completedPlans: completedPlans.length,
      overduePlans: overduePlans.length,
      totalOutstandingCents: activePlans.reduce((sum, p) => sum + p.remainingAmountCents, 0),
      totalOverdueCents: overduePlans.reduce((sum, p) => sum + p.overdueAmountCents, 0),
      averageProgressPercent: activePlans.length > 0
        ? Math.round(activePlans.reduce((sum, p) => sum + p.progressPercent, 0) / activePlans.length)
        : 0,
    };

    res.json({
      plans: enrichedPlans,
      activePlans,
      overduePlans,
      summary,
    });
  } catch (error) {
    console.error('Error fetching payment plans:', error);
    res.status(500).json({ error: 'Failed to fetch payment plans' });
  }
});

router.get('/recent-transactions', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const db = await getDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const recentPayments = await db
      .select({
        id: payments.id,
        type: sql<string>`'payment'`,
        amount: payments.amount,
        status: payments.status,
        createdAt: payments.createdAt,
        enrollmentIds: payments.enrollmentIds,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        paymentMethod: payments.paymentMethod,
        childName: payments.childName,
        className: payments.className,
        parentEmail: payments.parentEmail,
      })
      .from(payments)
      .where(schoolScopedLedgerPayments(schoolId))
      .orderBy(desc(payments.createdAt))
      .limit(limit);

    const recentRefundsData = await db
      .select({
        id: refunds.id,
        type: sql<string>`'refund'`,
        amount: refunds.amount,
        status: refunds.status,
        createdAt: refunds.createdAt,
        enrollmentId: refunds.enrollmentId,
        reason: refunds.reason,
      })
      .from(refunds)
      .where(eq(refunds.schoolId, schoolId))
      .orderBy(desc(refunds.createdAt))
      .limit(limit);

    type TxRow = {
      id: string | number;
      type: string;
      amount: number;
      status: string;
      createdAt: Date | string;
      enrollmentId: number | null;
      stripePaymentIntentId?: string | null;
      paymentMethod?: string | null;
      childName?: string | null;
      className?: string | null;
      parentEmail?: string | null;
      reason?: string | null;
      source: 'ledger' | 'stripe_history' | 'stripe_live';
    };

    const byIntent = new Map<string, TxRow>();

    for (const p of recentPayments) {
      const enrollmentId =
        Array.isArray(p.enrollmentIds) && p.enrollmentIds.length > 0
          ? (p.enrollmentIds as number[])[0]
          : null;
      const row: TxRow = {
        id: p.id,
        type: 'payment',
        amount: p.amount,
        status: p.status === 'completed' || p.status === 'succeeded' ? 'succeeded' : p.status,
        createdAt: p.createdAt!,
        enrollmentId,
        stripePaymentIntentId: p.stripePaymentIntentId,
        paymentMethod: p.paymentMethod,
        childName: p.childName,
        className: p.className,
        parentEmail: p.parentEmail,
        source: 'ledger',
      };
      if (p.stripePaymentIntentId) {
        byIntent.set(p.stripePaymentIntentId, row);
      } else {
        byIntent.set(`ledger:${p.id}`, row);
      }
    }

    const stripeHistory = await storage.getStripePaymentHistoryForSchool(schoolId, limit * 2);
    for (const sph of stripeHistory) {
      if (byIntent.has(sph.paymentIntentId)) continue;
      byIntent.set(sph.paymentIntentId, {
        id: `sph:${sph.id}`,
        type: 'payment',
        amount: sph.amount,
        status: sph.status === 'succeeded' ? 'succeeded' : sph.status,
        createdAt: sph.stripeCreatedAt,
        enrollmentId: null,
        stripePaymentIntentId: sph.paymentIntentId,
        paymentMethod: sph.paymentMethod,
        childName: null,
        className: sph.description,
        parentEmail: null,
        source: 'stripe_history',
      });
    }

    const liveStripe = await fetchSucceededPaymentIntentsForSchool(schoolId, { maxParents: 100 });
    for (const [, intent] of liveStripe) {
      if (byIntent.has(intent.id)) continue;
      byIntent.set(intent.id, {
        id: `stripe:${intent.id}`,
        type: 'payment',
        amount: intent.amount,
        status: 'succeeded',
        createdAt: intent.created,
        enrollmentId: null,
        stripePaymentIntentId: intent.id,
        paymentMethod: intent.paymentMethod,
        childName: null,
        className: intent.description,
        parentEmail: intent.parentEmail,
        source: 'stripe_live',
      });
    }

    const refundRows: TxRow[] = recentRefundsData.map((r) => ({
      id: r.id,
      type: 'refund',
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt!,
      enrollmentId: r.enrollmentId,
      reason: r.reason,
      source: 'ledger' as const,
    }));

    const merged = [...byIntent.values(), ...refundRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const enrichedTransactions = await Promise.all(
      merged.map(async (tx) => {
        let enrollmentInfo = null;
        if (tx.enrollmentId) {
          try {
            const enrollment = await storage.getProgramEnrollmentById(tx.enrollmentId);
            if (enrollment) {
              enrollmentInfo = {
                id: enrollment.id,
                childName: enrollment.childName,
                className: enrollment.className,
                parentEmail: enrollment.parentEmail,
              };
            }
          } catch (_e) {}
        }
        return { ...tx, enrollment: enrollmentInfo };
      }),
    );

    res.json({
      transactions: enrichedTransactions,
      generatedAt: new Date().toISOString(),
      sources: {
        ledgerPayments: recentPayments.length,
        stripeHistoryRows: stripeHistory.length,
        stripeLiveOrphans: liveStripe.size,
      },
    });
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

router.get('/class-breakdown', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const startDateParam = req.query.startDate as string | undefined;
    const endDateParam = req.query.endDate as string | undefined;

    const db = await getDb();

    const baseEnrollmentConditions = [
      eq(programEnrollments.schoolId, schoolId),
      not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed'])),
    ];

    const outstandingSql = sql<number>`GREATEST(0, ${programEnrollments.totalCost} - ${programEnrollments.totalPaid} - COALESCE(comp_amount_cents, 0))`;

    const marketplaceConditions = [
      ...baseEnrollmentConditions,
      sql`(${programEnrollments.classType} = 'marketplace' OR ${programEnrollments.marketplaceClassId} IS NOT NULL)`,
    ];
    if (startDateParam) marketplaceConditions.push(gte(classes.startDate, startDateParam));
    if (endDateParam) marketplaceConditions.push(lte(classes.startDate, endDateParam));

    const marketplaceRows = await db
      .select({
        className: programEnrollments.className,
        totalCost: programEnrollments.totalCost,
        totalPaid: programEnrollments.totalPaid,
        outstandingCents: outstandingSql,
        compAmountCents: sql<number>`COALESCE(comp_amount_cents, 0)`,
        classStartDate: classes.startDate,
        classEndDate: classes.endDate,
      })
      .from(programEnrollments)
      .leftJoin(classes, eq(programEnrollments.marketplaceClassId, classes.id))
      .where(and(...marketplaceConditions));

    const schoolConditions = [
      ...baseEnrollmentConditions,
      sql`(${programEnrollments.classType} = 'school_class' OR (${programEnrollments.marketplaceClassId} IS NULL AND ${programEnrollments.classId} IS NOT NULL))`,
    ];
    if (startDateParam) schoolConditions.push(gte(programEnrollments.programStartDate, startDateParam));
    if (endDateParam) schoolConditions.push(lte(programEnrollments.programStartDate, endDateParam));

    const schoolRows = await db
      .select({
        className: programEnrollments.className,
        totalCost: programEnrollments.totalCost,
        totalPaid: programEnrollments.totalPaid,
        outstandingCents: outstandingSql,
        compAmountCents: sql<number>`COALESCE(comp_amount_cents, 0)`,
        classStartDate: sql<string | null>`NULL`,
        classEndDate: sql<string | null>`NULL`,
      })
      .from(programEnrollments)
      .leftJoin(schoolClasses, eq(programEnrollments.classId, schoolClasses.id))
      .where(and(...schoolConditions));

  type BreakdownRow = {
    className: string | null;
    totalCost: number | null;
    totalPaid: number | null;
    outstandingCents: number;
    compAmountCents: number;
    classStartDate: string | Date | null;
    classEndDate: string | Date | null;
  };

    const rows: BreakdownRow[] = [
      ...marketplaceRows.map((r) => ({
        className: r.className,
        totalCost: r.totalCost,
        totalPaid: r.totalPaid,
        outstandingCents: Number(r.outstandingCents) || 0,
        compAmountCents: Number(r.compAmountCents) || 0,
        classStartDate: r.classStartDate,
        classEndDate: r.classEndDate,
      })),
      ...schoolRows.map((r) => ({
        className: r.className,
        totalCost: r.totalCost,
        totalPaid: r.totalPaid,
        outstandingCents: Number(r.outstandingCents) || 0,
        compAmountCents: Number(r.compAmountCents) || 0,
        classStartDate: r.classStartDate,
        classEndDate: r.classEndDate,
      })),
    ];

    const classMap = new Map<string, {
      className: string;
      classStartDate: string | null;
      classEndDate: string | null;
      enrollmentCount: number;
      totalExpectedCents: number;
      totalCollectedCents: number;
      totalOutstandingCents: number;
      totalCompedCents: number;
    }>();

    for (const row of rows) {
      const key = row.className || 'Unknown Class';
      if (!classMap.has(key)) {
        classMap.set(key, {
          className: key,
          classStartDate: row.classStartDate ? String(row.classStartDate) : null,
          classEndDate: row.classEndDate ? String(row.classEndDate) : null,
          enrollmentCount: 0,
          totalExpectedCents: 0,
          totalCollectedCents: 0,
          totalOutstandingCents: 0,
          totalCompedCents: 0,
        });
      }
      const entry = classMap.get(key)!;
      entry.enrollmentCount++;
      entry.totalExpectedCents += row.totalCost ?? 0;
      entry.totalCollectedCents += row.totalPaid ?? 0;
      entry.totalOutstandingCents += row.outstandingCents;
      entry.totalCompedCents += row.compAmountCents;
    }

    const classList = Array.from(classMap.values()).sort((a, b) => {
      if (!a.classStartDate && !b.classStartDate) return a.className.localeCompare(b.className);
      if (!a.classStartDate) return 1;
      if (!b.classStartDate) return -1;
      return new Date(b.classStartDate).getTime() - new Date(a.classStartDate).getTime();
    });

    const totals = classList.reduce(
      (acc, c) => ({
        totalExpectedCents: acc.totalExpectedCents + c.totalExpectedCents,
        totalCollectedCents: acc.totalCollectedCents + c.totalCollectedCents,
        totalOutstandingCents: acc.totalOutstandingCents + c.totalOutstandingCents,
        totalCompedCents: acc.totalCompedCents + c.totalCompedCents,
      }),
      { totalExpectedCents: 0, totalCollectedCents: 0, totalOutstandingCents: 0, totalCompedCents: 0 },
    );

    res.json({
      classes: classList,
      totals,
      generatedAt: new Date().toISOString(),
      dateFieldNote:
        'Marketplace classes filter by classes.start_date when date range is set; school classes include all active enrollments in range-agnostic mode.',
    });
  } catch (error) {
    console.error('Error fetching class breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch class breakdown' });
  }
});

router.get('/auto-pay-history', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const { startDate: startDateStr, endDate: endDateStr, status = 'all' } = req.query;

    // Default date range: first day of current month → today
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const startDate = startDateStr ? new Date(String(startDateStr)) : defaultStart;
    const endDate = endDateStr ? new Date(String(endDateStr)) : defaultEnd;

    const statusFilter = String(status) as 'all' | 'completed' | 'failed';
    const records = await fetchAutoPayHistoryRecords(schoolId, {
      startDate,
      endDate,
      status: statusFilter === 'all' ? 'all' : statusFilter,
    });

    const charged = records.filter((r) => r.status === 'completed');
    const failed = records.filter((r) => r.status === 'failed');
    const skipped = records.filter((r) => r.status !== 'completed' && r.status !== 'failed');

    return res.json({
      records,
      summary: {
        totalChargedCents: charged.reduce((s, r) => s + (r.amount ?? 0), 0),
        totalFailedCents: failed.reduce((s, r) => s + (r.amount ?? 0), 0),
        chargedCount: charged.length,
        failedCount: failed.length,
        skippedCount: skipped.length,
      },
    });
  } catch (error) {
    console.error('Error fetching auto-pay history:', error);
    return res.status(500).json({ error: 'Failed to fetch auto-pay history' });
  }
});

router.get('/export', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const db = await getDb();
    const reportType = req.query.type || 'all';

    let csvContent = '';
    let filename = '';

    if (reportType === 'payments' || reportType === 'all') {
      const paymentsData = await db
        .select({
          id: payments.id,
          amount: payments.amount,
          status: payments.status,
          paymentMethod: payments.paymentMethod,
          createdAt: payments.createdAt,
          childName: payments.childName,
          className: payments.className,
          parentEmail: payments.parentEmail,
        })
        .from(payments)
        .where(schoolScopedLedgerPayments(schoolId))
        .orderBy(desc(payments.createdAt));

      csvContent = 'Transaction ID,Amount,Status,Payment Method,Date,Child Name,Class,Parent Email\n';
      csvContent += paymentsData.map((p: typeof paymentsData[number]) => {
        const amountDollars = p.amount != null ? `$${(p.amount / 100).toFixed(2)}` : '$0.00';
        return `${p.id},${amountDollars},${p.status},${p.paymentMethod || 'N/A'},${p.createdAt?.toISOString() || 'N/A'},${p.childName || 'N/A'},${p.className || 'N/A'},${p.parentEmail || 'N/A'}`;
      }).join('\n');

      filename = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (reportType === 'outstanding') {
      const { balances } = await buildOutstandingBalanceRows(schoolId);

      csvContent =
        'Payment ID,Parent Email,Phone,Amount,Scheduled Date,Type,Child,Class,Enrollment Balance,Status,Reminders Sent\n';
      csvContent += balances
        .map((o) => {
          const phoneStr = o.parent?.phone || 'N/A';
          const amountDollars = o.amount != null ? `$${(o.amount / 100).toFixed(2)}` : '$0.00';
          const scheduledStr = o.scheduledDate
            ? new Date(o.scheduledDate).toISOString().split('T')[0]
            : 'N/A';
          const child = o.enrollment?.childName || 'N/A';
          const cls = o.enrollment?.className || 'N/A';
          const enrollmentBal = `$${(o.enrollmentRemainingBalance / 100).toFixed(2)}`;
          return `${o.id},${o.parentEmail},${phoneStr},${amountDollars},${scheduledStr},${o.type},"${child}","${cls}",${enrollmentBal},${o.status},${o.reminderCount ?? 0}`;
        })
        .join('\n');

      filename = `outstanding_balances_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (reportType === 'autopay') {
      const now = new Date();
      const startDate = req.query.startDate
        ? new Date(String(req.query.startDate))
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate
        ? new Date(String(req.query.endDate))
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const records = await fetchAutoPayHistoryRecords(schoolId, {
        startDate,
        endDate,
        status: 'all',
      });

      csvContent =
        'Date Charged,Parent Name,Parent Email,Child,Class,Installment,Amount ($),Status,Failure Reason,Stripe PI ID\n';
      csvContent += records
        .map((r) => {
          const dateStr = r.processedAt
            ? new Date(r.processedAt).toISOString()
            : r.scheduledDate
              ? new Date(r.scheduledDate).toISOString().split('T')[0]
              : 'N/A';
          const amountDollars = r.amount != null ? (r.amount / 100).toFixed(2) : '0.00';
          const installment = `${r.installmentNumber || 1} of ${r.totalInstallments || 1}`;
          const failureReason = (r.failureReason || '').replace(/,/g, ';');
          return `${dateStr},"${r.parentName}",${r.parentEmail || 'N/A'},"${r.childName || 'N/A'}","${r.className || 'N/A'}","${installment}",${amountDollars},${r.status},"${failureReason}",${r.stripePaymentIntentId || 'N/A'}`;
        })
        .join('\n');

      filename = `auto_pay_history_${new Date().toISOString().split('T')[0]}.csv`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting financial data:', error);
    res.status(500).json({ error: 'Failed to export financial data' });
  }
});

router.get('/ai-insights', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const db = await getDb();

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [
      summaryResult,
      stripeOrphanAll,
      outstandingResult,
      enrollmentCountResult,
      paymentPlansResult,
      revenueTrendsLedger,
      stripeOrphanMonthly6m,
      outstandingBalancesResult,
    ] = await Promise.all([
      db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
          paymentCount: sql<number>`COUNT(*)::integer`,
        })
        .from(payments)
        .where(and(schoolScopedLedgerPayments(schoolId), reportedLedgerPaymentStatuses())),
      stripeOrphanRevenueForSchool(schoolId),
      db
        .select({
          outstanding: sqlSumEnrollmentEffectiveBalance(),
        })
        .from(programEnrollments)
        .where(
          and(
            eq(programEnrollments.schoolId, schoolId),
            not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
            sqlEnrollmentEffectiveBalancePositive(),
          ),
        ),
      db
        .select({
          count: sql<number>`COUNT(*)::integer`,
        })
        .from(programEnrollments)
        .where(
          and(
            eq(programEnrollments.schoolId, schoolId),
            not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed'])),
          ),
        ),
      db
        .select({
          parentEmail: scheduledPayments.parentEmail,
          totalAmount: sql<number>`SUM(${scheduledPayments.amount})::integer`,
          paidAmount: sql<number>`SUM(CASE WHEN ${scheduledPayments.status} = 'completed' THEN ${scheduledPayments.amount} ELSE 0 END)::integer`,
          totalInstallments: sql<number>`MAX(${scheduledPayments.totalInstallments})::integer`,
          completedInstallments: sql<number>`COUNT(CASE WHEN ${scheduledPayments.status} = 'completed' THEN 1 END)::integer`,
        })
        .from(scheduledPayments)
        .where(eq(scheduledPayments.schoolId, schoolId))
        .groupBy(scheduledPayments.parentEmail),
      db
        .select({
          month: sql<string>`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`,
          revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
        })
        .from(payments)
        .where(
          and(
            schoolScopedLedgerPayments(schoolId),
            reportedLedgerPaymentStatuses(),
            gte(payments.createdAt, sixMonthsAgo),
          ),
        )
        .groupBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`),
      stripeOrphanMonthlyRevenueForSchool(schoolId, sixMonthsAgo),
      db
        .select({
          parentEmail: scheduledPayments.parentEmail,
          amount: sql<number>`SUM(${scheduledPayments.amount})::integer`,
          scheduledDate: sql<Date>`MIN(${scheduledPayments.scheduledDate})`,
        })
        .from(scheduledPayments)
        .where(and(eq(scheduledPayments.schoolId, schoolId), eq(scheduledPayments.status, 'pending')))
        .groupBy(scheduledPayments.parentEmail),
    ]);

    const totalPlans = paymentPlansResult.length;
    let avgProgress = 0;
    if (totalPlans > 0) {
      const totalProgress = paymentPlansResult.reduce((sum, plan) => {
        const progress = plan.totalAmount > 0 ? (plan.paidAmount / plan.totalAmount) * 100 : 0;
        return sum + progress;
      }, 0);
      avgProgress = totalProgress / totalPlans;
    }

    const ledgerRev = summaryResult[0]?.totalRevenue || 0;
    const ledgerPaymentCount = summaryResult[0]?.paymentCount || 0;
    const totalCollectedCents = ledgerRev + stripeOrphanAll.cents;
    const totalPaymentEvents = ledgerPaymentCount + stripeOrphanAll.count;

    const trendMap = new Map<string, number>();
    for (const r of revenueTrendsLedger) {
      trendMap.set(r.month, r.revenue);
    }
    for (const row of stripeOrphanMonthly6m) {
      trendMap.set(row.month, (trendMap.get(row.month) ?? 0) + row.revenue);
    }
    const revenueTrends = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({
        month,
        revenue,
        collected: revenue,
      }));

    const summary = {
      totalRevenue: totalCollectedCents,
      totalCollected: totalCollectedCents,
      outstandingBalance: (outstandingResult[0] as any)?.outstanding || 0,
      paymentPlanProgress: avgProgress,
      enrollmentCount: enrollmentCountResult[0]?.count || 0,
      averagePaymentAmount:
        totalPaymentEvents > 0 ? Math.round(totalCollectedCents / totalPaymentEvents) : 0,
    };

    const outstandingBalances = outstandingBalancesResult.map((o: typeof outstandingBalancesResult[number]) => {
      const daysOverdue = o.scheduledDate 
        ? Math.max(0, Math.floor((now.getTime() - new Date(o.scheduledDate).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      return {
        familyName: o.parentEmail?.split('@')[0] || 'Unknown',
        balance: o.amount,
        daysOverdue,
      };
    });

    const paymentPlans = paymentPlansResult.slice(0, 10).map((p: typeof paymentPlansResult[number]) => ({
      familyName: p.parentEmail?.split('@')[0] || 'Unknown',
      progress: p.totalAmount > 0 ? Math.round((p.paidAmount / p.totalAmount) * 100) : 0,
      remainingBalance: p.totalAmount - p.paidAmount,
    }));

    const insights = await generateCFOInsights(summary, revenueTrends, outstandingBalances, paymentPlans);

    res.json({
      ...insights,
      aiAvailable: isAIAvailable(),
    });
  } catch (error) {
    console.error('Error generating AI insights:', error);
    res.status(500).json({ error: 'Failed to generate AI insights' });
  }
});

// Get payment reminder history
router.get('/reminder-history', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const limit = parseInt(req.query.limit as string) || 100;
    const reminderLogs = await storage.getPaymentReminderLogsBySchool(schoolId, limit);

    console.log(`📧 Retrieved ${reminderLogs.length} reminder logs for school ${schoolId}`);
    res.json(reminderLogs);
  } catch (error) {
    console.error('Error fetching reminder history:', error);
    res.status(500).json({ error: 'Failed to fetch reminder history' });
  }
});

// Send a manual payment reminder
router.post('/send-reminder', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { user, schoolId } = result;

    const { scheduledPaymentId } = req.body;
    if (!scheduledPaymentId) {
      return res.status(400).json({ error: 'scheduledPaymentId is required' });
    }

    // Get the scheduled payment and validate school ownership
    const allPayments = await storage.getAllScheduledPayments();
    const payment = allPayments.find(p => p.id === scheduledPaymentId);
    
    if (!payment) {
      return res.status(404).json({ error: 'Scheduled payment not found' });
    }

    // Security check: Verify the payment belongs to the admin's school via enrollment
    let childName = 'Student';
    let className = 'Class';
    let schoolName = 'School';
    let parentName = null;
    let paymentSchoolId: number | null = null;

    if (payment.enrollmentId) {
      const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
      if (enrollment) {
        childName = enrollment.childName || 'Student';
        className = enrollment.className || 'Class';
        paymentSchoolId = enrollment.schoolId;
        
        if (enrollment.schoolId) {
          const school = await storage.getSchool(enrollment.schoolId);
          if (school) {
            schoolName = school.name;
          }
        }
      }
    }

    // Critical security check: Ensure payment belongs to admin's school
    if (paymentSchoolId !== schoolId) {
      console.error(`⚠️ Cross-tenant access attempt: User from school ${schoolId} tried to send reminder for payment from school ${paymentSchoolId}`);
      return res.status(403).json({ error: 'Access denied: Payment does not belong to your school' });
    }

    // Get parent name
    const parent = await storage.getUserByEmail(payment.parentEmail);
    if (parent) {
      parentName = parent.name || parent.email;
    }

    // Import email service dynamically
    const { sendScheduledPaymentReminder } = await import('../lib/email-service');

    try {
      await sendScheduledPaymentReminder({
        parentEmail: payment.parentEmail,
        childName,
        className,
        schoolName,
        amount: payment.amount,
        dueDate: new Date(payment.scheduledDate),
        daysUntilDue: Math.floor((new Date(payment.scheduledDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        paymentId: payment.id,
        installmentNumber: payment.installmentNumber,
        totalInstallments: payment.totalInstallments,
        urgency: 'medium'
      });

      // Log the manual reminder
      await storage.createPaymentReminderLog({
        schoolId,
        scheduledPaymentId: payment.id,
        parentEmail: payment.parentEmail,
        parentName,
        childName,
        className,
        amountCents: payment.amount,
        reminderType: 'manual',
        status: 'sent',
        isManual: true,
        sentBy: user.id,
        errorMessage: null
      });

      console.log(`✅ Manual reminder sent to ${payment.parentEmail} for payment ${payment.id}`);
      res.json({ success: true, message: 'Reminder sent successfully' });

    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
      
      // Log the failed attempt
      await storage.createPaymentReminderLog({
        schoolId,
        scheduledPaymentId: payment.id,
        parentEmail: payment.parentEmail,
        parentName,
        childName,
        className,
        amountCents: payment.amount,
        reminderType: 'manual',
        status: 'failed',
        isManual: true,
        sentBy: user.id,
        errorMessage
      });

      console.error(`❌ Failed to send manual reminder:`, errorMessage);
      res.status(500).json({ error: 'Failed to send reminder', message: errorMessage });
    }

  } catch (error) {
    console.error('Error sending manual reminder:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// Send a consolidated summary reminder for all payments from a parent
router.post('/send-summary-reminder', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { user, schoolId } = result;

    const { parentEmail } = req.body;
    if (!parentEmail) {
      return res.status(400).json({ error: 'parentEmail is required' });
    }

    const db = await getDb();

    // Security: Get all pending payments for this parent within THIS school only
    // The schoolId filter ensures we only return payments belonging to the admin's school,
    // preventing cross-tenant data leakage. Even if an admin provides an email from
    // another school, no data will be returned since payments are scoped by schoolId.
    const outstandingPayments = await db
      .select({
        id: scheduledPayments.id,
        enrollmentId: scheduledPayments.enrollmentId,
        parentId: scheduledPayments.parentId,
        parentEmail: scheduledPayments.parentEmail,
        amount: scheduledPayments.amount,
        scheduledDate: scheduledPayments.scheduledDate,
      })
      .from(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.schoolId, schoolId),
          eq(scheduledPayments.parentEmail, parentEmail),
          eq(scheduledPayments.status, 'pending')
        )
      )
      .orderBy(scheduledPayments.scheduledDate);

    // Also fetch enrollments with outstanding balances that have no scheduled payment row.
    // These are surfaced on the Balances tab as "No Payment Plan" — without including them
    // here, parents whose entire balance is unscheduled would incorrectly get a 404.
    // (asa-payment-patterns: "Never Use scheduled_payments for Outstanding Balance Totals")
    const enrollmentsWithBalance = await db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          eq(programEnrollments.parentEmail, parentEmail),
          not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
          sqlEnrollmentEffectiveBalancePositive(),
        )
      );

    if (outstandingPayments.length === 0 && enrollmentsWithBalance.length === 0) {
      return res.status(404).json({ error: 'No outstanding payments found for this parent' });
    }

    // Get school name
    const school = await storage.getSchool(schoolId);
    const schoolName = school?.name || 'School';

    // Get parent name
    const parent = await storage.getUserByEmail(parentEmail);
    const parentName = parent?.name || parentEmail.split('@')[0];

    // Enrich scheduled payments with enrollment details and auto-heal stale 'pending' rows
    // whose enrollment is already fully paid (effective_balance <= 0).
    // (asa-database-patterns: "Auto-heal at read time")
    const now = new Date();
    type ScheduledItem = {
      childName: string;
      className: string;
      amountCents: number;
      dueDate: Date | null;
      isOverdue: boolean;
      daysOverdue: number;
      kind: 'scheduled' | 'unscheduled';
    };

    const scheduledDetails = (await Promise.all(
      outstandingPayments.map(async (payment): Promise<ScheduledItem | null> => {
        let childName = 'Student';
        let className = 'Class';

        if (payment.enrollmentId) {
          const enrollment: any = await storage.getProgramEnrollmentById(payment.enrollmentId);
          if (enrollment) {
            childName = enrollment.childName || 'Student';
            className = enrollment.className || 'Class';

            const enrollmentRemainingBalance =
              enrollment.effectiveBalance ??
              computeEffectiveBalance(
                enrollment.totalCost ?? 0,
                enrollment.totalPaid ?? 0,
                enrollment.compAmountCents ?? 0,
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
      })
    )).filter((p): p is ScheduledItem => p !== null);

    // Build unscheduled items from enrollments not already covered by a kept scheduled row.
    const coveredEnrollmentIds = new Set(
      outstandingPayments.map(p => p.enrollmentId).filter((id): id is number => id != null)
    );
    const unscheduledDetails: ScheduledItem[] = enrollmentsWithBalance
      .filter(e => !coveredEnrollmentIds.has(e.id))
      .map(enrollment => {
        const amount =
          (enrollment as any).effectiveBalance ??
          computeEffectiveBalance(
            enrollment.totalCost ?? 0,
            enrollment.totalPaid ?? 0,
            enrollment.compAmountCents ?? 0,
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
      .filter(item => item.amountCents > 0);

    const paymentDetails: ScheduledItem[] = [...scheduledDetails, ...unscheduledDetails];

    if (paymentDetails.length === 0) {
      return res.status(404).json({ error: 'No outstanding payments found for this parent' });
    }

    const totalAmountCents = paymentDetails.reduce((sum, p) => sum + p.amountCents, 0);
    // Overdue counters are derived from scheduled items only — unscheduled items have no due date.
    const overduePayments = scheduledDetails.filter(p => p.isOverdue);
    const overdueCount = overduePayments.length;
    const overdueAmountCents = overduePayments.reduce((sum, p) => sum + p.amountCents, 0);

    // Import email service dynamically
    const { sendConsolidatedPaymentReminder } = await import('../lib/email-service');

    try {
      await sendConsolidatedPaymentReminder({
        parentEmail,
        parentName,
        schoolName,
        totalAmountCents,
        payments: paymentDetails,
        overdueCount,
        overdueAmountCents,
      });

      // Log the summary reminder
      await storage.createPaymentReminderLog({
        schoolId,
        scheduledPaymentId: null, // Summary covers multiple payments
        parentEmail,
        parentName,
        childName: `${paymentDetails.length} children`,
        className: `${paymentDetails.length} payments`,
        amountCents: totalAmountCents,
        reminderType: 'summary',
        status: 'sent',
        isManual: true,
        sentBy: user.id,
        errorMessage: null
      });

      console.log(`✅ Summary reminder sent to ${parentEmail} for ${paymentDetails.length} payments`);
      res.json({ success: true, message: 'Summary reminder sent successfully', paymentCount: paymentDetails.length });

    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
      
      // Log the failed attempt
      await storage.createPaymentReminderLog({
        schoolId,
        scheduledPaymentId: null,
        parentEmail,
        parentName,
        childName: `${paymentDetails.length} children`,
        className: `${paymentDetails.length} payments`,
        amountCents: totalAmountCents,
        reminderType: 'summary',
        status: 'failed',
        isManual: true,
        sentBy: user.id,
        errorMessage
      });

      console.error(`❌ Failed to send summary reminder:`, errorMessage);
      res.status(500).json({ error: 'Failed to send summary reminder', message: errorMessage });
    }

  } catch (error) {
    console.error('Error sending summary reminder:', error);
    res.status(500).json({ error: 'Failed to send summary reminder' });
  }
});

router.get('/reconcile-scheduled-payments/preview', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    // Preview cleanup
    const cleanupPreview = await cleanupScheduledPayments(schoolId, true);
    
    // Preview reconciliation
    const preview = await reconcileSchoolScheduledPayments(schoolId, true);
    
    // Preview missing payments generation
    const missingPreview = await generateMissingScheduledPayments(schoolId, true);
    
    res.json({
      message: 'Preview of scheduled payment sync',
      summary: {
        enrollmentsToProcess: preview.enrollmentsProcessed,
        enrollmentsWithChanges: preview.enrollmentsWithChanges,
        paymentsToMarkCompleted: preview.totalPaymentsMarkedCompleted,
        cancelledToDelete: cleanupPreview.cancelledDeleted,
        generatedCatchupsToRemove: cleanupPreview.generatedCatchupsRemoved,
        duplicatesToRemove: cleanupPreview.duplicatesRemoved,
        orphansToRemove: cleanupPreview.orphansRemoved,
        excessToRemove: cleanupPreview.excessRemoved,
        totalToClean: cleanupPreview.cancelledDeleted + cleanupPreview.generatedCatchupsRemoved + cleanupPreview.duplicatesRemoved + cleanupPreview.orphansRemoved + cleanupPreview.excessRemoved,
        missingPaymentsToCreate: missingPreview.paymentsCreated,
        enrollmentsWithMissingPayments: missingPreview.details.length,
      },
      details: preview.results,
      cleanupDetails: cleanupPreview.details,
      missingPaymentsDetails: missingPreview.details,
      errors: [...preview.errors, ...missingPreview.errors],
    });
  } catch (error) {
    console.error('Error previewing reconciliation:', error);
    res.status(500).json({ error: 'Failed to preview reconciliation' });
  }
});

router.post('/reconcile-scheduled-payments', reconcileScheduledPaymentsLimiter, async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    // First, cleanup duplicate/orphaned/excess scheduled payments
    const cleanup = await cleanupScheduledPayments(schoolId, false);
    
    // Then run status reconciliation
    const reconciliation = await reconcileSchoolScheduledPayments(schoolId, false);
    
    // Finally, generate missing scheduled payments for enrollments with remaining balances
    const generated = await generateMissingScheduledPayments(schoolId, false);
    
    res.json({
      message: 'Scheduled payment sync completed',
      summary: {
        enrollmentsProcessed: reconciliation.enrollmentsProcessed,
        enrollmentsWithChanges: reconciliation.enrollmentsWithChanges,
        paymentsMarkedCompleted: reconciliation.totalPaymentsMarkedCompleted,
        cancelledDeleted: cleanup.cancelledDeleted,
        generatedCatchupsRemoved: cleanup.generatedCatchupsRemoved,
        duplicatesRemoved: cleanup.duplicatesRemoved,
        orphansRemoved: cleanup.orphansRemoved,
        excessRemoved: cleanup.excessRemoved,
        totalCleaned: cleanup.cancelledDeleted + cleanup.generatedCatchupsRemoved + cleanup.duplicatesRemoved + cleanup.orphansRemoved + cleanup.excessRemoved,
        missingPaymentsCreated: generated.paymentsCreated,
        enrollmentsWithMissingPayments: generated.details.length,
      },
      details: reconciliation.results,
      cleanupDetails: cleanup.details,
      generatedDetails: generated.details,
      errors: [...reconciliation.errors, ...generated.errors],
    });
  } catch (error) {
    console.error('Error running reconciliation:', error);
    res.status(500).json({ error: 'Failed to run reconciliation' });
  }
});

// Preview endpoint for generating missing scheduled payments
router.get('/generate-missing-payments/preview', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const preview = await generateMissingScheduledPayments(schoolId, true);
    
    res.json({
      message: 'Preview of missing scheduled payments to generate',
      summary: {
        enrollmentsProcessed: preview.enrollmentsProcessed,
        paymentsToCreate: preview.paymentsCreated,
      },
      details: preview.details,
      errors: preview.errors,
    });
  } catch (error) {
    console.error('Error previewing missing payments:', error);
    res.status(500).json({ error: 'Failed to preview missing payments' });
  }
});

// Execute endpoint for generating missing scheduled payments
router.post('/generate-missing-payments', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const generated = await generateMissingScheduledPayments(schoolId, false);
    
    res.json({
      message: 'Missing scheduled payments generated',
      summary: {
        enrollmentsProcessed: generated.enrollmentsProcessed,
        paymentsCreated: generated.paymentsCreated,
      },
      details: generated.details,
      errors: generated.errors,
    });
  } catch (error) {
    console.error('Error generating missing payments:', error);
    res.status(500).json({ error: 'Failed to generate missing payments' });
  }
});

// AI Financial Q&A chat endpoint
router.post('/ai-chat', aiChatLimiter, async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    if (!anthropic) {
      return res.json({
        response: 'The AI assistant is temporarily unavailable. Please check the CFO Insights tab for pre-generated analysis, or try again later.',
        aiAvailable: false,
      });
    }

    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const db = await getDb();

    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    // Fetch accurate financial summary to inject as context
    const [revenueResult, stripeOrphanAll, outstandingResult, overdueResult, enrollmentResult, ytdLedgerResult, stripeOrphanYtd] =
      await Promise.all([
        db
          .select({
            totalRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
            paymentCount: sql<number>`COUNT(*)::integer`,
          })
          .from(payments)
          .where(and(schoolScopedLedgerPayments(schoolId), reportedLedgerPaymentStatuses())),

        stripeOrphanRevenueForSchool(schoolId),

        db
          .select({
            outstanding: sqlSumEnrollmentEffectiveBalance(),
            activeCount: sql<number>`COUNT(*)::integer`,
          })
          .from(programEnrollments)
          .where(
            and(
              eq(programEnrollments.schoolId, schoolId),
              not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
              sqlEnrollmentEffectiveBalancePositive(),
            ),
          ),

        db
          .select({
            overdueAmount: sql<number>`COALESCE(SUM(${scheduledPayments.amount}), 0)::integer`,
            overdueCount: sql<number>`COUNT(*)::integer`,
          })
          .from(scheduledPayments)
          .where(
            and(
              eq(scheduledPayments.schoolId, schoolId),
              eq(scheduledPayments.status, 'pending'),
              sql`${scheduledPayments.scheduledDate} < NOW()`,
            ),
          ),

        db
          .select({ count: sql<number>`COUNT(*)::integer` })
          .from(programEnrollments)
          .where(
            and(
              eq(programEnrollments.schoolId, schoolId),
              not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed'])),
            ),
          ),

        db
          .select({
            ytdRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
          })
          .from(payments)
          .where(
            and(
              schoolScopedLedgerPayments(schoolId),
              reportedLedgerPaymentStatuses(),
              gte(payments.createdAt, yearStart),
            ),
          ),

        stripeOrphanRevenueForSchool(schoolId, yearStart),
      ]);

    const totalRevenue =
      (revenueResult[0]?.totalRevenue || 0) + stripeOrphanAll.cents;
    const totalPaymentsProcessed =
      (revenueResult[0]?.paymentCount || 0) + stripeOrphanAll.count;
    const ytdRevenueCents =
      (ytdLedgerResult[0]?.ytdRevenue || 0) + stripeOrphanYtd.cents;
    const outstandingBalance = (outstandingResult[0] as any)?.outstanding || 0;
    const activeEnrollments = enrollmentResult[0]?.count || 0;
    const collectionRate = totalRevenue > 0
      ? ((totalRevenue / (totalRevenue + outstandingBalance)) * 100).toFixed(1)
      : '0';

    // Fetch school name for context
    let schoolName = 'your school';
    try {
      const school = await storage.getSchoolById(schoolId);
      if (school?.name) schoolName = school.name;
    } catch (_) {}

    const systemPrompt = `You are a financial analyst assistant for ${schoolName}, an educational organization. You help the school administrator understand their finances, identify trends, and make informed decisions.

CURRENT FINANCIAL SNAPSHOT (as of ${new Date().toLocaleDateString()}):
- Total Revenue Collected: $${(totalRevenue / 100).toFixed(2)}
- YTD Revenue (${new Date().getFullYear()}): $${(ytdRevenueCents / 100).toFixed(2)}
- Outstanding Balance (all active enrollments): $${(outstandingBalance / 100).toFixed(2)}
- Overdue Amount: $${((overdueResult[0]?.overdueAmount || 0) / 100).toFixed(2)} (${overdueResult[0]?.overdueCount || 0} overdue installments)
- Active Enrollments with Balance: ${(outstandingResult[0] as any)?.activeCount || 0}
- Total Active Enrollments: ${activeEnrollments}
- Collection Rate: ${collectionRate}%
- Total Payments Processed: ${totalPaymentsProcessed}

IMPORTANT:
- All amounts shown above are accurate and come directly from the database
- For questions about specific family accounts, explain you have aggregate data only and direct them to the Enrollments section
- Answer clearly and concisely — the admin is busy
- Format dollar amounts clearly (e.g., "$1,234.56")
- If asked about something outside this data, be transparent about your limitations`;

    // Truncate history to last 20 messages to avoid token limits
    const truncatedHistory = history.slice(-20);

    const messages: Anthropic.MessageParam[] = [
      ...truncatedHistory,
      { role: 'user', content: message },
    ];

    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const responseText = aiResponse.content[0]?.type === 'text'
      ? aiResponse.content[0].text
      : 'I was unable to generate a response. Please try again.';

    res.json({ response: responseText, aiAvailable: true });
  } catch (error: any) {
    console.error('Error in financial AI chat:', error);
    res.json({
      response: 'I encountered an issue processing your question. Please try again in a moment.',
      aiAvailable: true,
    });
  }
});

// Shared handler for balance-audit — extracted so it can be mounted at two paths
async function balanceAuditHandler(req: any, res: any) {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const db = await getDb();

    // Fetch all active enrollments for the school, joined with parent user info.
    // 'completed' is included intentionally so admins can catch enrollments marked done but still owed.
    // Terminal statuses (cancelled, withdrawn, failed, waitlist) are excluded.
    const effectiveBal = sql`GREATEST(0, pe.total_cost - pe.total_paid - COALESCE(pe.comp_amount_cents, 0))`;
    const rows = await db.execute(
      sql`
        SELECT
          pe.id,
          pe.parent_email      AS "parentEmail",
          pe.payment_plan      AS "paymentPlan",
          pe.total_cost        AS "totalCost",
          pe.total_paid        AS "totalPaid",
          pe.comp_amount_cents AS "compAmountCents",
          pe.remaining_balance AS "remainingBalance",
          ${effectiveBal}      AS "effectiveBalance",
          pe.payment_status    AS "paymentStatus",
          pe.status,
          pe.child_name        AS "childName",
          pe.class_name        AS "className",
          u.name               AS "parentName",
          CASE
            WHEN (${effectiveBal}) < 0                                   THEN 'overpaid'
            WHEN pe.status = 'completed' AND (${effectiveBal}) > 0      THEN 'still_owes'
            WHEN pe.remaining_balance = 0 AND (${effectiveBal}) > 0     THEN 'mismatch'
            ELSE 'ok'
          END AS flag
        FROM program_enrollments pe
        LEFT JOIN users u ON pe.parent_id = u.id
        WHERE pe.school_id = ${schoolId}
          AND pe.status NOT IN ('cancelled', 'withdrawn', 'failed', 'waitlist')
        ORDER BY
          CASE
            WHEN (${effectiveBal}) < 0                                   THEN 1
            WHEN pe.status = 'completed' AND (${effectiveBal}) > 0      THEN 2
            WHEN pe.remaining_balance = 0 AND (${effectiveBal}) > 0     THEN 3
            ELSE 4
          END,
          pe.parent_email ASC,
          pe.id ASC
      `
    );

    const enrollments = rows.rows as any[];

    const totalActive = enrollments.length;
    const mismatchCount = enrollments.filter(e => e.flag === 'mismatch').length;
    const stillOwesCount = enrollments.filter(e => e.flag === 'still_owes').length;
    const overpaidCount = enrollments.filter(e => e.flag === 'overpaid').length;

    return res.json({
      enrollments,
      summary: { totalActive, mismatchCount, stillOwesCount, overpaidCount },
    });
  } catch (error: any) {
    console.error('Error fetching balance audit:', error);
    return res.status(500).json({ error: 'Failed to fetch balance audit data' });
  }
}

// Balance Audit mounted within the financial-reports router
// Full path: GET /api/admin/financial-reports/balance-audit
router.get('/balance-audit', balanceAuditHandler);

// Alias router so the endpoint is also reachable at /api/admin/balance-audit
// (mounted separately in app-init.ts)
export const balanceAuditAliasRouter = express.Router();
balanceAuditAliasRouter.get('/', balanceAuditHandler);

// ----------------------------------------------------------------------------
// Credit-Divergence Audit (Task 173)
//
// Forensic ledger replay: for each parent-initiated card payment, computes the
// credits that were *actually available at the moment the card was charged* —
// approved_at <= processed_at, minus any usage the ledger had recorded by then
// (unifiedCreditUsageLogs.created_at <= processed_at). This is the contract
// the auto-pay scheduler uses, so the audit reflects whether Pay Now would
// have made the same decision. Rows here are real refund candidates.
// ----------------------------------------------------------------------------
/**
 * Reusable query: returns flagged manual-pay payments where the parent had
 * unused approved credits at the moment the card was charged. Pass `schoolId`
 * to scope to one school; omit for a global sweep (used by the daily notifier).
 */
export async function findCreditDivergenceFlaggedPayments(
  schoolId?: number,
): Promise<any[]> {
  const db = await getDb();
  const schoolFilter = typeof schoolId === 'number'
    ? sql`AND sp.school_id = ${schoolId}`
    : sql``;

  const rows = await db.execute(
    sql`
        WITH manual_pays AS (
          SELECT
            sp.id,
            sp.parent_id,
            sp.parent_email,
            sp.school_id,
            sp.amount,
            sp.processed_at,
            sp.installment_number,
            sp.total_installments,
            sp.charged_by,
            sp.completion_source,
            sp.stripe_payment_intent_id,
            sp.metadata,
            pe.child_name,
            pe.class_name
          FROM scheduled_payments sp
          LEFT JOIN program_enrollments pe ON pe.id = sp.enrollment_id
          WHERE sp.status = 'completed'
            AND sp.charged_by IN ('parent_manual', 'parent_manual_saved_card')
            AND sp.processed_at IS NOT NULL
            AND COALESCE((sp.metadata ->> 'creditsAppliedCents')::int, 0) < sp.amount
            ${schoolFilter}
        ),
        -- For every (manual_pay, eligible_credit) pair compute the credit's
        -- ledger-balance at the moment of the charge (approved <= processed_at,
        -- minus usage_log entries whose created_at <= processed_at).
        per_credit_balance AS (
          SELECT
            mp.id                                                       AS scheduled_payment_id,
            mp.parent_id,
            mp.school_id,
            mp.amount,
            mp.processed_at,
            mp.installment_number,
            mp.total_installments,
            mp.charged_by,
            mp.completion_source,
            mp.stripe_payment_intent_id,
            mp.metadata,
            mp.child_name,
            mp.class_name,
            mp.parent_email,
            c.id                                                        AS credit_id,
            c.credit_amount_cents
              - COALESCE((
                  SELECT SUM(ucu.amount_cents)
                  FROM unified_credit_usage_logs ucu
                  WHERE ucu.credit_id = c.id
                    AND ucu.created_at <= mp.processed_at
                ), 0)
              AS available_at_charge_cents
          FROM manual_pays mp
          JOIN credits c
            ON c.user_id = mp.parent_id
           AND c.school_id = mp.school_id
           AND c.status IN ('approved', 'partially_used', 'used')
           AND c.approved_at IS NOT NULL
           AND c.approved_at <= mp.processed_at
        )
        SELECT
          pcb.scheduled_payment_id                                       AS "scheduledPaymentId",
          pcb.parent_id                                                  AS "parentId",
          pcb.parent_email                                               AS "parentEmail",
          u.name                                                         AS "parentName",
          pcb.school_id                                                  AS "schoolId",
          pcb.amount                                                     AS "chargedAmount",
          pcb.processed_at                                               AS "processedAt",
          pcb.installment_number                                         AS "installmentNumber",
          pcb.total_installments                                         AS "totalInstallments",
          pcb.charged_by                                                 AS "chargedBy",
          pcb.completion_source                                          AS "completionSource",
          pcb.stripe_payment_intent_id                                   AS "stripePaymentIntentId",
          pcb.child_name                                                 AS "childName",
          pcb.class_name                                                 AS "className",
          COALESCE((pcb.metadata ->> 'creditsAppliedCents')::int, 0)     AS "creditsAppliedCents",
          SUM(GREATEST(pcb.available_at_charge_cents, 0))::int           AS "unusedCreditsAtChargeCents",
          LEAST(
            pcb.amount - COALESCE((pcb.metadata ->> 'creditsAppliedCents')::int, 0),
            SUM(GREATEST(pcb.available_at_charge_cents, 0))
          )::int                                                         AS "estimatedRefundCents"
        FROM per_credit_balance pcb
        LEFT JOIN users u ON u.id = pcb.parent_id
        GROUP BY
          pcb.scheduled_payment_id, pcb.parent_id, pcb.parent_email,
          pcb.school_id, pcb.amount, pcb.processed_at,
          pcb.installment_number, pcb.total_installments, pcb.charged_by,
          pcb.completion_source, pcb.stripe_payment_intent_id,
          pcb.metadata, pcb.child_name, pcb.class_name, u.name
        HAVING SUM(GREATEST(pcb.available_at_charge_cents, 0)) > 0
        ORDER BY pcb.processed_at DESC, pcb.scheduled_payment_id DESC
      `
  );
  return rows.rows as any[];
}

async function creditDivergenceAuditHandler(req: any, res: any) {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const flaggedPayments = await findCreditDivergenceFlaggedPayments(schoolId);
    const totalEstimatedRefundCents = flaggedPayments.reduce(
      (sum, r) => sum + (r.estimatedRefundCents || 0),
      0,
    );

    return res.json({
      flaggedPayments,
      summary: {
        flaggedCount: flaggedPayments.length,
        totalEstimatedRefundCents,
      },
    });
  } catch (error: any) {
    console.error('Error fetching credit-divergence audit:', error);
    return res.status(500).json({ error: 'Failed to fetch credit divergence audit data' });
  }
}

// Full path: GET /api/admin/financial-reports/credit-divergence-audit
router.get('/credit-divergence-audit', creditDivergenceAuditHandler);

// Alias router so the endpoint is also reachable at
// /api/admin/credit-divergence-audit (mounted separately in app-init.ts).
export const creditDivergenceAuditAliasRouter = express.Router();
creditDivergenceAuditAliasRouter.get('/', creditDivergenceAuditHandler);

export default router;

