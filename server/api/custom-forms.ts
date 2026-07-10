import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db';
import { customForms, customFormFields, customFormSubmissions, schools, insertCustomFormSchema, insertCustomFormFieldSchema, insertCustomFormSubmissionSchema } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { jwtCheck, requireSchoolAccess } from '../middleware/auth0-auth';
import { fileUploadService } from '../services/fileUploadService';
import { ObjectStorageService } from '../replit_integrations/object_storage';
import {
  sendFormSubmissionNotifications,
  validateFormSubmission,
} from '../lib/custom-form-submission';

const router = Router();

const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.FORM_SUBMIT_RATE_LIMIT
    ? parseInt(process.env.FORM_SUBMIT_RATE_LIMIT, 10)
    : process.env.CI === 'true' || process.env.NODE_ENV === 'test'
      ? 8
      : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many submissions. Please try again later.' },
});

async function getActivePublicForm(formId: number) {
  const db = await getDb();
  const [form] = await db
    .select()
    .from(customForms)
    .where(and(
      eq(customForms.id, formId),
      eq(customForms.isActive, true),
      eq(customForms.accessLevel, 'public'),
    ));
  return form ?? null;
}

// Presigned upload for public form attachments (no auth — form must be public).
router.post('/forms/:formId/request-upload-url', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId, 10);
    if (!Number.isFinite(formId)) {
      return res.status(400).json({ message: 'Invalid form ID' });
    }

    const form = await getActivePublicForm(formId);
    if (!form) {
      return res.status(404).json({ message: 'Form not found or not public' });
    }

    const { name, size, contentType } = req.body ?? {};
    if (!name || !size || !contentType) {
      return res.status(400).json({ message: 'Missing required fields: name, size, contentType' });
    }

    const result = await fileUploadService.getUploadUrl({
      category: 'formAttachments',
      filename: name,
      contentType,
      sizeBytes: size,
      schoolId: form.schoolId,
      metadata: { formId: String(formId), purpose: 'custom_form_attachment' },
    });

    if (!result.validation.valid) {
      return res.status(400).json({ message: result.validation.error });
    }

    res.json({
      uploadURL: result.uploadURL,
      objectPath: result.objectPath,
    });
  } catch (error: any) {
    console.error('Error generating form upload URL:', error);
    res.status(500).json({ message: error?.message || 'Failed to generate upload URL' });
  }
});

router.post('/forms/:formId/confirm-upload', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId, 10);
    if (!Number.isFinite(formId)) {
      return res.status(400).json({ message: 'Invalid form ID' });
    }

    const form = await getActivePublicForm(formId);
    if (!form) {
      return res.status(404).json({ message: 'Form not found or not public' });
    }

    const { objectPath, fileName } = req.body ?? {};
    if (!objectPath || !fileName) {
      return res.status(400).json({ message: 'Missing objectPath or fileName' });
    }

    if (!objectPath.startsWith('/objects/form-attachments/')) {
      return res.status(400).json({ message: 'Invalid objectPath for form attachment' });
    }

    await fileUploadService.setObjectAcl(objectPath, 'anonymous', false);

    res.json({
      success: true,
      fileName,
      objectPath,
    });
  } catch (error: any) {
    console.error('Error confirming form upload:', error);
    res.status(500).json({ message: error?.message || 'Failed to confirm upload' });
  }
});

// PUBLIC ROUTES (before jwtCheck) - for public form access and submissions
// Get form by slug (for public access)
router.get('/forms/by-slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const db = await getDb();
    
    const [form] = await db
      .select()
      .from(customForms)
      .where(and(
        eq(customForms.slug, slug),
        eq(customForms.isActive, true),
        eq(customForms.accessLevel, 'public') // Only allow public forms
      ));
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found or not public' });
    }
    
    const fields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, form.id))
      .orderBy(customFormFields.order);
    
    // Fetch school information for branding
    const [school] = await db
      .select({
        id: schools.id,
        name: schools.name,
        logo: schools.logo,
        website: schools.website,
      })
      .from(schools)
      .where(eq(schools.id, form.schoolId));
    
    res.json({ ...form, fields, school: school || null });
  } catch (error) {
    console.error('Error fetching form by slug:', error);
    res.status(500).json({ message: 'Error fetching form' });
  }
});

