import { nanoid } from 'nanoid';
import { getDb } from '../../db';
import { customForms, customFormFields } from '@shared/schema';
import { TestDatabase } from './testDatabase';

export type PublicFormScenarioSeed = {
  school: { id: number; name: string };
  publicForm: {
    id: number;
    slug: string;
    title: string;
    fieldIds: { fullName: number; email: number; resume: number; agree: number };
  };
  membersForm: { id: number; slug: string };
};

/**
 * Seeds an active public form and a members-only form for Playwright / API tests.
 */
export async function seedPublicFormScenario(
  testDb: TestDatabase = new TestDatabase(),
): Promise<PublicFormScenarioSeed> {
  const db = await getDb();
  if (!db) {
    throw new Error('Postgres required (set DATABASE_URL)');
  }

  const uniqueId = nanoid(8).toLowerCase();
  const admin = await testDb.createTestUser({
    email: `form_admin_${uniqueId}@test.com`,
    username: `formadmin_${uniqueId}`,
    name: 'Form E2E Admin',
    role: 'schoolAdmin',
  });

  const school = await testDb.createTestSchool(admin.id, {
    name: `Form E2E School ${uniqueId}`,
    registrationCode: `FORM${uniqueId.toUpperCase()}`,
    status: 'active',
  });

  const publicSlug = `e2e-public-${uniqueId}`;
  const membersSlug = `e2e-members-${uniqueId}`;

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

  return {
    school: { id: school.id, name: school.name },
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
  };
}
