import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { storage } from '../storage';
import { supabaseAuth, requireSchoolContext } from '../middleware/supabase-auth';
import {
  insertProgressSubjectSchema,
  insertProgressTrackSchema,
  insertStudentProgressLogBodySchema,
  quarterlyRubricBodySchema,
  generateQuarterlyReportBodySchema,
} from '../../shared/schema';
import { generateProgressReportPdf } from '../services/progressReportPdf';
import { sendProgressReportEmail } from '../lib/email-service';
import { logProgressReportEvent } from '../lib/progress-report-audit';
import { startProgressReportSpan } from '../lib/sentry';
import type { StudentProgressReportDto } from '../lib/build-student-progress-report';
import type { ProgressReportBand } from '../lib/resolve-progress-report-band';

const router = Router();

const reportRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  validate: false,
  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    return user?.id ? `report_${user.id}` : 'report_anon';
  },
  message: { message: 'Too many report requests. Please wait a moment.' },
});

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

router.get('/tracks/catalog', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const catalog = await storage.getProgressTrackCatalog(schoolId);
    res.json(catalog);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch track catalog' });
  }
});

router.get('/report/school-snapshots', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const snapshots = await storage.getQuarterlyProgressSnapshotsForSchool(schoolId, 50);
    res.json(
      snapshots.map((s) => ({
        id: s.id,
        childId: s.childId,
        schoolYear: s.schoolYear,
        quarter: s.quarter,
        band: s.band,
        templateVersion: s.templateVersion,
        generatedAt: s.generatedAt,
      })),
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to list school report snapshots' });
  }
});

router.get('/report/:childId/snapshots', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const role = (req.user as any).role || (req.user as any).activeRole;
    const userId = (req.user as any).id;

    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });

    if (!ALLOWED_STAFF.includes(role)) {
      const parentChildren = await storage.getChildrenByParentId(userId);
      if (!parentChildren.some((c) => c.id === childId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const snapshots = await storage.getQuarterlyProgressSnapshots(childId, schoolId);
    res.json(
      snapshots.map((s) => ({
        id: s.id,
        schoolYear: s.schoolYear,
        quarter: s.quarter,
        band: s.band,
        templateVersion: s.templateVersion,
        generatedAt: s.generatedAt,
      })),
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to list report snapshots' });
  }
});

router.put('/quarterly-rubric/:childId', supabaseAuth, requireSchoolContext, staffOnly, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });

    const body = quarterlyRubricBodySchema.parse(req.body);
    const meta = await storage.upsertQuarterlyProgressMeta(childId, schoolId, {
      schoolYear: body.schoolYear,
      quarter: body.quarter,
      quarterLabel: body.quarterLabel,
      asaCoopHours: body.asaCoopHours,
      homeInstructionHours: body.homeInstructionHours,
      draftNarrative: body.draftNarrative,
      approvedNarrative: body.approvedNarrative,
      notesObservations: body.notesObservations,
      phonogramCount: body.phonogramCount,
      mathLevelLabel: body.mathLevelLabel,
      mathFallPercent: body.mathFallPercent,
      mathWinterPercent: body.mathWinterPercent,
      mathSpringPercent: body.mathSpringPercent,
      approvedBy: body.approvedNarrative ? (req.user as any).id : undefined,
      approvedAt: body.approvedNarrative ? new Date() : undefined,
    });

    if (body.skillChecks?.length) {
      await storage.saveQuarterlySkillChecks(childId, schoolId, body.schoolYear, body.quarter, body.skillChecks);
    }

    res.json({ success: true, meta });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: 'Validation error', errors: e.errors });
    console.error(e);
    res.status(500).json({ message: 'Failed to save quarterly rubric' });
  }
});

