import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { anthropicService } from '../services/anthropic';

const router = Router();

const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  validate: false,
  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    return user?.id ? `user_${user.id}` : 'anon';
  },
  message: { message: 'Too many requests. Please wait a moment before trying again.' },
});

async function verifyParentChild(childId: number, userId: number): Promise<{ child: any; schoolId: number } | null> {
  const children = await storage.getChildrenByParentId(userId);
  const child = children.find((c) => c.id === childId);
  if (!child?.schoolId) return null;
  return { child, schoolId: child.schoolId };
}

router.get('/summary/:childId', supabaseAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const childId = parseInt(req.params.childId);
    const userId = (req.user as any).id;
    const access = await verifyParentChild(childId, userId);
    if (!access) return res.status(403).json({ message: 'Access denied' });

    const cached = await storage.getProgressInsightCache(childId, access.schoolId);
    if (cached && Date.now() - cached.generatedAt.getTime() < 24 * 60 * 60 * 1000) {
      return res.json({ summary: cached.summary, nextSteps: cached.nextSteps, cached: true });
    }

    if (!anthropicService.isAvailable()) {
      return res.status(503).json({ message: 'AI insights temporarily unavailable' });
    }

    const current = await storage.getStudentProgressCurrent(childId, access.schoolId);
    const logs = await storage.getStudentProgressLog(childId, access.schoolId);
    const assessments = await storage.getStudentAssessmentsByChildId(childId);

    if (current.length === 0 && logs.length === 0 && assessments.length === 0) {
      return res.json({
        noData: true,
        summary: 'Progress data will appear here once educators log curriculum updates and reading assessments.',
        nextSteps: [],
      });
    }

    const prompt = `You are a warm educational advisor writing for a homeschool parent.

Student: ${access.child.firstName} ${access.child.lastName}, grade ${access.child.gradeLevel}
Reading snapshot: Lexile ${access.child.currentLexileRange || 'n/a'}, grade level ${access.child.currentReadingGradeLevel || 'n/a'}

Current positions by subject:
${current.map((c) => `- ${c.subject.label} / ${c.track.name}: lesson ${c.current.lessonNumber ?? 'n/a'}, unit ${c.current.unitLabel ?? 'n/a'}, ${c.current.topicsSummary ?? ''}`).join('\n') || 'None'}

Recent session activity (last 10):
${logs.slice(0, 10).map((l) => `- ${l.subject.label}: ${JSON.stringify(l.log.topicsCovered || l.log.topicsSummary)}`).join('\n') || 'None'}

Reading assessments (last 5):
${assessments.slice(0, 5).map((a) => `- ${a.score} on ${new Date(a.assessmentDate).toLocaleDateString()}`).join('\n') || 'None'}

Return JSON only:
{
  "summary": "2-3 sentences plain language overview",
  "nextSteps": ["action 1", "action 2", "action 3"]
}`;

    const raw = await anthropicService.generateContent(prompt, true, 1024);
    const jsonMatch = raw?.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw || '{}');

    await storage.saveProgressInsightCache(
      childId,
      access.schoolId,
      parsed.summary || '',
      parsed.nextSteps || [],
      'claude-sonnet',
    );

    res.json({ summary: parsed.summary, nextSteps: parsed.nextSteps, cached: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to generate summary' });
  }
});

export default router;