// Get form by slug (authenticated - for members-only forms)
router.get('/forms/by-slug-auth/:slug', jwtCheck, async (req: any, res) => {
  try {
    const slug = req.params.slug;
    const db = await getDb();
    
    const [form] = await db
      .select()
      .from(customForms)
      .where(and(
        eq(customForms.slug, slug),
        eq(customForms.isActive, true)
      ));
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Check if user has access based on form access level
    // For now, authenticated users can access members-only forms
    // TODO: Add role-based access control if needed
    
    const fields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, form.id))
      .orderBy(customFormFields.order);
    
    // Fetch school information for branding
    const [school] = await db
      .select({
        id: schools.id,
        name: schools.name,
        logo: schools.logo,
        website: schools.website,
      })
      .from(schools)
      .where(eq(schools.id, form.schoolId));
    
    res.json({ ...form, fields, school: school || null });
  } catch (error) {
    console.error('Error fetching form by slug:', error);
    res.status(500).json({ message: 'Error fetching form' });
  }
});

// Submit form (public access only - for backward compatibility)
router.post('/forms/:formId/submit', publicSubmitLimiter, async (req, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    // Verify form exists and is public
    const [form] = await db
      .select()
      .from(customForms)
      .where(and(
        eq(customForms.id, formId),
        eq(customForms.isActive, true),
        eq(customForms.accessLevel, 'public') // Only allow submissions to public forms
      ));
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found or not public' });
    }

    const honeypot = req.body?.honeypot ?? req.body?.website ?? null;
    const responseData = (req.body?.responseData || {}) as Record<string, unknown>;
    const submitterEmailRaw = req.body?.submitterEmail ?? null;
    const submitterEmail =
      typeof submitterEmailRaw === 'string' ? submitterEmailRaw.trim().toLowerCase() : null;
    const ipAddress = req.ip || null;

    const validationError = await validateFormSubmission({
      form,
      responseData,
      submitterEmail,
      ipAddress,
      honeypot,
    });
    if (validationError) {
      const status = validationError === 'Submission rejected' ? 400 : 400;
      return res.status(status).json({ message: validationError });
    }
    
    const submissionData = insertCustomFormSubmissionSchema.parse({
      ...req.body,
      formId,
      responseData,
      submitterEmail,
      ipAddress,
      userAgent: req.headers['user-agent'],
    });
    
    const [newSubmission] = await db
      .insert(customFormSubmissions)
      .values(submissionData)
      .returning();

    try {
      await sendFormSubmissionNotifications({
        form,
        submissionId: newSubmission.id,
        submitterEmail: newSubmission.submitterEmail,
        submitterName: newSubmission.submitterName,
        responseData: (newSubmission.responseData || {}) as Record<string, unknown>,
      });
    } catch (notifyError) {
      console.error('Form submission notification error:', notifyError);
    }
    
    res.status(201).json(newSubmission);
  } catch (error) {
    console.error('Error submitting form:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error submitting form' });
  }
});

