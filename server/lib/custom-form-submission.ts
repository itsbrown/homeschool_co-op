import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  customFormFields,
  customFormSubmissions,
  schools,
  users,
  type CustomForm,
} from '@shared/schema';
import { sendEmail } from './email-service';

export type FormSettings = {
  requireAuth?: boolean;
  allowMultipleSubmissions?: boolean;
  showProgressBar?: boolean;
  confirmationMessage?: string;
  redirectUrl?: string | null;
  notifyOnSubmission?: boolean;
  notificationEmails?: string[];
  sendSubmitterConfirmation?: boolean;
};

export function getFormSettings(form: CustomForm): FormSettings {
  return (form.settings as FormSettings) || {};
}

/** Returns an error message if honeypot / required / duplicate checks fail. */
export async function validateFormSubmission(opts: {
  form: CustomForm;
  responseData: Record<string, unknown>;
  submitterEmail?: string | null;
  ipAddress?: string | null;
  honeypot?: string | null;
}): Promise<string | null> {
  const { form, responseData, submitterEmail, ipAddress, honeypot } = opts;

  if (honeypot && String(honeypot).trim() !== '') {
    return 'Submission rejected';
  }

  const db = await getDb();
  const fields = await db
    .select()
    .from(customFormFields)
    .where(eq(customFormFields.formId, form.id));

  for (const field of fields) {
    if (!field.isRequired) continue;
    const value = responseData[`field_${field.id}`];
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'boolean' && value === false && field.fieldType === 'checkbox');
    if (empty) {
      return `Required field missing: ${field.label}`;
    }
  }

  const settings = getFormSettings(form);
  if (settings.allowMultipleSubmissions === false) {
    const email = submitterEmail?.trim().toLowerCase();
    if (email) {
      const existing = await db
        .select({ id: customFormSubmissions.id })
        .from(customFormSubmissions)
        .where(
          and(
            eq(customFormSubmissions.formId, form.id),
            eq(customFormSubmissions.submitterEmail, email),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        return 'You have already submitted this form';
      }
    } else if (ipAddress) {
      const existing = await db
        .select({ id: customFormSubmissions.id })
        .from(customFormSubmissions)
        .where(
          and(
            eq(customFormSubmissions.formId, form.id),
            eq(customFormSubmissions.ipAddress, ipAddress),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        return 'You have already submitted this form';
      }
    }
  }

  return null;
}

async function resolveNotificationEmails(form: CustomForm): Promise<string[]> {
  const settings = getFormSettings(form);
  const configured = (settings.notificationEmails || []).filter(Boolean);
  if (configured.length > 0) return configured;

  const db = await getDb();
  const [school] = await db
    .select({ adminId: schools.adminId, name: schools.name })
    .from(schools)
    .where(eq(schools.id, form.schoolId));
  if (!school?.adminId) return [];

  const [admin] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, school.adminId));
  return admin?.email ? [admin.email] : [];
}

export async function sendFormSubmissionNotifications(opts: {
  form: CustomForm;
  submissionId: number;
  submitterEmail?: string | null;
  submitterName?: string | null;
  responseData: Record<string, unknown>;
}): Promise<void> {
  const { form, submissionId, submitterEmail, submitterName, responseData } = opts;
  const settings = getFormSettings(form);
  const confirmationMessage =
    settings.confirmationMessage || 'Thank you for your submission!';

  if (settings.notifyOnSubmission) {
    const recipients = await resolveNotificationEmails(form);
    const summary = Object.entries(responseData)
      .map(([key, value]) => {
        const display =
          typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : String(value ?? '');
        return `<li><strong>${key}:</strong> ${display}</li>`;
      })
      .join('');

    for (const to of recipients) {
      await sendEmail(
        to,
        'School Admin',
        `New form submission: ${form.title}`,
        `<div style="font-family:Arial,sans-serif">
          <h2>New submission for ${form.title}</h2>
          <p>Submission #${submissionId}</p>
          <p>From: ${submitterName || 'Unknown'} (${submitterEmail || 'no email'})</p>
          <ul>${summary}</ul>
        </div>`,
        `New submission for ${form.title} (#${submissionId}) from ${submitterName || 'Unknown'}`,
        'form_submission_admin',
      );
    }
  }

  if (settings.sendSubmitterConfirmation && submitterEmail) {
    await sendEmail(
      submitterEmail,
      submitterName || 'Applicant',
      `Confirmation: ${form.title}`,
      `<div style="font-family:Arial,sans-serif">
        <h2>${form.title}</h2>
        <p>${confirmationMessage}</p>
      </div>`,
      confirmationMessage,
      'form_submission_confirmation',
    );
  }
}
