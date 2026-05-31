import { storage } from '../storage';
import {
  buildFamilyBalanceEmailPayload,
  getParentPaymentDeepLink,
  type FamilyBalanceEmailPayload,
  type FamilyBalanceLineItem,
} from './family-balance-email';
import { sendEmail } from './email-service';

export type AccountCorrectionEmailOptions = {
  schoolId: number;
  parentEmail: string;
  parentName: string;
  correctionSummary: string[];
  sentByUserId?: number;
};

export type AccountCorrectionEmailPreview = {
  subject: string;
  htmlContent: string;
  textContent: string;
  balancePayload: FamilyBalanceEmailPayload | null;
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function renderBalanceTable(payments: FamilyBalanceLineItem[]): string {
  return payments
    .map((p) => {
      const isMembership = p.kind === 'membership';
      const isUnscheduled = p.kind === 'unscheduled' || (!isMembership && p.dueDate === null);
      const dueDateCell =
        isUnscheduled || !p.dueDate ? '&mdash;' : formatDate(p.dueDate);
      let statusPill: string;
      if (isMembership) {
        statusPill =
          '<span style="background-color: #DBEAFE; color: #1E40AF; padding: 2px 8px; border-radius: 4px; font-size: 12px;">Membership</span>';
      } else if (isUnscheduled) {
        statusPill =
          '<span style="background-color: #E0E7FF; color: #3730A3; padding: 2px 8px; border-radius: 4px; font-size: 12px;">No Plan</span>';
      } else if (p.isOverdue) {
        statusPill = `<span style="background-color: #FEE2E2; color: #991B1B; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${p.daysOverdue}d overdue</span>`;
      } else {
        statusPill =
          '<span style="background-color: #FEF3C7; color: #92400E; padding: 2px 8px; border-radius: 4px; font-size: 12px;">Pending</span>';
      }
      return `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 12px 8px;">${p.childName}</td>
        <td style="padding: 12px 8px;">${p.className}</td>
        <td style="padding: 12px 8px;">${dueDateCell}</td>
        <td style="padding: 12px 8px; text-align: right; font-weight: 500;">${formatCurrency(p.amountCents)}</td>
        <td style="padding: 12px 8px; text-align: center;">${statusPill}</td>
      </tr>
    `;
    })
    .join('');
}

function renderBalanceTextRows(payments: FamilyBalanceLineItem[]): string {
  return payments
    .map((p) => {
      const isMembership = p.kind === 'membership';
      const isUnscheduled = p.kind === 'unscheduled' || (!isMembership && p.dueDate === null);
      const dueText = isMembership
        ? p.dueDate
          ? `Due: ${formatDate(p.dueDate)}`
          : 'Membership'
        : isUnscheduled || !p.dueDate
          ? 'No Plan'
          : `Due: ${formatDate(p.dueDate)}`;
      const overdueSuffix =
        !isUnscheduled && !isMembership && p.isOverdue ? ` (${p.daysOverdue} days overdue)` : '';
      return `- ${p.childName} | ${p.className} | ${dueText} | ${formatCurrency(p.amountCents)}${overdueSuffix}`;
    })
    .join('\n');
}

/**
 * Build subject + HTML/text for an account correction notice.
 * Uses the same balance line items as collections reminders when a balance exists.
 */
export async function buildAccountCorrectionEmailPreview(
  options: AccountCorrectionEmailOptions,
): Promise<AccountCorrectionEmailPreview> {
  const { schoolId, parentEmail, parentName, correctionSummary } = options;
  const balancePayload = await buildFamilyBalanceEmailPayload(schoolId, parentEmail);
  const school = await storage.getSchool(schoolId);
  const schoolName = balancePayload?.schoolName || school?.name || 'American Seekers Academy';
  const paymentUrl = getParentPaymentDeepLink({ schoolId, source: 'account_correction' });

  const summaryHtml = correctionSummary
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 12px 0; color: #374151;">${paragraph}</p>`,
    )
    .join('');
  const summaryText = correctionSummary.map((p) => `- ${p}`).join('\n');

  const hasBalance = balancePayload != null && balancePayload.lineItems.length > 0;
  const totalAmountCents = balancePayload?.totalAmountCents ?? 0;
  const hasOverdue = (balancePayload?.overdueCount ?? 0) > 0;

  const subject = hasBalance
    ? `Account Update: Your balance is now ${formatCurrency(totalAmountCents)} — ${schoolName}`
    : `Account Update: Your billing records have been corrected — ${schoolName}`;

  const balanceSection = hasBalance
    ? `
            <div style="background-color: ${hasOverdue ? '#FEF2F2' : '#EFF6FF'}; border-left: 4px solid ${hasOverdue ? '#DC2626' : '#3B82F6'}; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
              <div>
                <p style="margin: 0; font-size: 14px; color: #6B7280;">Current Amount Due</p>
                <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: bold; color: ${hasOverdue ? '#DC2626' : '#4F46E5'};">${formatCurrency(totalAmountCents)}</p>
              </div>
            </div>

            <h3 style="margin: 24px 0 16px 0; color: #374151;">Current Balance Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background-color: #F3F4F6;">
                  <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Child</th>
                  <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Class</th>
                  <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Due Date</th>
                  <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Amount</th>
                  <th style="padding: 12px 8px; text-align: center; font-weight: 600;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${renderBalanceTable(balancePayload!.lineItems)}
              </tbody>
              <tfoot>
                <tr style="background-color: #F9FAFB;">
                  <td colspan="3" style="padding: 12px 8px; font-weight: bold;">Total</td>
                  <td style="padding: 12px 8px; text-align: right; font-weight: bold; font-size: 16px; color: ${hasOverdue ? '#DC2626' : '#4F46E5'};">${formatCurrency(totalAmountCents)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
    `
    : `
            <div style="background-color: #ECFDF5; border-left: 4px solid #059669; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #065F46;">Your account is currently paid in full.</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #047857;">No outstanding tuition or membership balance is showing at this time.</p>
            </div>
    `;

  const balanceTextSection = hasBalance
    ? `
Current Amount Due: ${formatCurrency(totalAmountCents)}

Balance Details:
${renderBalanceTextRows(balancePayload!.lineItems)}
`
    : `
Your account is currently paid in full — no outstanding balance is showing.
`;

  const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto;">
          <div style="background-color: #059669; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0;">Account Update</h1>
            <p style="color: #A7F3D0; margin: 8px 0 0 0;">${schoolName}</p>
          </div>

          <div style="padding: 24px;">
            <p>Hello ${parentName},</p>

            <p>We reviewed your account and corrected several billing records so your balance and payment history are accurate. Here is a summary of what we updated:</p>

            <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin: 20px 0;">
              ${summaryHtml}
            </div>

            ${balanceSection}

            <h3 style="margin: 28px 0 12px 0; color: #374151;">How to Pay</h3>
            <p style="margin: 0 0 12px 0; color: #374151;">
              Sign in to your parent account and open the billing page to pay online with a card.
              You can pay the full balance or make a partial payment toward any enrollment.
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${paymentUrl}"
                 style="background-color: #4F46E5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Sign In &amp; Pay Online
              </a>
              <p style="margin: 12px 0 0 0; font-size: 13px; color: #6B7280;">
                You may be asked to sign in first; then you can pay from your billing page.
              </p>
            </div>

            <p style="color: #6B7280; font-size: 14px;">
              If anything in this summary does not look right, or you need help setting up a payment plan,
              please reply to this email or contact us at
              <a href="mailto:support@americanseekersacademy.com" style="color: #4F46E5;">support@americanseekersacademy.com</a>.
            </p>

            <div style="margin-top: 32px; text-align: center; color: #6B7280; font-size: 14px;">
              <p>Thank you for being part of ${schoolName}!</p>
              <p style="margin-top: 16px; font-size: 12px;">
                © 2026 ${schoolName}. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

  const textContent = `
Account Update — ${schoolName}

Hello ${parentName},

We reviewed your account and corrected several billing records so your balance and payment history are accurate.

What we updated:
${summaryText}

${balanceTextSection}

How to Pay:
Sign in and open your billing page to pay online:
${paymentUrl}

If anything does not look right, contact us at support@americanseekersacademy.com.

Thank you for being part of ${schoolName}!
    `.trim();

  return {
    subject,
    htmlContent,
    textContent,
    balancePayload,
  };
}

