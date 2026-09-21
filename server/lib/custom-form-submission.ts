import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  customFormFields,
  customFormSubmissions,
  locations,
  schools,
  users,
  type CustomForm,
} from '@shared/schema';
import { resolveProfileNamesFromUser } from '@shared/auth-register';
import {
  inferAutoFillKey,
  type FormPrefill,
} from '@shared/form-autofill';
import { sendEmail } from './email-service';

const FALLBACK_CAMPUS_OPTIONS = ['Brighton', 'Batavia', 'Canandaigua', 'Victor'] as const;

export type { FormPrefill } from '@shared/form-autofill';

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

/** Formats a response value for admin notification emails. */
export function formatSubmissionValueForEmail(value: unknown): string {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'fileName' in (value as object)
  ) {
    return String((value as { fileName: string }).fileName || 'attachment');
  }
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value ?? '');
}

type EmailSummaryField = {
  id: number;
  label: string;
  order: number;
};

/**
 * Builds HTML list items for the admin notification email using field labels
 * (questions) instead of raw keys like `field_90`.
 */
export function buildFormSubmissionEmailSummary(
  responseData: Record<string, unknown>,
  fields: EmailSummaryField[],
): string {
  const labelByKey: Record<string, string> = {};
  for (const field of fields) {
    labelByKey[`field_${field.id}`] = field.label;
  }

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);
  const usedKeys = new Set<string>();
  const items: string[] = [];

  for (const field of sortedFields) {
    const key = `field_${field.id}`;
    if (!(key in responseData)) continue;
    usedKeys.add(key);
    items.push(
      `<li><strong>${field.label}:</strong> ${formatSubmissionValueForEmail(responseData[key])}</li>`,
    );
  }

  for (const [key, value] of Object.entries(responseData)) {
    if (usedKeys.has(key)) continue;
    const label = labelByKey[key] || key;
    items.push(
      `<li><strong>${label}:</strong> ${formatSubmissionValueForEmail(value)}</li>`,
    );
  }

  return items.join('');
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
    const db = await getDb();
    const fields = await db
      .select({
        id: customFormFields.id,
        label: customFormFields.label,
        order: customFormFields.order,
      })
      .from(customFormFields)
      .where(eq(customFormFields.formId, form.id));
    const summary = buildFormSubmissionEmailSummary(responseData, fields);

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

export type FormFieldAutoFillRow = {
  id: number;
  fieldConfig: unknown;
  fieldType?: string | null;
  label?: string | null;
};

export function getFieldAutoFill(
  fieldConfig: unknown,
  field?: { fieldType?: string | null; label?: string | null },
): string | null {
  return inferAutoFillKey({
    fieldConfig,
    fieldType: field?.fieldType,
    label: field?.label,
  });
}

export function applySubmitterAutoFill(opts: {
  fields: FormFieldAutoFillRow[];
  responseData: Record<string, unknown>;
  prefill: FormPrefill;
}): Record<string, unknown> {
  const next = { ...opts.responseData };
  for (const field of opts.fields) {
    const key = inferAutoFillKey({
      fieldConfig: field.fieldConfig,
      fieldType: field.fieldType,
      label: field.label,
    });
    if (!key) continue;
    const value = opts.prefill[key];
    if (value != null && String(value).trim() !== '') {
      next[`field_${field.id}`] = value;
    }
  }
  return next;
}

export async function buildSubmitterPrefill(user: {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  memberId?: string | null;
  phone?: string | null;
  locationId?: number | null;
}): Promise<FormPrefill> {
  const names = resolveProfileNamesFromUser(user);
  let locationName: string | null = null;
  if (user.locationId) {
    const db = await getDb();
    const [campus] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, user.locationId))
      .limit(1);
    locationName = campus?.name ?? null;
  }
  return {
    memberId: user.memberId?.trim() || null,
    firstName: names.firstName,
    lastName: names.lastName,
    fullName: names.displayName,
    email: user.email?.trim() || '',
    phone: user.phone?.trim() || null,
    location: locationName,
  };
}

export async function enrichFieldsWithSchoolLocations<
  T extends { fieldConfig: unknown },
>(schoolId: number, fields: T[]): Promise<T[]> {
  const needsLocations = fields.some((field) => {
    const cfg = field.fieldConfig as { source?: string } | null;
    return cfg?.source === 'school_locations';
  });
  if (!needsLocations) return fields;

  const db = await getDb();
  const rows = await db
    .select({ name: locations.name })
    .from(locations)
    .where(and(eq(locations.schoolId, schoolId), eq(locations.isActive, true)))
    .orderBy(locations.name);
  const names = rows.map((r) => r.name).filter(Boolean);
  const options = names.length > 0 ? names : [...FALLBACK_CAMPUS_OPTIONS];

  return fields.map((field) => {
    const cfg = (field.fieldConfig || {}) as Record<string, unknown>;
    if (cfg.source !== 'school_locations') return field;
    return {
      ...field,
      fieldConfig: { ...cfg, options },
    };
  });
}