// Submit form (authenticated - for members-only forms)
router.post('/forms/:formId/submit-auth', jwtCheck, async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    // Verify form exists and is active (authenticated users can submit to any non-public form)
    const [form] = await db
      .select()
      .from(customForms)
      .where(and(
        eq(customForms.id, formId),
        eq(customForms.isActive, true)
      ));
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found or not accepting submissions' });
    }

    const honeypot = req.body?.honeypot ?? req.body?.website ?? null;
    const responseData = (req.body?.responseData || {}) as Record<string, unknown>;
    const submitterEmailRaw = req.body?.submitterEmail ?? req.auth?.email ?? null;
    const submitterEmail =
      typeof submitterEmailRaw === 'string' ? submitterEmailRaw.trim().toLowerCase() : null;
    const ipAddress = req.ip || null;

    const validationError = await validateFormSubmission({
      form,
      responseData,
      submitterEmail,
      ipAddress,
      honeypot,
    });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    
    const submissionData = insertCustomFormSubmissionSchema.parse({
      ...req.body,
      formId,
      responseData,
      submitterEmail,
      ipAddress,
      userAgent: req.headers['user-agent'],
    });
    
    const [newSubmission] = await db
      .insert(customFormSubmissions)
      .values(submissionData)
      .returning();

    try {
      await sendFormSubmissionNotifications({
        form,
        submissionId: newSubmission.id,
        submitterEmail: newSubmission.submitterEmail,
        submitterName: newSubmission.submitterName,
        responseData: (newSubmission.responseData || {}) as Record<string, unknown>,
      });
    } catch (notifyError) {
      console.error('Form submission notification error:', notifyError);
    }
    
    res.status(201).json(newSubmission);
  } catch (error) {
    console.error('Error submitting form:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error submitting form' });
  }
});

// AUTHENTICATED ROUTES (after jwtCheck) - require login
router.use(jwtCheck);

// Apply an AI / bulk field draft (replaces fields when replaceExisting is true)
router.post('/forms/:formId/apply-draft', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();

    const [form] = await db.select().from(customForms).where(eq(customForms.id, formId));
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const draftSchema = z.object({
      title: z.string().optional(),
      description: z.string().nullable().optional(),
      replaceExisting: z.boolean().default(true),
      fields: z.array(z.object({
        fieldType: z.string(),
        label: z.string(),
        placeholder: z.string().nullable().optional(),
        helpText: z.string().nullable().optional(),
        isRequired: z.boolean().optional(),
        order: z.number().optional(),
        fieldConfig: z.record(z.any()).optional(),
        validationRules: z.record(z.any()).optional(),
      })).min(1),
      settings: z.record(z.any()).optional(),
    });

    const draft = draftSchema.parse(req.body);

    if (draft.title || draft.description !== undefined || draft.settings) {
      await db
        .update(customForms)
        .set({
          ...(draft.title ? { title: draft.title } : {}),
          ...(draft.description !== undefined ? { description: draft.description } : {}),
          ...(draft.settings
            ? {
                settings: {
                  ...(form.settings as object),
                  ...draft.settings,
                },
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(customForms.id, formId));
    }

    if (draft.replaceExisting) {
      await db.delete(customFormFields).where(eq(customFormFields.formId, formId));
    }

    const created = [];
    for (let i = 0; i < draft.fields.length; i++) {
      const f = draft.fields[i];
      const fieldData = insertCustomFormFieldSchema.parse({
        formId,
        fieldType: f.fieldType,
        label: f.label,
        placeholder: f.placeholder ?? null,
        helpText: f.helpText ?? null,
        isRequired: f.isRequired ?? false,
        order: f.order ?? i,
        fieldConfig: f.fieldConfig ?? {},
        validationRules: f.validationRules ?? {},
      });
      const [row] = await db.insert(customFormFields).values(fieldData).returning();
      created.push(row);
    }

    const [updatedForm] = await db.select().from(customForms).where(eq(customForms.id, formId));
    res.json({ form: updatedForm, fields: created });
  } catch (error) {
    console.error('Error applying form draft:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error applying form draft' });
  }
});

// Get all template forms (available to all authenticated users)
router.get('/templates', async (req: any, res) => {
  try {
    const db = await getDb();
    
    const templates = await db
      .select()
      .from(customForms)
      .where(eq(customForms.isTemplate, true))
      .orderBy(desc(customForms.createdAt));
    
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ message: 'Error fetching templates' });
  }
});

// Get all forms for authenticated user's school (extracts schoolId from token)
router.get('/schools/forms', async (req: any, res) => {
  try {
    const schoolId = req.auth.schoolId;
    
    if (!schoolId) {
      return res.status(400).json({ message: 'No school associated with user' });
    }
    
    const db = await getDb();
    
    const forms = await db
      .select()
      .from(customForms)
      .where(eq(customForms.schoolId, schoolId))
      .orderBy(desc(customForms.createdAt));
    
    res.json(forms);
  } catch (error) {
    console.error('Error fetching forms:', error);
    res.status(500).json({ message: 'Error fetching forms' });
  }
});

