import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';
import { storage } from '../storage';
import { getDb } from '../db';
import { payments, scheduledPayments, programEnrollments, users, refunds, schools, classes } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull, not, inArray } from 'drizzle-orm';
import { generateCFOInsights, isAIAvailable } from '../services/cfoInsightsService';
import { reconcileSchoolScheduledPayments, cleanupScheduledPayments, generateMissingScheduledPayments } from '../services/scheduled-payment-reconciliation';
import { computeEffectiveBalance } from '@shared/schema';

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
  const hasAdminRole = userRoles.some(r =>
    r.role === 'schoolAdmin' || r.role === 'admin' || r.role === 'superAdmin'
  ) || user.role === 'schoolAdmin' || user.role === 'superAdmin';

  if (!hasAdminRole) {
    return { error: 'Only school administrators can access financial reports', status: 403 };
  }

  // Prefer schoolId from user_roles entry, fall back to legacy users.schoolId
  const adminRole = userRoles.find(r =>
    r.role === 'schoolAdmin' || r.role === 'admin' || r.role === 'superAdmin'
  );
  const schoolId = adminRole?.schoolId ?? user.schoolId;

  if (!schoolId) {
    return { error: 'No school associated with this admin account', status: 400 };
  }

  const features = await storage.getSchoolFeatures(schoolId);
  if (!features[featureName]) {
    return { error: 'This feature is not enabled for your school. Please contact support to upgrade.', status: 403 };
  }

  return { user, schoolId };
}

