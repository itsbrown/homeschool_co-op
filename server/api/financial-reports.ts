import express from 'express';
import { storage } from '../storage';
import { getDb } from '../db';
import { payments, scheduledPayments, programEnrollments, users, refunds, schools } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull, not, inArray } from 'drizzle-orm';

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

      csvContent = 'Transaction ID,Amount (cents),Status,Payment Method,Date,Child Name,Class,Parent Email\n';
      csvContent += paymentsData.map((p: typeof paymentsData[number]) => 
        `${p.id},${p.amount},${p.status},${p.paymentMethod || 'N/A'},${p.createdAt?.toISOString() || 'N/A'},${p.childName || 'N/A'},${p.className || 'N/A'},${p.parentEmail || 'N/A'}`
      ).join('\n');

      filename = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (reportType === 'outstanding') {
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
        })
        .from(scheduledPayments)
        .where(
          and(
            eq(scheduledPayments.schoolId, schoolId),
            eq(scheduledPayments.status, 'pending')
          )
        )
        .orderBy(scheduledPayments.scheduledDate);

      csvContent = 'Payment ID,Parent Email,Amount (cents),Scheduled Date,Installment,Total Installments,Status,Reminders Sent\n';
      csvContent += outstandingData.map((o: typeof outstandingData[number]) => 
        `${o.id},${o.parentEmail},${o.amount},${o.scheduledDate?.toISOString() || 'N/A'},${o.installmentNumber},${o.totalInstallments},${o.status},${o.reminderCount}`
      ).join('\n');

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

export default router;
