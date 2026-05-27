import { storage } from '../storage';
import { calculateCheckoutBiweeklySchedule } from './payment-calculator';
import { resolveEnrollmentIdsFromScheduledRow } from './scheduled-payment-intent-metadata';

export type UpcomingPaymentRow = {
  id: number | string;
  amount: number;
  dueDate: Date | string;
  description: string;
  paymentPlan: string;
  status: string;
  installmentNumber: number;
  totalInstallments: number;
  enrollmentId?: number | null;
  className: string;
  childName: string;
  retryCount?: number;
  failureReason?: string | null;
  overdue?: boolean;
  isCheckoutDue?: boolean;
  checkoutPaymentIntentId?: string;
};

async function bundleHasPaidFirstInstallment(enrollmentIds: number[]): Promise<boolean> {
  for (const id of enrollmentIds) {
    const enrollment = await storage.getEnrollmentById(id);
    if ((enrollment?.totalPaid ?? 0) > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Installment 1 is collected at checkout (Stripe PI), not stored in scheduled_payments.
 * Surface it here when checkout was started but not paid yet.
 */
export async function buildCheckoutFirstInstallmentDueRows(
  parentEmail: string,
): Promise<UpcomingPaymentRow[]> {
  const allEnrollments = await storage.getAllEnrollments?.();
  if (!allEnrollments?.length) return [];

  const parentRows = allEnrollments.filter(
    (e: any) =>
      String(e.parentEmail ?? '').toLowerCase() === parentEmail.toLowerCase() &&
      e.status === 'pending_payment' &&
      (e.totalPaid ?? 0) === 0,
  );

  const byGroup = new Map<string, any[]>();
  for (const row of parentRows) {
    const meta = row.metadata as Record<string, unknown> | null | undefined;
    const piId = meta?.initialPaymentIntentId;
    const plan =
      row.paymentPlan === 'biweekly' ||
      String(meta?.paymentPlan ?? '').toLowerCase() === 'biweekly';
    if (!plan) continue;

    const groupKey =
      typeof piId === 'string' && piId.startsWith('pi_')
        ? piId
        : `pending-checkout-${row.id}`;

    if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
    byGroup.get(groupKey)!.push(row);
  }

  const out: UpcomingPaymentRow[] = [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  for (const [groupKey, rows] of byGroup.entries()) {
    const piId = groupKey.startsWith('pi_') ? groupKey : undefined;
    if (piId) {
      const existingPayment = await storage.getPaymentByStripeId(piId);
      if (
        existingPayment &&
        (existingPayment.status === 'completed' || existingPayment.status === 'succeeded')
      ) {
        continue;
      }
    }

    const totalCost = rows.reduce(
      (sum: number, r: any) => sum + (r.totalCost ?? 0),
      0,
    );
    let programEnd: Date | null = null;
    for (const r of rows) {
      if (!r.programEndDate) continue;
      const d = new Date(r.programEndDate);
      if (!isNaN(d.getTime()) && (!programEnd || d > programEnd)) {
        programEnd = d;
      }
    }

    let firstPaymentAmount = totalCost;
    if (programEnd) {
      const schedule = calculateCheckoutBiweeklySchedule(
        totalCost,
        new Date(),
        programEnd,
      );
      firstPaymentAmount = schedule.firstPaymentAmount;
    }

    const first = rows[0];
    const childNames = [...new Set(rows.map((r: any) => r.childName).filter(Boolean))];
    const classLabel =
      rows.length > 1
        ? `${rows.length} class enrollments`
        : (first.className ?? 'Class');

    out.push({
      id: `checkout-${groupKey}`,
      amount: firstPaymentAmount,
      dueDate: startOfToday,
      description: `Complete checkout — ${classLabel}`,
      paymentPlan: '',
      status: 'checkout_due',
      installmentNumber: 0,
      totalInstallments: 0,
      enrollmentId: first.id,
      className: classLabel,
      childName: childNames.join(', '),
      retryCount: 0,
      failureReason: null,
      overdue: false,
      isCheckoutDue: true,
      checkoutPaymentIntentId: piId,
    });
  }

  return out;
}

/** Hide installments 2+ until installment 1 has been paid for that bundle. */
export async function filterScheduledPaymentsUntilFirstPaid(
  scheduledRows: any[],
): Promise<any[]> {
  const kept: any[] = [];
  for (const payment of scheduledRows) {
    const ids = resolveEnrollmentIdsFromScheduledRow(payment);
    if (await bundleHasPaidFirstInstallment(ids)) {
      kept.push(payment);
    }
  }
  return kept;
}
