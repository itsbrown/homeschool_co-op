import { Router } from 'express';
import { getDb } from '../db';
import { customForms, customFormFields, customFormSubmissions, insertCustomFormSchema, insertCustomFormFieldSchema, insertCustomFormSubmissionSchema } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { jwtCheck, requireSchoolAccess } from '../middleware/auth0-auth';

const router = Router();

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
    
    res.json({ ...form, fields });
  } catch (error) {
    console.error('Error fetching form by slug:', error);
    res.status(500).json({ message: 'Error fetching form' });
  }
});

// Submit form (public access)
router.post('/forms/:formId/submit', async (req, res) => {
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
      return res.status(404).json({ message: 'Form not found or not accepting submissions' });
    }
    
    const submissionData = insertCustomFormSubmissionSchema.parse({
      ...req.body,
      formId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    
    const [newSubmission] = await db
      .insert(customFormSubmissions)
      .values(submissionData)
      .returning();
    
    // TODO: Send email notifications if configured
    
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

// Get all forms for a school
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
    
    res.json({ ...form, fields });
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
      id: true,
      formId: true, // Prevent reassignment attacks
      createdAt: true,
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
      id: true,
      formId: true, // Prevent reassignment attacks
      createdAt: true,
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
    
    // Check ownership - must have access to original form
    if (req.auth.role !== 'superAdmin' && originalForm.schoolId !== req.auth.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const originalFields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, formId))
      .orderBy(customFormFields.order);
    
    // Create new form - derive createdBy and schoolId from auth, not from client
    const [newForm] = await db
      .insert(customForms)
      .values({
        ...originalForm,
        id: undefined,
        title: `${originalForm.title} (Copy)`,
        slug: `${originalForm.slug}-copy-${Date.now()}`,
        isTemplate: req.body.saveAsTemplate || false,
        createdBy: req.auth.dbUserId, // Always use authenticated user
        schoolId: req.auth.schoolId, // Always use authenticated user's school
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

export default router;