// Create form for authenticated user's school (extracts schoolId from token)
router.post('/schools/forms', async (req: any, res) => {
  try {
    const schoolId = req.auth.schoolId;
    
    if (!schoolId) {
      return res.status(400).json({ message: 'No school associated with user' });
    }
    
    const db = await getDb();
    
    const formData = insertCustomFormSchema.parse({
      ...req.body,
      schoolId,
      createdBy: req.auth.dbUserId,
    });
    
    const [newForm] = await db
      .insert(customForms)
      .values(formData)
      .returning();
    
    res.status(201).json(newForm);
  } catch (error) {
    console.error('Error creating form:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error creating form' });
  }
});

// Get all forms for a school (with explicit schoolId - for superAdmin)
router.get('/schools/:schoolId/forms', requireSchoolAccess, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.params.schoolId);
    const db = await getDb();
    
    const forms = await db
      .select()
      .from(customForms)
      .where(eq(customForms.schoolId, schoolId))
      .orderBy(desc(customForms.createdAt));
    
    res.json(forms);
  } catch (error) {
    console.error('Error fetching forms:', error);
    res.status(500).json({ message: 'Error fetching forms' });
  }
});

// Get a single form with its fields
router.get('/forms/:formId', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    const [form] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, formId));
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Check ownership
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const fields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, formId))
      .orderBy(customFormFields.order);
    
    // Fetch school information for branding
    const [school] = await db
      .select({
        id: schools.id,
        name: schools.name,
        logo: schools.logo,
        website: schools.website,
      })
      .from(schools)
      .where(eq(schools.id, form.schoolId));
    
    res.json({ ...form, fields, school: school || null });
  } catch (error) {
    console.error('Error fetching form:', error);
    res.status(500).json({ message: 'Error fetching form' });
  }
});

// Create a new form
router.post('/schools/:schoolId/forms', requireSchoolAccess, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.params.schoolId);
    const db = await getDb();
    
    const formData = insertCustomFormSchema.parse({
      ...req.body,
      schoolId,
      createdBy: req.auth.dbUserId, // Use authenticated user ID
    });
    
    const [newForm] = await db
      .insert(customForms)
      .values(formData)
      .returning();
    
    res.status(201).json(newForm);
  } catch (error) {
    console.error('Error creating form:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error creating form' });
  }
});

// Update a form
router.put('/forms/:formId', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    // Check if form exists and belongs to user's school
    const [existingForm] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, formId));
    
    if (!existingForm) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Check ownership - super admin can update any, school admin can update their school's forms
    if (req.auth.role !== 'superAdmin' && existingForm.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'You do not have permission to update this form' });
    }
    
    // Validate and sanitize update data - only allow specific fields to be updated
    const updateSchema = insertCustomFormSchema.pick({
      title: true,
      description: true,
      formType: true,
      isActive: true,
      isTemplate: true,
      accessLevel: true,
      settings: true,
      conditionalLogic: true,
      isAllLocations: true,
      allowedLocationIds: true,
      platformFeeType: true,
      platformFeeAmount: true,
    }).partial();
    
    const updates = updateSchema.parse(req.body);
    
    const [updatedForm] = await db
      .update(customForms)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customForms.id, formId))
      .returning();
    
    res.json(updatedForm);
  } catch (error) {
    console.error('Error updating form:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error updating form' });
  }
});

// Delete a form
router.delete('/forms/:formId', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    // Check if form exists and belongs to user's school
    const [existingForm] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, formId));
    
    if (!existingForm) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Check ownership - super admin can delete any, school admin can delete their school's forms
    if (req.auth.role !== 'superAdmin' && existingForm.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'You do not have permission to delete this form' });
    }
    
    await db
      .delete(customForms)
      .where(eq(customForms.id, formId));
    
    res.json({ message: 'Form deleted successfully' });
  } catch (error) {
    console.error('Error deleting form:', error);
    res.status(500).json({ message: 'Error deleting form' });
  }
});

