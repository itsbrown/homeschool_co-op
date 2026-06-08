import { storage } from '../storage';
import { getParentPaymentDeepLink } from './family-balance-email';

export type FamilyReminderLineItem = {
  scheduledPaymentId: number;
  childName: string;
  className: string;
  amountCents: number;
  dueDate: Date;
  schoolId: number;
  schoolName: string;
};

export function groupReminderItemsByParent<T extends { parentEmail: string }>(
  items: T[],
  extraKey?: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = extraKey ? `${item.parentEmail}|${extraKey(item)}` : item.parentEmail;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

/**
 * Send one consolidated payment reminder email for a family (all line items in one table).
 */
export async function sendConsolidatedFamilyPaymentReminderEmail(params: {
  parentEmail: string;
  parentName?: string;
  lineItems: FamilyReminderLineItem[];
  daysUntilDue: number;
  schoolName?: string;
  paymentUrl?: string;
}): Promise<boolean> {
  const { parentEmail, lineItems, daysUntilDue } = params;
  if (lineItems.length === 0) return false;

  const parent = await storage.getUserByEmail(parentEmail);
  const parentName =
    params.parentName?.trim() ||
    (parent ? `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.trim() : '') ||
    'Parent';

  const schoolName =
    params.schoolName?.trim() ||
    lineItems[0]?.schoolName ||
    'American Seekers Academy';

  const schoolId = lineItems[0]?.schoolId ?? parent?.schoolId ?? 1;

  const payments = lineItems.map((item) => {
    const isOverdue = daysUntilDue < 0;
    return {
      childName: item.childName,
      className: item.className,
      amountCents: item.amountCents,
      dueDate: item.dueDate,
      isOverdue,
      daysOverdue: isOverdue ? Math.abs(daysUntilDue) : 0,
      kind: 'scheduled' as const,
    };
  });

  const totalAmountCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const overduePayments = payments.filter((p) => p.isOverdue);
  const overdueCount = overduePayments.length;
  const overdueAmountCents = overduePayments.reduce((sum, p) => sum + p.amountCents, 0);

  const paymentUrl =
    params.paymentUrl ??
    getParentPaymentDeepLink({ schoolId, source: 'scheduled_reminder' });

  const { sendConsolidatedPaymentReminder } = await import('./email-service');

  const sent = await sendConsolidatedPaymentReminder({
    parentEmail,
    parentName,
    schoolName,
    totalAmountCents,
    tuitionTotalCents: totalAmountCents,
    membershipTotalCents: 0,
    payments,
    overdueCount,
    overdueAmountCents,
    paymentUrl,
  });

  if (sent) {
    const reminderType =
      daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'due_today' : 'upcoming';
    try {
      await storage.createPaymentReminderLog({
        schoolId,
        scheduledPaymentId: lineItems.length === 1 ? lineItems[0]!.scheduledPaymentId : null,
        parentEmail,
        parentName,
        childName: `${lineItems.length} item(s)`,
        className: 'family_consolidated',
        amountCents: totalAmountCents,
        reminderType,
        status: 'sent',
        isManual: false,
        sentBy: null,
        errorMessage: null,
      });
    } catch (logErr) {
      console.error('[ConsolidatedReminder] Payment reminder log failed (email was sent):', logErr);
    }
  }

  return sent;
}
