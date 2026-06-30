import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { storage } from '../storage';
import { supabaseAuth, requireSchoolContext } from '../middleware/supabase-auth';
import { anthropicService } from '../services/anthropic';
import {
  buildProgressContextBundle,
  formatBundleForPrompt,
} from '../lib/progress-context-bundle';

const router = Router();

const STAFF_ROLES = ['schoolAdmin', 'admin', 'educator', 'teacher', 'superAdmin'];

const insightResponseSchema = z.object({
  summary: z.string(),
  nextSteps: z.array(z.string()),
  suggestedQuarterlyNarrative: z.string().optional(),
  dataGaps: z.array(z.string()).optional(),
});

export const aiRateLimit = rateLimit({
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

async function loadOrGenerateInsight(childId: number, schoolId: number, child: any) {
  const cached = await storage.getProgressInsightCache(childId, schoolId);
  if (cached && Date.now() - cached.generatedAt.getTime() < 24 * 60 * 60 * 1000) {
    return { summary: cached.summary, nextSteps: cached.nextSteps, cached: true as const };
  }

  const bundle = await buildProgressContextBundle({ childId, schoolId });
  if (!bundle) return { notFound: true as const };

  if (bundle.current.length === 0 && bundle.logs.length === 0 && bundle.assessments.length === 0) {
    return {
      noData: true as const,
      summary: 'Progress data will appear here once educators log curriculum updates and reading assessments.',
      nextSteps: [] as string[],
      dataGaps: bundle.derived.dataGaps,
    };
  }

  if (!anthropicService.isAvailable()) {
    return { unavailable: true as const };
  }

  const prompt = `You are a warm educational advisor writing for a homeschool parent.

${formatBundleForPrompt(bundle)}

Return JSON only:
{
  "summary": "2-3 sentences plain language overview",
  "nextSteps": ["action 1", "action 2", "action 3"],
  "suggestedQuarterlyNarrative": "optional 2-3 sentence draft for quarterly report key material (facts only)",
  "dataGaps": ["gap 1"]
}`;

  const raw = await anthropicService.generateContent(prompt, true, 1024);
  const jsonMatch = raw?.match(/\{[\s\S]*\}/);
  const parsed = insightResponseSchema.parse(JSON.parse(jsonMatch ? jsonMatch[0] : raw || '{}'));

  await storage.saveProgressInsightCache(
    childId,
    schoolId,
    parsed.summary,
    parsed.nextSteps,
    'claude-sonnet',
  );

  return {
    summary: parsed.summary,
    nextSteps: parsed.nextSteps,
    suggestedQuarterlyNarrative: parsed.suggestedQuarterlyNarrative,
    dataGaps: parsed.dataGaps ?? bundle.derived.dataGaps,
    cached: false as const,
  };
}

router.get('/summary/:childId', supabaseAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const childId = parseInt(req.params.childId);
    const userId = (req.user as any).id;
    const access = await verifyParentChild(childId, userId);
    if (!access) return res.status(403).json({ message: 'Access denied' });

    const result = await loadOrGenerateInsight(childId, access.schoolId, access.child);
    if ('notFound' in result) return res.status(404).json({ message: 'Student not found' });
    if ('unavailable' in result) return res.status(503).json({ message: 'AI insights temporarily unavailable' });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to generate summary' });
  }
});

router.get('/staff/summary/:childId', supabaseAuth, requireSchoolContext, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const role = (req.user as any).role || (req.user as any).activeRole;
    if (!STAFF_ROLES.includes(role)) {
      return res.status(403).json({ message: 'Staff access required' });
    }

    const childId = parseInt(req.params.childId);
    const schoolId = (req.user as any).schoolId;
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) return res.status(404).json({ message: 'Student not found in your school' });

    const result = await loadOrGenerateInsight(childId, schoolId, child);
    if ('notFound' in result) return res.status(404).json({ message: 'Student not found' });
    if ('unavailable' in result) return res.status(503).json({ message: 'AI insights temporarily unavailable' });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to generate summary' });
  }
});

export default router;