// Add field to form
router.post('/forms/:formId/fields', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    // Check form ownership
    const [form] = await db.select().from(customForms).where(eq(customForms.id, formId));
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const fieldData = insertCustomFormFieldSchema.parse({
      ...req.body,
      formId,
    });
    
    const [newField] = await db
      .insert(customFormFields)
      .values(fieldData)
      .returning();
    
    res.status(201).json(newField);
  } catch (error) {
    console.error('Error adding field:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error adding field' });
  }
});

// Update field
router.put('/fields/:fieldId', async (req: any, res) => {
  try {
    const fieldId = parseInt(req.params.fieldId);
    const db = await getDb();
    
    // Get field and check ownership via form
    const [field] = await db.select({ formId: customFormFields.formId }).from(customFormFields).where(eq(customFormFields.id, fieldId));
    if (!field) return res.status(404).json({ message: 'Field not found' });
    
    const [form] = await db.select({ schoolId: customForms.schoolId }).from(customForms).where(eq(customForms.id, field.formId));
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Validate and sanitize update data - prevent formId tampering
    const updateSchema = insertCustomFormFieldSchema.omit({
      formId: true, // Prevent reassignment attacks
    }).partial();
    
    const updates = updateSchema.parse(req.body);
    
    const [updatedField] = await db
      .update(customFormFields)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customFormFields.id, fieldId))
      .returning();
    
    res.json(updatedField);
  } catch (error) {
    console.error('Error updating field:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error updating field' });
  }
});

// Delete field
router.delete('/fields/:fieldId', async (req: any, res) => {
  try {
    const fieldId = parseInt(req.params.fieldId);
    const db = await getDb();
    
    // Get field and check ownership via form
    const [field] = await db.select({ formId: customFormFields.formId }).from(customFormFields).where(eq(customFormFields.id, fieldId));
    if (!field) return res.status(404).json({ message: 'Field not found' });
    
    const [form] = await db.select({ schoolId: customForms.schoolId }).from(customForms).where(eq(customForms.id, field.formId));
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await db
      .delete(customFormFields)
      .where(eq(customFormFields.id, fieldId));
    
    res.json({ message: 'Field deleted successfully' });
  } catch (error) {
    console.error('Error deleting field:', error);
    res.status(500).json({ message: 'Error deleting field' });
  }
});

// Reorder fields
router.put('/forms/:formId/fields/reorder', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const { fieldOrders } = req.body; // Array of {id, order}
    const db = await getDb();
    
    // Check form ownership
    const [form] = await db.select({ schoolId: customForms.schoolId }).from(customForms).where(eq(customForms.id, formId));
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Update each field's order
    for (const { id, order } of fieldOrders) {
      await db
        .update(customFormFields)
        .set({ order, updatedAt: new Date() })
        .where(and(
          eq(customFormFields.id, id),
          eq(customFormFields.formId, formId)
        ));
    }
    
    res.json({ message: 'Fields reordered successfully' });
  } catch (error) {
    console.error('Error reordering fields:', error);
    res.status(500).json({ message: 'Error reordering fields' });
  }
});

