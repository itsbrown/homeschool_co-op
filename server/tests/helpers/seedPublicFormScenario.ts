import { nanoid } from 'nanoid';
import { getDb } from '../../db';
import { customForms, customFormFields } from '@shared/schema';
import { TestDatabase } from './testDatabase';
import { storage } from '../../storage';

export type PublicFormScenarioSeed = {
  school: { id: number; name: string };
  admin: { id: number; email: string; password: string };
  publicForm: {
    id: number;
    slug: string;
    title: string;
    fieldIds: { fullName: number; email: number; resume: number; agree: number };
  };
  membersForm: { id: number; slug: string };
  /** Empty public form for editor / AI builder tests */
  emptyForm: { id: number; slug: string; title: string; isActive: boolean; accessLevel: string };
  /** Public form with notify + no multiple submissions for spam/notify tests */
  notifyForm: {
    id: number;
    slug: string;
    title: string;
    fieldIds: { fullName: number; email: number };
    notificationEmail: string;
  };
};

const ADMIN_PASSWORD = 'TestPassword123!';

/**
 * Seeds public + members-only custom forms for Playwright / API tests.
 * Also seeds emptyForm (editor) and notifyForm (notifications / spam).
 */
export async function seedPublicFormScenario(
  testDb: TestDatabase = new TestDatabase(),
): Promise<PublicFormScenarioSeed> {
  const db = await getDb();
  if (!db) {
    throw new Error('Postgres required (set DATABASE_URL)');
  }

  const uniqueId = nanoid(8).toLowerCase();
  const adminEmail = `form_admin_${uniqueId}@test.com`;
  const admin = await testDb.createTestUser({
    email: adminEmail,
    username: `formadmin_${uniqueId}`,
    name: 'Form E2E Admin',
    role: 'schoolAdmin',
    password: ADMIN_PASSWORD,
  });

  const school = await testDb.createTestSchool(admin.id, {
    name: `Form E2E School ${uniqueId}`,
    registrationCode: `FORM${uniqueId.toUpperCase()}`,
    status: 'active',
  });
  await storage.updateUser(admin.id, { schoolId: school.id });

  const publicSlug = `e2e-public-${uniqueId}`;
  const membersSlug = `e2e-members-${uniqueId}`;
  const emptySlug = `e2e-empty-${uniqueId}`;
  const notifySlug = `e2e-notify-${uniqueId}`;
  const notificationEmail = `notify_${uniqueId}@example.com`;

  const [publicForm] = await db
    .insert(customForms)
    .values({
      schoolId: school.id,
      title: 'E2E Public Form',
      description: 'Playwright public access test',
      slug: publicSlug,
      formType: 'custom',
      isActive: true,
      isTemplate: false,
      accessLevel: 'public',
      createdBy: admin.id,
      settings: {
        requireAuth: false,
        allowMultipleSubmissions: true,
        showProgressBar: false,
        confirmationMessage: 'E2E thank you',
        redirectUrl: null,
        notifyOnSubmission: false,
        notificationEmails: [],
        sendSubmitterConfirmation: false,
      },
    })
    .returning();

  const [nameField] = await db
    .insert(customFormFields)
    .values({
      formId: publicForm.id,
      fieldType: 'text',
      label: 'Full Name',
      isRequired: true,
      order: 0,
      fieldConfig: {},
      validationRules: {},
    })
    .returning();

  const [emailField] = await db
    .insert(customFormFields)
    .values({
      formId: publicForm.id,
      fieldType: 'email',
      label: 'Email',
      isRequired: true,
      order: 1,
      fieldConfig: {},
      validationRules: {},
    })
    .returning();

  const [resumeField] = await db
    .insert(customFormFields)
    .values({
      formId: publicForm.id,
      fieldType: 'file_upload',
      label: 'Resume (PDF)',
      isRequired: false,
      order: 2,
      fieldConfig: { accept: '.pdf,.doc,.docx' },
      validationRules: {},
    })
    .returning();

  const [agreeField] = await db
    .insert(customFormFields)
    .values({
      formId: publicForm.id,
      fieldType: 'checkbox',
      label: 'I agree to the terms',
      isRequired: true,
      order: 3,
      fieldConfig: {},
      validationRules: {},
    })
    .returning();

  const [membersForm] = await db
    .insert(customForms)
    .values({
      schoolId: school.id,
      title: 'E2E Members Form',
      slug: membersSlug,
      formType: 'custom',
      isActive: true,
      isTemplate: false,
      accessLevel: 'members',
      createdBy: admin.id,
      settings: {
        requireAuth: true,
        allowMultipleSubmissions: false,
        showProgressBar: false,
        confirmationMessage: 'Members only',
        redirectUrl: null,
        notifyOnSubmission: false,
        notificationEmails: [],
        sendSubmitterConfirmation: false,
      },
    })
    .returning();

  await db.insert(customFormFields).values({
    formId: membersForm.id,
    fieldType: 'text',
    label: 'Note',
    isRequired: false,
    order: 0,
    fieldConfig: {},
    validationRules: {},
  });

  const [emptyForm] = await db
    .insert(customForms)
    .values({
      schoolId: school.id,
      title: 'E2E Empty Editor Form',
      description: 'For field editor and AI builder tests',
      slug: emptySlug,
      formType: 'custom',
      isActive: false,
      isTemplate: false,
      accessLevel: 'members',
      createdBy: admin.id,
      settings: {
        requireAuth: false,
        allowMultipleSubmissions: true,
        showProgressBar: false,
        confirmationMessage: 'Thanks',
        redirectUrl: null,
        notifyOnSubmission: false,
        notificationEmails: [],
        sendSubmitterConfirmation: false,
      },
    })
    .returning();

  const [notifyForm] = await db
    .insert(customForms)
    .values({
      schoolId: school.id,
      title: 'E2E Notify Form',
      description: 'Notifications and spam tests',
      slug: notifySlug,
      formType: 'custom',
      isActive: true,
      isTemplate: false,
      accessLevel: 'public',
      createdBy: admin.id,
      settings: {
        requireAuth: false,
        allowMultipleSubmissions: false,
        showProgressBar: false,
        confirmationMessage: 'Notify thank you',
        redirectUrl: null,
        notifyOnSubmission: true,
        notificationEmails: [notificationEmail],
        sendSubmitterConfirmation: true,
      },
    })
    .returning();

  const [notifyName] = await db
    .insert(customFormFields)
    .values({
      formId: notifyForm.id,
      fieldType: 'text',
      label: 'Full Name',
      isRequired: true,
      order: 0,
      fieldConfig: {},
      validationRules: {},
    })
    .returning();

  const [notifyEmail] = await db
    .insert(customFormFields)
    .values({
      formId: notifyForm.id,
      fieldType: 'email',
      label: 'Email',
      isRequired: true,
      order: 1,
      fieldConfig: {},
      validationRules: {},
    })
    .returning();

  return {
    school: { id: school.id, name: school.name },
    admin: { id: admin.id, email: adminEmail, password: ADMIN_PASSWORD },
    publicForm: {
      id: publicForm.id,
      slug: publicSlug,
      title: publicForm.title,
      fieldIds: {
        fullName: nameField.id,
        email: emailField.id,
        resume: resumeField.id,
        agree: agreeField.id,
      },
    },
    membersForm: { id: membersForm.id, slug: membersSlug },
    emptyForm: {
      id: emptyForm.id,
      slug: emptySlug,
      title: emptyForm.title,
      isActive: emptyForm.isActive,
      accessLevel: emptyForm.accessLevel,
    },
    notifyForm: {
      id: notifyForm.id,
      slug: notifySlug,
      title: notifyForm.title,
      fieldIds: { fullName: notifyName.id, email: notifyEmail.id },
      notificationEmail,
    },
  };
}
