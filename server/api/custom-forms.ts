import { Router } from 'express';
import { getDb } from '../db';
import { customForms, customFormFields, customFormSubmissions, insertCustomFormSchema, insertCustomFormFieldSchema, insertCustomFormSubmissionSchema } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// Get all forms for a school
router.get('/schools/:schoolId/forms', async (req, res) => {
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
router.get('/forms/:formId', async (req, res) => {
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
        eq(customForms.isActive, true)
      ));
    
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
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

// Create a new form
router.post('/schools/:schoolId/forms', async (req, res) => {
  try {
    const schoolId = parseInt(req.params.schoolId);
    const db = await getDb();
    
    const formData = insertCustomFormSchema.parse({
      ...req.body,
      schoolId,
      createdBy: req.body.createdBy || 1, // Should come from auth middleware
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
router.put('/forms/:formId', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
    const [updatedForm] = await db
      .update(customForms)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(customForms.id, formId))
      .returning();
    
    if (!updatedForm) {
      return res.status(404).json({ message: 'Form not found' });
    }
    
    res.json(updatedForm);
  } catch (error) {
    console.error('Error updating form:', error);
    res.status(500).json({ message: 'Error updating form' });
  }
});

// Delete a form
router.delete('/forms/:formId', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
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
router.post('/forms/:formId/fields', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
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
router.put('/fields/:fieldId', async (req, res) => {
  try {
    const fieldId = parseInt(req.params.fieldId);
    const db = await getDb();
    
    const [updatedField] = await db
      .update(customFormFields)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(customFormFields.id, fieldId))
      .returning();
    
    if (!updatedField) {
      return res.status(404).json({ message: 'Field not found' });
    }
    
    res.json(updatedField);
  } catch (error) {
    console.error('Error updating field:', error);
    res.status(500).json({ message: 'Error updating field' });
  }
});

// Delete field
router.delete('/fields/:fieldId', async (req, res) => {
  try {
    const fieldId = parseInt(req.params.fieldId);
    const db = await getDb();
    
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
router.put('/forms/:formId/fields/reorder', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const { fieldOrders } = req.body; // Array of {id, order}
    const db = await getDb();
    
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

// Submit form
router.post('/forms/:formId/submit', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
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

// Get form submissions
router.get('/forms/:formId/submissions', async (req, res) => {
  try {
    const formId = parseInt(req.params.formId);
    const db = await getDb();
    
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
router.put('/submissions/:submissionId', async (req, res) => {
  try {
    const submissionId = parseInt(req.params.submissionId);
    const db = await getDb();
    
    const [updatedSubmission] = await db
      .update(customFormSubmissions)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(customFormSubmissions.id, submissionId))
      .returning();
    
    if (!updatedSubmission) {
      return res.status(404).json({ message: 'Submission not found' });
    }
    
    res.json(updatedSubmission);
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ message: 'Error updating submission' });
  }
});

// Clone form as template
router.post('/forms/:formId/clone', async (req, res) => {
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
    
    const originalFields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, formId))
      .orderBy(customFormFields.order);
    
    // Create new form
    const [newForm] = await db
      .insert(customForms)
      .values({
        ...originalForm,
        id: undefined,
        title: `${originalForm.title} (Copy)`,
        slug: `${originalForm.slug}-copy-${Date.now()}`,
        isTemplate: req.body.saveAsTemplate || false,
        createdBy: req.body.createdBy || originalForm.createdBy,
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