router.get('/report/:childId', supabaseAuth, requireSchoolContext, reportRateLimit, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const role = (req.user as any).role || (req.user as any).activeRole;
    const userId = (req.user as any).id;
    const format = (req.query.format as string) || 'json';
    const snapshotId = req.query.snapshotId ? parseInt(req.query.snapshotId as string) : undefined;
    const includeGuide = req.query.includeGuide === 'true';
    const draft = req.query.draft === 'true';

    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });

    const isStaff = ALLOWED_STAFF.includes(role);
    if (!isStaff) {
      const parentChildren = await storage.getChildrenByParentId(userId);
      if (!parentChildren.some((c) => c.id === childId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (!snapshotId) {
        return res.status(403).json({ message: 'Parents can only download finalized reports' });
      }
    }

    let report: StudentProgressReportDto | null = null;

    if (snapshotId) {
      const snap = await storage.getQuarterlyProgressSnapshotById(snapshotId, schoolId);
      if (!snap || snap.childId !== childId) return res.status(404).json({ message: 'Report snapshot not found' });
      report = snap.payloadJson as StudentProgressReportDto;
    } else {
      const schoolYear =
        (req.query.schoolYear as string) || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
      const quarter = (req.query.quarter as string) || 'fall';
      const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
      report = await storage.buildStudentProgressReport(childId, schoolId, {
        schoolYear,
        quarter,
        bandOverride: req.query.band as ProgressReportBand | undefined,
        mentorName: (req.query.mentorName as string) || undefined,
        sessionId,
      });
    }

    if (!report) return res.status(404).json({ message: 'Could not build report' });

    if (format === 'pdf') {
      const pdf = await startProgressReportSpan('progress.report.pdf.download', () =>
        generateProgressReportPdf(report, { includeGuide }),
      );
      const safeName = report.header.studentName.replace(/[^a-zA-Z0-9-_]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="NY-Progress-Report-${safeName}-${report.quarter}-${report.schoolYear}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      await logProgressReportEvent(req, 'progress_report_downloaded', {
        childId,
        schoolId,
        schoolYear: report.schoolYear,
        quarter: report.quarter,
        snapshotId,
        templateVersion: report.templateVersion,
      });
      return res.send(pdf);
    }

    res.json({
      ...report,
      isDraft: !!draft || !snapshotId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to generate report' });
  }
});

router.post('/report/:childId/generate', supabaseAuth, requireSchoolContext, staffOnly, reportRateLimit, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const userId = (req.user as any).id;
    const childId = parseInt(req.params.childId);
    const body = generateQuarterlyReportBodySchema.parse(req.body);

    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });

    const meta = await storage.getQuarterlyProgressMeta(childId, schoolId, body.schoolYear, body.quarter);
    if (!meta?.approvedNarrative?.trim()) {
      return res.status(400).json({
        message: 'Approve the quarterly narrative before generating a district report',
      });
    }

    const report = await storage.buildStudentProgressReport(childId, schoolId, {
      schoolYear: body.schoolYear,
      quarter: body.quarter,
      bandOverride: body.band,
      mentorName: body.mentorName,
    });
    if (!report) return res.status(404).json({ message: 'Could not build report' });

    if (report.completeness.percent < 50) {
      return res.status(400).json({
        message: 'Report completeness is too low for district submission',
        completeness: report.completeness,
      });
    }

    const pdf = await startProgressReportSpan('progress.report.pdf.generate', () =>
      generateProgressReportPdf(report, { includeGuide: body.includeGuide }),
    );
    const pdfSha256 = createHash('sha256').update(pdf).digest('hex');

    const snapshot = await storage.saveQuarterlyProgressSnapshot(
      childId,
      schoolId,
      body.schoolYear,
      body.quarter,
      report.band,
      report.templateVersion,
      report,
      userId,
      pdfSha256,
    );

    await logProgressReportEvent(req, 'progress_report_generated', {
      childId,
      schoolId,
      schoolYear: body.schoolYear,
      quarter: body.quarter,
      snapshotId: snapshot.id,
      templateVersion: report.templateVersion,
      actorId: userId,
    });

    res.status(201).json({
      snapshotId: snapshot.id,
      pdfSha256,
      completeness: report.completeness,
      band: report.band,
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: 'Validation error', errors: e.errors });
    console.error(e);
    res.status(500).json({ message: 'Failed to finalize report' });
  }
});

const emailReportBodySchema = z.object({
  snapshotId: z.number().int().positive(),
});