// Get form submissions
router.get('/forms/:formId/submissions', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    // Check form ownership
    const [form] = await db.select({ schoolId: customForms.schoolId }).from(customForms).where(eq(customForms.id, formId));
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const submissions = await db
      .select()
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.formId, formId))
      .orderBy(desc(customFormSubmissions.createdAt));
    
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Update submission status
router.put('/submissions/:submissionId', async (req: any, res) => {
  try {
    const submissionId = parseInt(req.params.submissionId);
    const db = await getDb();
    
    // Get submission and check ownership via form
    const [submission] = await db.select({ formId: customFormSubmissions.formId }).from(customFormSubmissions).where(eq(customFormSubmissions.id, submissionId));
    if (!submission) return res.status(404).json({ message: 'Submission not found' });
    
    const [form] = await db.select({ schoolId: customForms.schoolId }).from(customForms).where(eq(customForms.id, submission.formId));
    if (!form) return res.status(404).json({ message: 'Form not found' });
    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Validate and sanitize update data - prevent formId/schoolId tampering
    const updateSchema = insertCustomFormSubmissionSchema.omit({
      formId: true, // Prevent reassignment attacks
      ipAddress: true, // Immutable metadata
      userAgent: true, // Immutable metadata
    }).partial();
    
    const updates = updateSchema.parse(req.body);
    
    const [updatedSubmission] = await db
      .update(customFormSubmissions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customFormSubmissions.id, submissionId))
      .returning();
    
    res.json(updatedSubmission);
  } catch (error) {
    console.error('Error updating submission:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error updating submission' });
  }
});

// Clone form as template
router.post('/forms/:formId/clone', async (req: any, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    // Get original form and fields
    const [originalForm] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, formId));
    
    if (!originalForm) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    // Global templates (school 1) may be cloned into any school admin's school
    const isGlobalTemplate = originalForm.isTemplate;
    if (
      req.auth.role !== 'superAdmin' &&
      !isGlobalTemplate &&
      originalForm.schoolId !== req.auth.schoolId
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const targetSchoolId = req.auth.schoolId;
    if (!targetSchoolId && req.auth.role !== 'superAdmin') {
      return res.status(400).json({ message: 'No school associated with user' });
    }
    
    const originalFields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, formId))
      .orderBy(customFormFields.order);
    
    const cloneTitle = req.body.title || (isGlobalTemplate ? originalForm.title : `${originalForm.title} (Copy)`);
    const cloneSlug =
      req.body.slug ||
      (isGlobalTemplate
        ? originalForm.slug.replace(/-template$/, '')
        : `${originalForm.slug}-copy-${Date.now()}`);

    // Create new form - derive createdBy and schoolId from auth, not from client
    const [newForm] = await db
      .insert(customForms)
      .values({
        ...originalForm,
        id: undefined,
        title: cloneTitle,
        slug: cloneSlug,
        isTemplate: req.body.saveAsTemplate || false,
        isActive: req.body.isActive ?? (isGlobalTemplate ? true : originalForm.isActive),
        accessLevel: req.body.accessLevel ?? (isGlobalTemplate ? 'public' : originalForm.accessLevel),
        createdBy: req.auth.dbUserId,
        schoolId: targetSchoolId ?? originalForm.schoolId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    // Clone fields
    for (const field of originalFields) {
      await db
        .insert(customFormFields)
        .values({
          ...field,
          id: undefined,
          formId: newForm.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
    }
    
    res.status(201).json(newForm);
  } catch (error) {
    console.error('Error cloning form:', error);
    res.status(500).json({ message: 'Error cloning form' });
  }
});

// Download a file attachment from a form submission (school admin)
router.get('/submissions/:submissionId/files/:fieldId', async (req: any, res) => {
  try {
    const submissionId = parseInt(req.params.submissionId);
    const fieldId = parseInt(req.params.fieldId);
    const db = await getDb();

    const [submission] = await db
      .select()
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.id, submissionId));

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    const [form] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, submission.formId));

    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }

    if (req.auth.role !== 'superAdmin' && form.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const fieldKey = `field_${fieldId}`;
    const attachment = (submission.responseData as Record<string, any>)?.[fieldKey];
    const objectPath =
      typeof attachment === 'object' && attachment?.objectPath
        ? String(attachment.objectPath)
        : null;
    const fileName =
      typeof attachment === 'object' && attachment?.fileName
        ? String(attachment.fileName)
        : 'attachment';

    if (!objectPath || !objectPath.startsWith('/objects/')) {
      return res.status(404).json({ message: 'No file attachment for this field' });
    }

    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    await objectStorageService.downloadObject(objectFile, res, 0);
  } catch (error: any) {
    console.error('Error downloading form attachment:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to download attachment' });
    }
  }
});

export default router;