/**
 * Send a parent-friendly account correction email with current balance + pay link.
 * Logs to payment_reminder_logs as reminderType `manual` with className `account_correction`
 * (schema CHECK does not include `account_correction` as a reminder_type value).
 */
export async function sendAccountCorrectionEmail(
  options: AccountCorrectionEmailOptions,
): Promise<{ success: boolean; subject: string; error?: string }> {
  const preview = await buildAccountCorrectionEmailPreview(options);
  const sent = await sendEmail(
    options.parentEmail,
    options.parentName,
    preview.subject,
    preview.htmlContent,
    preview.textContent,
    'account_correction',
  );

  if (!sent) {
    return {
      success: false,
      subject: preview.subject,
      error: process.env.BREVO_API_KEY ? 'Email delivery failed' : 'Brevo not configured (BREVO_API_KEY missing)',
    };
  }

  const amountCents = preview.balancePayload?.totalAmountCents ?? 0;
  const lineCount = preview.balancePayload?.lineItems.length ?? 0;

  try {
    await storage.createPaymentReminderLog({
      schoolId: options.schoolId,
      scheduledPaymentId: null,
      parentEmail: options.parentEmail,
      parentName: options.parentName,
      childName: lineCount > 0 ? `${lineCount} item(s)` : 'paid in full',
      className: 'account_correction',
      amountCents,
      reminderType: 'manual',
      status: 'sent',
      isManual: true,
      sentBy: options.sentByUserId ?? null,
      errorMessage: null,
    });
  } catch (logErr) {
    console.error('[AccountCorrection] Payment reminder log failed (email was sent):', logErr);
  }

  return { success: true, subject: preview.subject };
}