router.post('/report/:childId/email', supabaseAuth, requireSchoolContext, staffOnly, reportRateLimit, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    const { snapshotId } = emailReportBodySchema.parse(req.body);

    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found' });

    const snap = await storage.getQuarterlyProgressSnapshotById(snapshotId, schoolId);
    if (!snap || snap.childId !== childId) {
      return res.status(404).json({ message: 'Report snapshot not found' });
    }

    const parent = await storage.getUser(child.parentId);
    if (!parent?.email) {
      return res.status(400).json({ message: 'Parent email not found for this student' });
    }

    const report = snap.payloadJson as StudentProgressReportDto;
    const pdf = await startProgressReportSpan('progress.report.pdf.email', () =>
      generateProgressReportPdf(report, { includeGuide: false }),
    );
    const parentName = `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || 'Parent';
    const childName = `${child.firstName} ${child.lastName}`;

    const sent = await sendProgressReportEmail({
      parentEmail: parent.email,
      parentName,
      childName,
      quarter: snap.quarter,
      schoolYear: snap.schoolYear,
      pdfBuffer: pdf,
    });

    if (!sent) {
      return res.status(503).json({ message: 'Email could not be sent. Check SendGrid configuration.' });
    }

    await logProgressReportEvent(req, 'progress_report_emailed', {
      childId,
      schoolId,
      schoolYear: snap.schoolYear,
      quarter: snap.quarter,
      snapshotId: snap.id,
      templateVersion: snap.templateVersion,
    });

    res.json({ success: true, sentTo: parent.email });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: 'Validation error', errors: e.errors });
    console.error(e);
    res.status(500).json({ message: 'Failed to email report' });
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

/** Scheduled week-plan lessons for a child (parallel to progress logs; class-level completion). */
router.get('/parent/:childId/scheduled-lessons', supabaseAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const childId = parseInt(req.params.childId, 10);
    if (isNaN(childId)) return res.status(400).json({ message: 'Invalid child ID' });

    const children = await storage.getChildrenByParentId(userId);
    const child = children.find((c) => c.id === childId);
    if (!child) return res.status(403).json({ message: 'Access denied' });

    const schoolId =
      child.schoolId ||
      (req.user as any).schoolId ||
      (await storage.getUser(userId))?.schoolId;
    if (!schoolId) return res.json({ lessons: [] });

    const enrollments = await storage.getEnrollmentsByChildId(childId);
    const classIds = [
      ...new Set(
        enrollments
          .map((e: any) => e.marketplaceClassId ?? e.classId)
          .filter((id: number | null | undefined): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    if (classIds.length === 0) return res.json({ lessons: [] });

    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;

    const plans = await storage.getPublishedWeekPlansForClassIds(schoolId, classIds);
    const filtered = plans.filter((p) => {
      if (!p.weekStartDate) return true;
      if (from && p.weekStartDate < from) return false;
      if (to && p.weekStartDate > to) return false;
      return true;
    });

    const lessons: Array<{
      blockId: number;
      title: string;
      description: string | null;
      classId: number | null;
      classTitle: string | null;
      weekNumber: number;
      weekStartDate: string | null;
      dayOfWeek: number | null;
      startTime: string | null;
      endTime: string | null;
      isCompleted: boolean;
      completedAt: Date | string | null;
    }> = [];

    for (const plan of filtered) {
      const [blocks, skeletonBlocks] = await Promise.all([
        storage.getWeekPlanBlocksByWeekPlanId(plan.id),
        storage.getSkeletonBlocksBySkeletonId(plan.skeletonId),
      ]);
      const skelById = new Map(skeletonBlocks.map((sb) => [sb.id, sb]));
      for (const b of blocks) {
        const sb = skelById.get(b.skeletonBlockId);
        lessons.push({
          blockId: b.id,
          title: b.title || b.customTitle || sb?.defaultTitle || 'Untitled',
          description: b.description || b.customDescription || null,
          classId: plan.classId,
          classTitle: plan.classTitle,
          weekNumber: plan.weekNumber,
          weekStartDate: plan.weekStartDate,
          dayOfWeek: sb?.dayOfWeek ?? null,
          startTime: sb?.startTime ?? null,
          endTime: sb?.endTime ?? null,
          isCompleted: !!b.isCompleted,
          completedAt: b.completedAt ?? null,
        });
      }
    }

    lessons.sort((a, b) => {
      const d = (a.weekStartDate || '').localeCompare(b.weekStartDate || '');
      if (d !== 0) return d;
      return (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || (a.startTime || '').localeCompare(b.startTime || '');
    });

    res.json({ lessons });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch scheduled lessons' });
  }
});

export default router;