function isError(result: FinancialReportUser | FinancialReportError): result is FinancialReportError {
  return 'error' in result;
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

    const completedPaymentsResult = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
        paymentCount: sql<number>`COUNT(*)::integer`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.schoolId, schoolId),
          eq(payments.status, 'completed')
        )
      );

    const last30DaysRevenueResult = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.schoolId, schoolId),
          eq(payments.status, 'completed'),
          gte(payments.createdAt, thirtyDaysAgo)
        )
      );

    const ytdRevenueResult = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.schoolId, schoolId),
          eq(payments.status, 'completed'),
          gte(payments.createdAt, yearStart)
        )
      );

    const outstandingBalancesResult = await db
      .select({
        totalOutstanding: sql<number>`COALESCE(SUM(effective_balance), 0)::integer`,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
          sql`effective_balance > 0`
        )
      );

    const overdueBalancesResult = await db
      .select({
        overdueCount: sql<number>`COUNT(*)::integer`,
        overdueAmount: sql<number>`COALESCE(SUM(${scheduledPayments.amount}), 0)::integer`,
      })
      .from(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.schoolId, schoolId),
          eq(scheduledPayments.status, 'pending'),
          sql`${scheduledPayments.scheduledDate} < NOW()`
        )
      );

    const refundsResult = await db
      .select({
        totalRefunded: sql<number>`COALESCE(SUM(${refunds.amount}), 0)::integer`,
        refundCount: sql<number>`COUNT(*)::integer`,
      })
      .from(refunds)
      .where(
        and(
          eq(refunds.schoolId, schoolId),
          eq(refunds.status, 'completed')
        )
      );

    const activePaymentPlansResult = await db
      .select({
        activePlans: sql<number>`COUNT(*)::integer`,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
          sql`effective_balance > 0`
        )
      );

    const totalEnrollmentsResult = await db
      .select({
        count: sql<number>`COUNT(*)::integer`,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(eq(programEnrollments.status, 'cancelled'))
        )
      );

    const totalCompedResult = await db
      .select({
        totalComped: sql<number>`COALESCE(SUM(${programEnrollments.compAmountCents}), 0)::integer`,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.schoolId, schoolId));

    res.json({
      summary: {
        totalRevenueCents: completedPaymentsResult[0]?.totalRevenue || 0,
        last30DaysRevenueCents: last30DaysRevenueResult[0]?.revenue || 0,
        ytdRevenueCents: ytdRevenueResult[0]?.revenue || 0,
        totalPayments: completedPaymentsResult[0]?.paymentCount || 0,
        outstandingBalanceCents: outstandingBalancesResult[0]?.totalOutstanding || 0,
        overduePayments: overdueBalancesResult[0]?.overdueCount || 0,
        overdueAmountCents: overdueBalancesResult[0]?.overdueAmount || 0,
        totalRefundedCents: refundsResult[0]?.totalRefunded || 0,
        refundCount: refundsResult[0]?.refundCount || 0,
        activePaymentPlans: activePaymentPlansResult[0]?.activePlans || 0,
        totalEnrollments: totalEnrollmentsResult[0]?.count || 0,
        totalCompedCents: totalCompedResult[0]?.totalComped || 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
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

    const monthlyRevenue = await db
      .select({
        month: sql<string>`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`,
        revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
        paymentCount: sql<number>`COUNT(*)::integer`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.schoolId, schoolId),
          eq(payments.status, 'completed'),
          gte(payments.createdAt, startDate)
        )
      )
      .groupBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`);

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

    const db = await getDb();

    const outstandingPayments = await db
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
      .where(
        and(
          eq(scheduledPayments.schoolId, schoolId),
          eq(scheduledPayments.status, 'pending')
        )
      )
      .orderBy(scheduledPayments.scheduledDate);

    const enrichedBalances = await Promise.all(
      outstandingPayments.map(async (payment: typeof outstandingPayments[number]) => {
        let parentInfo: { id: number; name: string; email: string; phone: string | null } | null = null;
        let enrollmentInfo: { id: number; childName: string | null; className: string | null } | null = null;

        try {
          const parent = await storage.getUser(payment.parentId);
          if (parent) {
            parentInfo = {
              id: parent.id,
              name: parent.name || parent.email,
              email: parent.email,
              phone: parent.phone || null,
            };
          }
        } catch (e) {}

        let enrollmentRemainingBalance: number | undefined;
        try {
          const enrollment: any = await storage.getProgramEnrollmentById(payment.enrollmentId);
          if (enrollment) {
            enrollmentInfo = {
              id: enrollment.id,
              childName: enrollment.childName || null,
              className: enrollment.className || null,
            };
            // Use the DB-generated effective_balance (with fallback formula).
            // NEVER read enrollment.remainingBalance directly — it is intentionally
            // stored as 0 for Stripe-managed payment plans, which would make
            // outstanding scheduled payments incorrectly look fully paid here and
            // get auto-cancelled by the filter below.
            // (See asa-payment-patterns "Parent Payments page shows $0" pitfall.)
            enrollmentRemainingBalance =
              enrollment.effectiveBalance ??
              computeEffectiveBalance(
                enrollment.totalCost ?? 0,
                enrollment.totalPaid ?? 0,
                enrollment.compAmountCents ?? 0,
              );
          }
        } catch (e) {}

        const now = new Date();
        const isOverdue = new Date(payment.scheduledDate) < now;
        const daysOverdue = isOverdue 
          ? Math.floor((now.getTime() - new Date(payment.scheduledDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          ...payment,
          type: 'scheduled' as const,
          parent: parentInfo,
          enrollment: enrollmentInfo,
          enrollmentRemainingBalance,
          isOverdue,
          daysOverdue,
        };
      })
    );

    // Filter out scheduled payments where the enrollment is already fully paid.
    // Auto-heal any stale 'pending' records found — cancel them in the background.
    const filteredScheduled = enrichedBalances.filter(b => {
      const isFullyPaid = b.enrollmentRemainingBalance !== undefined && b.enrollmentRemainingBalance <= 0;
      if (isFullyPaid) {
        storage.updateScheduledPaymentStatus(b.id, 'cancelled').catch(() => {});
        return false;
      }
      return true;
    });

    // Also surface enrollments with outstanding balances that have NO pending scheduled payment.
    // These families owe money but are invisible to a scheduled-payments-only query.
    const enrollmentsWithBalance = await db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
          sql`effective_balance > 0`
        )
      );

    const coveredEnrollmentIds = new Set(outstandingPayments.map(p => p.enrollmentId));
    const unscheduledEnrollments = enrollmentsWithBalance.filter(e => !coveredEnrollmentIds.has(e.id));

    const enrichedUnscheduled = await Promise.all(
      unscheduledEnrollments.map(async (enrollment) => {
        let parentInfo: { id: number; name: string; email: string; phone: string | null } | null = null;
        try {
          const parent = await storage.getUser(enrollment.parentId);
          if (parent) {
            parentInfo = {
              id: parent.id,
              name: parent.name || parent.email,
              email: parent.email,
              phone: parent.phone || null,
            };
          }
        } catch (e) {}

        const amount = enrollment.totalCost - enrollment.totalPaid - (enrollment.compAmountCents ?? 0);

        return {
          id: -enrollment.id,
          enrollmentId: enrollment.id,
          parentId: enrollment.parentId,
          parentEmail: enrollment.parentEmail,
          amount,
          scheduledDate: null as string | null,
          installmentNumber: null as number | null,
          totalInstallments: null as number | null,
          status: 'unscheduled',
          reminderCount: null as number | null,
          lastReminderSentAt: null as string | null,
          type: 'unscheduled' as const,
          parent: parentInfo,
          enrollment: {
            id: enrollment.id,
            childName: enrollment.childName || null,
            className: enrollment.className || null,
          },
          enrollmentRemainingBalance: amount,
          isOverdue: false,
          daysOverdue: 0,
        };
      })
    );

    const validBalances: any[] = [...filteredScheduled, ...enrichedUnscheduled];

    type FamilyBalance = {
      parent: typeof validBalances[number]['parent'];
      parentEmail: string;
      totalOutstandingCents: number;
      overdueAmountCents: number;
      payments: typeof validBalances;
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
      acc[email].totalOutstandingCents += balance.amount;
      if (balance.isOverdue) {
        acc[email].overdueAmountCents += balance.amount;
      }
      acc[email].payments.push(balance);
      return acc;
    }, {});

    const summary = {
      totalOutstandingCents: validBalances.reduce((sum, b) => sum + b.amount, 0),
      overdueAmountCents: validBalances.filter(b => b.isOverdue).reduce((sum, b) => sum + b.amount, 0),
      totalPaymentsDue: validBalances.length,
      overduePayments: validBalances.filter(b => b.isOverdue).length,
      uniqueFamilies: Object.keys(byParent).length,
    };

    res.json({
      balances: validBalances,
      byFamily: Object.values(byParent),
      summary,
    });
  } catch (error) {
    console.error('Error fetching outstanding balances:', error);
    res.status(500).json({ error: 'Failed to fetch outstanding balances' });
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
      .where(eq(payments.schoolId, schoolId))
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

    const allTransactions = [...recentPayments.map((p: typeof recentPayments[number]) => ({
      ...p,
      enrollmentId: Array.isArray(p.enrollmentIds) && p.enrollmentIds.length > 0 
        ? (p.enrollmentIds as number[])[0] 
        : null,
    })), ...recentRefundsData]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit);

    const enrichedTransactions = await Promise.all(
      allTransactions.map(async (tx: any) => {
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
          } catch (e) {}
        }

        return {
          ...tx,
          enrollment: enrollmentInfo,
        };
      })
    );

    res.json({ transactions: enrichedTransactions });
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

    const conditions: any[] = [
      eq(programEnrollments.schoolId, schoolId),
      not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed'])),
    ];
    if (startDateParam) conditions.push(gte(classes.startDate, startDateParam));
    if (endDateParam) conditions.push(lte(classes.startDate, endDateParam));

    const rows = await db
      .select({
        className: programEnrollments.className,
        marketplaceClassId: programEnrollments.marketplaceClassId,
        totalCost: programEnrollments.totalCost,
        totalPaid: programEnrollments.totalPaid,
        remainingBalance: programEnrollments.remainingBalance,
        compAmountCents: programEnrollments.compAmountCents,
        classStartDate: classes.startDate,
        classEndDate: classes.endDate,
      })
      .from(programEnrollments)
      .leftJoin(classes, eq(programEnrollments.marketplaceClassId, classes.id))
      .where(and(...conditions));

    // Group by class name in JS (handles both school_class and marketplace types via denormalized className)
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
          classStartDate: row.classStartDate ?? null,
          classEndDate: row.classEndDate ?? null,
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
      entry.totalOutstandingCents += Math.max(0, (row.totalCost ?? 0) - (row.totalPaid ?? 0) - (row.compAmountCents ?? 0));
      entry.totalCompedCents += row.compAmountCents ?? 0;
    }

    const classList = Array.from(classMap.values()).sort((a, b) => {
      if (!a.classStartDate && !b.classStartDate) return a.className.localeCompare(b.className);
      if (!a.classStartDate) return 1;
      if (!b.classStartDate) return -1;
      return new Date(b.classStartDate).getTime() - new Date(a.classStartDate).getTime();
    });

    const totals = classList.reduce((acc, c) => ({
      totalExpectedCents: acc.totalExpectedCents + c.totalExpectedCents,
      totalCollectedCents: acc.totalCollectedCents + c.totalCollectedCents,
      totalOutstandingCents: acc.totalOutstandingCents + c.totalOutstandingCents,
      totalCompedCents: acc.totalCompedCents + c.totalCompedCents,
    }), { totalExpectedCents: 0, totalCollectedCents: 0, totalOutstandingCents: 0, totalCompedCents: 0 });

    res.json({ classes: classList, totals });
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

    const data = await storage.getAutoPayHistory(schoolId, { startDate, endDate, status: String(status) });

    return res.json(data);
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
        .where(eq(payments.schoolId, schoolId))
        .orderBy(desc(payments.createdAt));

      csvContent = 'Transaction ID,Amount,Status,Payment Method,Date,Child Name,Class,Parent Email\n';
      csvContent += paymentsData.map((p: typeof paymentsData[number]) => {
        const amountDollars = p.amount != null ? `$${(p.amount / 100).toFixed(2)}` : '$0.00';
        return `${p.id},${amountDollars},${p.status},${p.paymentMethod || 'N/A'},${p.createdAt?.toISOString() || 'N/A'},${p.childName || 'N/A'},${p.className || 'N/A'},${p.parentEmail || 'N/A'}`;
      }).join('\n');

      filename = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (reportType === 'outstanding') {
      // Get outstanding scheduled payments with user phone numbers via left join
      const outstandingData = await db
        .select({
          id: scheduledPayments.id,
          parentEmail: scheduledPayments.parentEmail,
          amount: scheduledPayments.amount,
          scheduledDate: scheduledPayments.scheduledDate,
          installmentNumber: scheduledPayments.installmentNumber,
          totalInstallments: scheduledPayments.totalInstallments,
          status: scheduledPayments.status,
          reminderCount: scheduledPayments.reminderCount,
          phone: users.phone,
        })
        .from(scheduledPayments)
        .leftJoin(users, eq(scheduledPayments.parentEmail, users.email))
        .where(
          and(
            eq(scheduledPayments.schoolId, schoolId),
            eq(scheduledPayments.status, 'pending')
          )
        )
        .orderBy(scheduledPayments.scheduledDate);

      // Get last payment date for each parent email
      const lastPaymentsByParent = await db
        .select({
          parentEmail: payments.parentEmail,
          lastPaymentDate: sql<Date>`MAX(${payments.createdAt})`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.schoolId, schoolId),
            eq(payments.status, 'completed')
          )
        )
        .groupBy(payments.parentEmail);

      // Create a lookup map for last payment dates
      const lastPaymentMap = new Map<string, Date | null>(
        lastPaymentsByParent.map((p: any) => [p.parentEmail, p.lastPaymentDate])
      );

      csvContent = 'Payment ID,Parent Email,Phone,Amount,Scheduled Date,Next Payment Date,Last Payment Date,Installment,Total Installments,Status,Reminders Sent\n';
      csvContent += outstandingData.map((o: typeof outstandingData[number]) => {
        const lastPayment = o.parentEmail ? lastPaymentMap.get(o.parentEmail) : null;
        const lastPaymentStr = lastPayment ? new Date(lastPayment).toISOString().split('T')[0] : 'N/A';
        const nextPaymentStr = o.scheduledDate ? new Date(o.scheduledDate).toISOString().split('T')[0] : 'N/A';
        const phoneStr = o.phone || 'N/A';
        const amountDollars = o.amount != null ? `$${(o.amount / 100).toFixed(2)}` : '$0.00';
        return `${o.id},${o.parentEmail},${phoneStr},${amountDollars},${o.scheduledDate?.toISOString() || 'N/A'},${nextPaymentStr},${lastPaymentStr},${o.installmentNumber},${o.totalInstallments},${o.status},${o.reminderCount}`;
      }).join('\n');

      filename = `outstanding_balances_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (reportType === 'autopay') {
      const now = new Date();
      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const { records } = await storage.getAutoPayHistory(schoolId, { startDate, endDate, status: 'all' });

      csvContent = 'Date Charged,Parent Name,Parent Email,Child,Class,Installment,Amount ($),Status,Failure Reason,Stripe PI ID\n';
      csvContent += records.map((r: any) => {
        const dateStr = r.processedAt ? new Date(r.processedAt).toISOString() : new Date(r.scheduledDate).toISOString().split('T')[0];
        const parentName = [r.parentFirstName, r.parentLastName].filter(Boolean).join(' ') || 'N/A';
        const amountDollars = r.amount != null ? (r.amount / 100).toFixed(2) : '0.00';
        const installment = `${r.installmentNumber || 1} of ${r.totalInstallments || 1}`;
        const failureReason = (r.failureReason || '').replace(/,/g, ';');
        return `${dateStr},"${parentName}",${r.parentEmail || 'N/A'},"${r.childName || 'N/A'}","${r.className || 'N/A'}","${installment}",${amountDollars},${r.status},"${failureReason}",${r.stripePaymentIntentId || 'N/A'}`;
      }).join('\n');

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

    const summaryResult = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
        paymentCount: sql<number>`COUNT(*)::integer`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.schoolId, schoolId),
          eq(payments.status, 'completed')
        )
      );

    const outstandingResult = await db
      .select({
        outstanding: sql<number>`COALESCE(SUM(effective_balance), 0)::integer`,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
          sql`effective_balance > 0`
        )
      );

    const enrollmentCountResult = await db
      .select({
        count: sql<number>`COUNT(*)::integer`,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed']))
        )
      );

    const paymentPlansResult = await db
      .select({
        parentEmail: scheduledPayments.parentEmail,
        totalAmount: sql<number>`SUM(${scheduledPayments.amount})::integer`,
        paidAmount: sql<number>`SUM(CASE WHEN ${scheduledPayments.status} = 'completed' THEN ${scheduledPayments.amount} ELSE 0 END)::integer`,
        totalInstallments: sql<number>`MAX(${scheduledPayments.totalInstallments})::integer`,
        completedInstallments: sql<number>`COUNT(CASE WHEN ${scheduledPayments.status} = 'completed' THEN 1 END)::integer`,
      })
      .from(scheduledPayments)
      .where(eq(scheduledPayments.schoolId, schoolId))
      .groupBy(scheduledPayments.parentEmail);

    const totalPlans = paymentPlansResult.length;
    let avgProgress = 0;
    if (totalPlans > 0) {
      const totalProgress = paymentPlansResult.reduce((sum, plan) => {
        const progress = plan.totalAmount > 0 ? (plan.paidAmount / plan.totalAmount) * 100 : 0;
        return sum + progress;
      }, 0);
      avgProgress = totalProgress / totalPlans;
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const revenueTrendsResult = await db
      .select({
        month: sql<string>`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`,
        revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.schoolId, schoolId),
          eq(payments.status, 'completed'),
          gte(payments.createdAt, sixMonthsAgo)
        )
      )
      .groupBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${payments.createdAt}, 'YYYY-MM')`);

    const now = new Date();
    const outstandingBalancesResult = await db
      .select({
        parentEmail: scheduledPayments.parentEmail,
        amount: sql<number>`SUM(${scheduledPayments.amount})::integer`,
        scheduledDate: sql<Date>`MIN(${scheduledPayments.scheduledDate})`,
      })
      .from(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.schoolId, schoolId),
          eq(scheduledPayments.status, 'pending')
        )
      )
      .groupBy(scheduledPayments.parentEmail);

    const summary = {
      totalRevenue: summaryResult[0]?.totalRevenue || 0,
      totalCollected: summaryResult[0]?.totalRevenue || 0,
      outstandingBalance: (outstandingResult[0] as any)?.outstanding || 0,
      paymentPlanProgress: avgProgress,
      enrollmentCount: enrollmentCountResult[0]?.count || 0,
      averagePaymentAmount: summaryResult[0]?.paymentCount > 0 
        ? Math.round((summaryResult[0]?.totalRevenue || 0) / summaryResult[0].paymentCount) 
        : 0,
    };

    const revenueTrends = revenueTrendsResult.map((r: typeof revenueTrendsResult[number]) => ({
      month: r.month,
      revenue: r.revenue,
      collected: r.revenue,
    }));

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
          sql`effective_balance > 0`
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

router.post('/reconcile-scheduled-payments', async (req: any, res) => {
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

    // Fetch accurate financial summary to inject as context
    const [revenueResult, outstandingResult, overdueResult, enrollmentResult, ytdResult] = await Promise.all([
      db.select({
        totalRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
        paymentCount: sql<number>`COUNT(*)::integer`,
      }).from(payments).where(and(eq(payments.schoolId, schoolId), eq(payments.status, 'completed'))),

      db.select({
        outstanding: sql<number>`COALESCE(SUM(effective_balance), 0)::integer`,
        activeCount: sql<number>`COUNT(*)::integer`,
      }).from(programEnrollments).where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
          sql`effective_balance > 0`
        )
      ),

      db.select({
        overdueAmount: sql<number>`COALESCE(SUM(${scheduledPayments.amount}), 0)::integer`,
        overdueCount: sql<number>`COUNT(*)::integer`,
      }).from(scheduledPayments).where(
        and(eq(scheduledPayments.schoolId, schoolId), eq(scheduledPayments.status, 'pending'), sql`${scheduledPayments.scheduledDate} < NOW()`)
      ),

      db.select({ count: sql<number>`COUNT(*)::integer` }).from(programEnrollments).where(
        and(eq(programEnrollments.schoolId, schoolId), not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed'])))
      ),

      db.select({
        ytdRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)::integer`,
      }).from(payments).where(
        and(eq(payments.schoolId, schoolId), eq(payments.status, 'completed'), gte(payments.createdAt, new Date(new Date().getFullYear(), 0, 1)))
      ),
    ]);

    const totalRevenue = revenueResult[0]?.totalRevenue || 0;
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
- YTD Revenue (${new Date().getFullYear()}): $${((ytdResult[0]?.ytdRevenue || 0) / 100).toFixed(2)}
- Outstanding Balance (all active enrollments): $${(outstandingBalance / 100).toFixed(2)}
- Overdue Amount: $${((overdueResult[0]?.overdueAmount || 0) / 100).toFixed(2)} (${overdueResult[0]?.overdueCount || 0} overdue installments)
- Active Enrollments with Balance: ${(outstandingResult[0] as any)?.activeCount || 0}
- Total Active Enrollments: ${activeEnrollments}
- Collection Rate: ${collectionRate}%
- Total Payments Processed: ${revenueResult[0]?.paymentCount || 0}

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
          pe.effective_balance AS "effectiveBalance",
          pe.payment_status    AS "paymentStatus",
          pe.status,
          pe.child_name        AS "childName",
          pe.class_name        AS "className",
          u.name               AS "parentName",
          CASE
            WHEN pe.effective_balance < 0                                   THEN 'overpaid'
            WHEN pe.status = 'completed' AND pe.effective_balance > 0      THEN 'still_owes'
            WHEN pe.remaining_balance = 0 AND pe.effective_balance > 0     THEN 'mismatch'
            ELSE 'ok'
          END AS flag
        FROM program_enrollments pe
        LEFT JOIN users u ON pe.parent_id = u.id
        WHERE pe.school_id = ${schoolId}
          AND pe.status NOT IN ('cancelled', 'withdrawn', 'failed', 'waitlist')
        ORDER BY
          CASE
            WHEN pe.effective_balance < 0                                   THEN 1
            WHEN pe.status = 'completed' AND pe.effective_balance > 0      THEN 2
            WHEN pe.remaining_balance = 0 AND pe.effective_balance > 0     THEN 3
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

export default router;

