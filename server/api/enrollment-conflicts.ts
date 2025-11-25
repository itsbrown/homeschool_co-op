import { Router, Response } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { getDb } from '../db';
import { classes, classInclusions, programEnrollments } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { detectScheduleConflicts, detectInclusionConflicts, ScheduleConflict } from '../utils/enrollment-conflicts';

const router = Router();

router.get('/:childId/class/:classId', supabaseAuth, async (req: any, res: Response) => {
  try {
    const childId = parseInt(req.params.childId);
    const classId = parseInt(req.params.classId);
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (isNaN(childId) || isNaN(classId)) {
      return res.status(400).json({ message: 'Invalid child ID or class ID' });
    }

    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    const parent = await storage.getUserByEmail(userEmail);
    if (!parent || child.parentId !== parent.id) {
      return res.status(403).json({ message: 'Not authorized to access this child' });
    }

    if (!child.schoolId) {
      return res.status(400).json({ message: 'Child has no associated school' });
    }

    const db = await getDb();
    
    const targetClassResult = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.schoolId, child.schoolId)))
      .limit(1);

    if (targetClassResult.length === 0) {
      return res.status(404).json({ message: 'Class not found or not available in child\'s school' });
    }

    const targetClass = targetClassResult[0];

    const childEnrollments = await db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.childId, childId));

    if (childEnrollments.length === 0) {
      return res.json({
        hasConflicts: false,
        conflicts: [],
        canEnroll: true,
      });
    }

    const enrolledClassIds = childEnrollments
      .map((e: any) => e.programId)
      .filter((id: any): id is number => id !== null && id !== undefined);

    if (enrolledClassIds.length === 0) {
      return res.json({
        hasConflicts: false,
        conflicts: [],
        canEnroll: true,
      });
    }

    const enrolledClasses = await db
      .select()
      .from(classes)
      .where(and(
        inArray(classes.id, enrolledClassIds),
        eq(classes.schoolId, child.schoolId)
      ));

    const scheduleConflicts = detectScheduleConflicts(targetClass, enrolledClasses);

    const allInclusions = await db
      .select()
      .from(classInclusions)
      .where(eq(classInclusions.schoolId, child.schoolId));

    const classInclusionsMap = new Map<number, number[]>();
    for (const inclusion of allInclusions) {
      const existing = classInclusionsMap.get(inclusion.parentClassId) || [];
      existing.push(inclusion.includedClassId);
      classInclusionsMap.set(inclusion.parentClassId, existing);
    }

    const inclusionConflicts = detectInclusionConflicts(
      classId,
      enrolledClassIds,
      classInclusionsMap
    );

    const enrichedInclusionConflicts: ScheduleConflict[] = inclusionConflicts.map((conflict: ScheduleConflict) => {
      const enrolledClass = enrolledClasses.find((c: any) => c.id === conflict.conflictingClassId);
      return {
        ...conflict,
        conflictingClassName: enrolledClass?.title || 'Unknown Class',
        message: `Already included in ${enrolledClass?.title || 'enrolled program'}`,
      };
    });

    const allConflicts = [...scheduleConflicts, ...enrichedInclusionConflicts];

    return res.json({
      hasConflicts: allConflicts.length > 0,
      conflicts: allConflicts,
      canEnroll: allConflicts.length === 0,
    });

  } catch (error: any) {
    console.error('Error checking enrollment conflicts:', error);
    return res.status(500).json({ 
      message: 'Error checking enrollment conflicts', 
      error: error.message 
    });
  }
});

export default router;
