import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { supabaseAuth, requireSchoolContext } from '../middleware/supabase-auth';
import {
  insertProgressSubjectSchema,
  insertProgressTrackSchema,
  insertStudentProgressLogBodySchema,
} from '../../shared/schema';

const router = Router();

const ALLOWED_STAFF = ['schoolAdmin', 'admin', 'educator', 'teacher', 'superAdmin'];

function staffOnly(req: Request, res: Response, next: Function) {
  const role = (req.user as any)?.role || (req.user as any)?.activeRole;
  if (!ALLOWED_STAFF.includes(role)) {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }
  next();
}

router.get('/subjects', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const subjects = await storage.getProgressSubjectsBySchool(schoolId);
    res.json(subjects);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch subjects' });
  }
});

router.post('/subjects', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const role = (req.user as any).role || (req.user as any).activeRole;
    if (!['schoolAdmin', 'admin', 'superAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Only administrators can create subjects' });
    }
    const schoolId = (req.user as any).schoolId;
    const data = insertProgressSubjectSchema.parse({ ...req.body, schoolId });
    const row = await storage.createProgressSubject(data);
    res.status(201).json(row);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: 'Validation error', errors: e.errors });
    console.error(e);
    res.status(500).json({ message: 'Failed to create subject' });
  }
});

router.patch('/subjects/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const role = (req.user as any).role || (req.user as any).activeRole;
    if (!['schoolAdmin', 'admin', 'superAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Only administrators can update subjects' });
    }
    const id = parseInt(req.params.id);
    const { schoolId: _, ...rest } = req.body;
    const row = await storage.updateProgressSubject(id, rest);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to update subject' });
  }
});

router.get('/tracks', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const subjectId = parseInt(req.query.subjectId as string);
    if (isNaN(subjectId)) return res.status(400).json({ message: 'subjectId required' });
    const tracks = await storage.getProgressTracksBySubject(schoolId, subjectId);
    res.json(tracks);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch tracks' });
  }
});

router.post('/tracks', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const data = insertProgressTrackSchema.parse({ ...req.body, schoolId });
    const row = await storage.createProgressTrack(data);
    res.status(201).json(row);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: 'Validation error', errors: e.errors });
    console.error(e);
    res.status(500).json({ message: 'Failed to create track' });
  }
});

router.patch('/tracks/:id', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { schoolId: _, subjectId: __, ...rest } = req.body;
    const row = await storage.updateProgressTrack(id, rest);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to update track' });
  }
});

router.get('/students/:childId/current', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });
    const current = await storage.getStudentProgressCurrent(childId, schoolId);
    res.json(current);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch current progress' });
  }
});

router.get('/students/:childId/log', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });
    const logs = await storage.getStudentProgressLog(childId, schoolId, sessionId);
    res.json(logs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch progress log' });
  }
});

router.get('/students/:childId/active-session', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const sessionId = await storage.resolveActiveSessionIdForChild(childId, schoolId);
    res.json({ sessionId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to resolve session' });
  }
});

router.post('/students/:childId/log', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const recordedBy = (req.user as any).id;
    const childId = parseInt(req.params.childId);
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });

    const body = insertStudentProgressLogBodySchema.parse(req.body);
    const track = await storage.getProgressTrackById(body.progressTrackId);
    if (!track || track.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Invalid curriculum track' });
    }

    await storage.createStudentProgressLog(childId, schoolId, recordedBy, body);
    res.status(201).json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: 'Validation error', errors: e.errors });
    console.error(e);
    res.status(500).json({ message: 'Failed to save progress' });
  }
});

router.get('/log/recent', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
    const rows = await storage.getRecentProgressLogForSchool(schoolId, limit, sessionId);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch recent log' });
  }
});

router.get('/report/:childId', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });

    const current = await storage.getStudentProgressCurrent(childId, schoolId);
    const logs = await storage.getStudentProgressLog(childId, schoolId, sessionId);
    const assessments = await storage.getStudentAssessmentsByChildId(childId);

    res.json({
      generatedAt: new Date().toISOString(),
      child: { id: child.id, firstName: child.firstName, lastName: child.lastName, gradeLevel: child.gradeLevel },
      current,
      sessionLogs: logs,
      readingAssessments: assessments.slice(0, 20),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to generate report' });
  }
});

router.get('/parent/my-children', supabaseAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const children = await storage.getChildrenByParentId(userId);
    if (!children.length) return res.json([]);

    const ids = children.map((c) => c.id);
    const summary = await storage.getParentProgressSummary(ids);

    const result = children.map((child) => ({
      child: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        gradeLevel: child.gradeLevel,
        currentLexileRange: child.currentLexileRange,
        currentReadingGradeLevel: child.currentReadingGradeLevel,
        currentBookList: child.currentBookList,
      },
      current: summary[child.id]?.current ?? [],
      sessions: summary[child.id]?.sessions ?? [],
    }));

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch progress' });
  }
});

export default router;
