import { Router, Response } from 'express';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { getDb } from '../db';
import { classInclusions, classes, insertClassInclusionSchema } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

router.get('/', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const db = await getDb();

    const allInclusions = await db
      .select({
        id: classInclusions.id,
        parentClassId: classInclusions.parentClassId,
        includedClassId: classInclusions.includedClassId,
        createdAt: classInclusions.createdAt,
      })
      .from(classInclusions)
      .where(eq(classInclusions.schoolId, schoolId));

    return res.json(allInclusions);
  } catch (error: any) {
    console.error('Error fetching class inclusions:', error);
    return res.status(500).json({ message: 'Error fetching class inclusions', error: error.message });
  }
});

router.get('/:parentClassId', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const parentClassId = parseInt(req.params.parentClassId);
    
    if (isNaN(parentClassId)) {
      return res.status(400).json({ message: 'Invalid parent class ID' });
    }

    const db = await getDb();

    const parentClass = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, parentClassId), eq(classes.schoolId, schoolId)))
      .limit(1);

    if (parentClass.length === 0) {
      return res.status(404).json({ message: 'Parent class not found or access denied' });
    }

    const inclusions = await db
      .select({
        id: classInclusions.id,
        parentClassId: classInclusions.parentClassId,
        includedClassId: classInclusions.includedClassId,
        createdAt: classInclusions.createdAt,
      })
      .from(classInclusions)
      .where(
        and(
          eq(classInclusions.schoolId, schoolId),
          eq(classInclusions.parentClassId, parentClassId)
        )
      );

    return res.json(inclusions);
  } catch (error: any) {
    console.error('Error fetching class inclusions for parent class:', error);
    return res.status(500).json({ message: 'Error fetching class inclusions', error: error.message });
  }
});

router.post('/', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const db = await getDb();

    const validatedData = insertClassInclusionSchema.parse({
      ...req.body,
      schoolId,
    });

    const parentClass = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, validatedData.parentClassId), eq(classes.schoolId, schoolId)))
      .limit(1);

    const includedClass = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, validatedData.includedClassId), eq(classes.schoolId, schoolId)))
      .limit(1);

    if (parentClass.length === 0 || includedClass.length === 0) {
      return res.status(404).json({ message: 'Parent or included class not found or access denied' });
    }

    const existing = await db
      .select()
      .from(classInclusions)
      .where(
        and(
          eq(classInclusions.schoolId, schoolId),
          eq(classInclusions.parentClassId, validatedData.parentClassId),
          eq(classInclusions.includedClassId, validatedData.includedClassId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ message: 'This inclusion already exists' });
    }

    const [newInclusion] = await db
      .insert(classInclusions)
      .values(validatedData)
      .returning();

    return res.status(201).json(newInclusion);
  } catch (error: any) {
    console.error('Error creating class inclusion:', error);
    return res.status(500).json({ message: 'Error creating class inclusion', error: error.message });
  }
});

router.delete('/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const inclusionId = parseInt(req.params.id);

    if (isNaN(inclusionId)) {
      return res.status(400).json({ message: 'Invalid inclusion ID' });
    }

    const db = await getDb();

    const existing = await db
      .select()
      .from(classInclusions)
      .where(and(eq(classInclusions.id, inclusionId), eq(classInclusions.schoolId, schoolId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Inclusion not found or access denied' });
    }

    await db
      .delete(classInclusions)
      .where(and(eq(classInclusions.id, inclusionId), eq(classInclusions.schoolId, schoolId)));

    return res.json({ message: 'Class inclusion deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting class inclusion:', error);
    return res.status(500).json({ message: 'Error deleting class inclusion', error: error.message });
  }
});

export default router;
