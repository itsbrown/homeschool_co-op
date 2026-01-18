import express from 'express';
import { storage } from '../storage';
import { getDb } from '../db';
import { payments, scheduledPayments, programEnrollments, users, refunds, schools } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull, not, inArray } from 'drizzle-orm';
import { generateCFOInsights, isAIAvailable } from '../services/cfoInsightsService';
import { reconcileSchoolScheduledPayments, cleanupScheduledPayments } from '../services/scheduled-payment-reconciliation';

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

  if (user.role !== 'schoolAdmin' && user.role !== 'superAdmin') {
    return { error: 'Only school administrators can access financial reports', status: 403 };
  }

  if (!user.schoolId) {
    return { error: 'No school associated with this admin account', status: 400 };
  }

  const features = await storage.getSchoolFeatures(user.schoolId);
  if (!features[featureName]) {
    return { error: 'This feature is not enabled for your school. Please contact support to upgrade.', status: 403 };
  }

  return { user, schoolId: user.schoolId };
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
        totalOutstanding: sql<number>`COALESCE(SUM(${scheduledPayments.amount}), 0)::integer`,
        overdueCount: sql<number>`COUNT(CASE WHEN ${scheduledPayments.scheduledDate} < NOW() THEN 1 END)::integer`,
        overdueAmount: sql<number>`COALESCE(SUM(CASE WHEN ${scheduledPayments.scheduledDate} < NOW() THEN ${scheduledPayments.amount} ELSE 0 END), 0)::integer`,
      })
      .from(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.schoolId, schoolId),
          eq(scheduledPayments.status, 'pending')
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
        activePlans: sql<number>`COUNT(DISTINCT ${scheduledPayments.enrollmentId})::integer`,
      })
      .from(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.schoolId, schoolId),
          eq(scheduledPayments.status, 'pending')
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

    res.json({
      summary: {
        totalRevenueCents: completedPaymentsResult[0]?.totalRevenue || 0,
        last30DaysRevenueCents: last30DaysRevenueResult[0]?.revenue || 0,
        ytdRevenueCents: ytdRevenueResult[0]?.revenue || 0,
        totalPayments: completedPaymentsResult[0]?.paymentCount || 0,
        outstandingBalanceCents: outstandingBalancesResult[0]?.totalOutstanding || 0,
        overduePayments: outstandingBalancesResult[0]?.overdueCount || 0,
        overdueAmountCents: outstandingBalancesResult[0]?.overdueAmount || 0,
        totalRefundedCents: refundsResult[0]?.totalRefunded || 0,
        refundCount: refundsResult[0]?.refundCount || 0,
        activePaymentPlans: activePaymentPlansResult[0]?.activePlans || 0,
        totalEnrollments: totalEnrollmentsResult[0]?.count || 0,
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

        try {
          const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
          if (enrollment) {
            enrollmentInfo = {
              id: enrollment.id,
              childName: enrollment.childName || null,
              className: enrollment.className || null,
            };
          }
        } catch (e) {}

        const now = new Date();
        const isOverdue = new Date(payment.scheduledDate) < now;
        const daysOverdue = isOverdue 
          ? Math.floor((now.getTime() - new Date(payment.scheduledDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          ...payment,
          parent: parentInfo,
          enrollment: enrollmentInfo,
          isOverdue,
          daysOverdue,
        };
      })
    );

    type FamilyBalance = {
      parent: typeof enrichedBalances[number]['parent'];
      parentEmail: string;
      totalOutstandingCents: number;
      overdueAmountCents: number;
      payments: typeof enrichedBalances;
    };

    const byParent = enrichedBalances.reduce((acc: Record<string, FamilyBalance>, balance) => {
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
      totalOutstandingCents: enrichedBalances.reduce((sum, b) => sum + b.amount, 0),
      overdueAmountCents: enrichedBalances.filter(b => b.isOverdue).reduce((sum, b) => sum + b.amount, 0),
      totalPaymentsDue: enrichedBalances.length,
      overduePayments: enrichedBalances.filter(b => b.isOverdue).length,
      uniqueFamilies: Object.keys(byParent).length,
    };

    res.json({
      balances: enrichedBalances,
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
        outstanding: sql<number>`COALESCE(SUM(${scheduledPayments.amount}), 0)::integer`,
      })
      .from(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.schoolId, schoolId),
          eq(scheduledPayments.status, 'pending')
        )
      );

    const enrollmentCountResult = await db
      .select({
        count: sql<number>`COUNT(*)::integer`,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.schoolId, schoolId));

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
      outstandingBalance: outstandingResult[0]?.outstanding || 0,
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
      const enrollment = await storage.getEnrollmentById(payment.enrollmentId);
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

    if (outstandingPayments.length === 0) {
      return res.status(404).json({ error: 'No outstanding payments found for this parent' });
    }

    // Get school name
    const school = await storage.getSchool(schoolId);
    const schoolName = school?.name || 'School';

    // Get parent name
    const parent = await storage.getUserByEmail(parentEmail);
    const parentName = parent?.name || parentEmail.split('@')[0];

    // Enrich payments with enrollment details
    const now = new Date();
    const paymentDetails = await Promise.all(
      outstandingPayments.map(async (payment) => {
        let childName = 'Student';
        let className = 'Class';

        if (payment.enrollmentId) {
          const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
          if (enrollment) {
            childName = enrollment.childName || 'Student';
            className = enrollment.className || 'Class';
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
        };
      })
    );

    const totalAmountCents = paymentDetails.reduce((sum, p) => sum + p.amountCents, 0);
    const overduePayments = paymentDetails.filter(p => p.isOverdue);
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
        childName: `${outstandingPayments.length} children`,
        className: `${outstandingPayments.length} payments`,
        amountCents: totalAmountCents,
        reminderType: 'summary',
        status: 'sent',
        isManual: true,
        sentBy: user.id,
        errorMessage: null
      });

      console.log(`✅ Summary reminder sent to ${parentEmail} for ${outstandingPayments.length} payments`);
      res.json({ success: true, message: 'Summary reminder sent successfully', paymentCount: outstandingPayments.length });

    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
      
      // Log the failed attempt
      await storage.createPaymentReminderLog({
        schoolId,
        scheduledPaymentId: null,
        parentEmail,
        parentName,
        childName: `${outstandingPayments.length} children`,
        className: `${outstandingPayments.length} payments`,
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
    
    res.json({
      message: 'Preview of scheduled payment sync',
      summary: {
        enrollmentsToProcess: preview.enrollmentsProcessed,
        enrollmentsWithChanges: preview.enrollmentsWithChanges,
        paymentsToMarkCompleted: preview.totalPaymentsMarkedCompleted,
        duplicatesToRemove: cleanupPreview.duplicatesRemoved,
        orphansToRemove: cleanupPreview.orphansRemoved,
        excessToRemove: cleanupPreview.excessRemoved,
        totalToClean: cleanupPreview.duplicatesRemoved + cleanupPreview.orphansRemoved + cleanupPreview.excessRemoved,
      },
      details: preview.results,
      cleanupDetails: cleanupPreview.details,
      errors: preview.errors,
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
    
    res.json({
      message: 'Scheduled payment sync completed',
      summary: {
        enrollmentsProcessed: reconciliation.enrollmentsProcessed,
        enrollmentsWithChanges: reconciliation.enrollmentsWithChanges,
        paymentsMarkedCompleted: reconciliation.totalPaymentsMarkedCompleted,
        duplicatesRemoved: cleanup.duplicatesRemoved,
        orphansRemoved: cleanup.orphansRemoved,
        excessRemoved: cleanup.excessRemoved,
        totalCleaned: cleanup.duplicatesRemoved + cleanup.orphansRemoved + cleanup.excessRemoved,
      },
      details: reconciliation.results,
      cleanupDetails: cleanup.details,
      errors: reconciliation.errors,
    });
  } catch (error) {
    console.error('Error running reconciliation:', error);
    res.status(500).json({ error: 'Failed to run reconciliation' });
  }
});

export default router;
