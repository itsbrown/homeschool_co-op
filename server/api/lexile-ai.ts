import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { storage } from '../storage';
import { anthropicService } from '../services/anthropic';
import { supabaseAuth, requireSchoolContext } from '../middleware/supabase-auth';
import { buildProgressContextBundle, formatBundleForPrompt } from '../lib/progress-context-bundle';

const router = Router();

const ALLOWED_ROLES = ['schoolAdmin', 'admin', 'educator', 'teacher'];

function requireLexileRole(req: Request, res: Response, next: Function) {
  const role = (req.user as any)?.role || (req.user as any)?.activeRole;
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ message: 'Only educators and administrators can access Lexile AI insights' });
  }
  next();
}

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

// GET /api/lexile/insights/student/:childId
router.get('/student/:childId', supabaseAuth, requireSchoolContext, requireLexileRole, aiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!anthropicService.isAvailable()) {
      return res.status(503).json({ message: 'AI insights are temporarily unavailable. Please try again later.' });
    }

    const childId = parseInt(req.params.childId);
    const schoolId = (req.user as any).schoolId;

    if (isNaN(childId)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    // Tenant isolation: verify child belongs to requester's school
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) {
      return res.status(404).json({ message: 'Student not found in your school' });
    }

    const bundle = await buildProgressContextBundle({ childId, schoolId });
    if (!bundle) {
      return res.status(404).json({ message: 'Student not found in your school' });
    }

    const { lexileHistory } = bundle;

    if (lexileHistory.length === 0 && !child.currentLexileRange && !child.currentReadingGradeLevel) {
      return res.json({ noData: true, message: 'No lexile data recorded yet' });
    }

    const prompt = `You are an expert reading specialist helping educators understand student reading data.

${formatBundleForPrompt(bundle)}

Behavioral constraints:
- Be specific and actionable
- Use plain language suitable for educators (not highly technical)
- Base recommendations on the actual data provided
- If data is limited, acknowledge it and provide general guidance
- Do not invent scores or assessment results

Return a JSON object with exactly these fields:
{
  "gradeComparison": "A 1-2 sentence comparison of this student's reading level relative to typical grade expectations",
  "interpretation": "A 2-3 sentence plain-language interpretation of what the lexile data means for this student",
  "nextGoals": ["goal 1", "goal 2", "goal 3"],
  "additionalBooks": ["book title 1", "book title 2", "book title 3", "book title 4"]
}`;

    const raw = await anthropicService.generateContent(prompt, true, 1024);
    if (!raw) {
      return res.status(503).json({ message: 'AI service did not return a response. Please try again.' });
    }

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return res.status(500).json({ message: 'AI returned an unexpected response. Please try again.' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error generating student lexile insight:', error);
    res.status(500).json({ message: 'Failed to generate reading insights. Please try again later.' });
  }
});

const groupInsightSchema = z.object({
  childIds: z.array(z.number().int().positive()).min(1),
});

// POST /api/lexile/insights/group
router.post('/group', supabaseAuth, requireSchoolContext, requireLexileRole, aiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!anthropicService.isAvailable()) {
      return res.status(503).json({ message: 'AI insights are temporarily unavailable. Please try again later.' });
    }

    const parsed = groupInsightSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'childIds array is required', errors: parsed.error.errors });
    }

    const { childIds } = parsed.data;
    const schoolId = (req.user as any).schoolId;

    const studentData = await Promise.all(childIds.map(async (id) => {
      // Tenant isolation: each child must belong to requester's school
      const child = await storage.getChildByIdForSchool(id, schoolId);
      if (!child) return null;
      const history = await storage.getLexileHistoryForChildBySchool(id, schoolId);
      return {
        id,
        name: `${child.firstName} ${child.lastName}`,
        gradeLevel: child.gradeLevel,
        currentLexileRange: child.currentLexileRange,
        currentReadingGradeLevel: child.currentReadingGradeLevel,
        currentBookList: child.currentBookList,
        latestAssessment: history[0] || null,
      };
    }));

    const validStudents = studentData.filter(Boolean);
    if (validStudents.length === 0) {
      return res.status(400).json({ message: 'No valid students found in your school' });
    }

    const prompt = `You are an expert reading specialist providing a group reading level summary for an educator.

Group of ${validStudents.length} students with their reading data:
${validStudents.map(s => `- ${s!.name} (Grade ${s!.gradeLevel}): Lexile ${s!.currentLexileRange || 'Unknown'}, Reading Grade ${s!.currentReadingGradeLevel || 'Unknown'}`).join('\n')}

Behavioral constraints:
- Organize students into meaningful reading tiers
- Provide actionable book recommendations for each tier
- Identify students who may need extra support
- Use plain language suitable for educators

Return a JSON object with exactly these fields:
{
  "tiers": [
    {
      "label": "Tier name (e.g., Advanced Readers, On-Grade Readers, Developing Readers)",
      "lexileRange": "Approximate lexile range for this tier",
      "studentNames": ["name1", "name2"],
      "books": ["book title 1", "book title 2", "book title 3"]
    }
  ],
  "supportNeeded": ["Student name and brief reason they may need support"],
  "groupNarrative": "A 2-3 sentence narrative summary of the group's overall reading levels and recommendations"
}`;

    const raw = await anthropicService.generateContent(prompt, true, 1500);
    if (!raw) {
      return res.status(503).json({ message: 'AI service did not return a response. Please try again.' });
    }

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return res.status(500).json({ message: 'AI returned an unexpected response. Please try again.' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error generating group lexile insight:', error);
    res.status(500).json({ message: 'Failed to generate group reading summary. Please try again later.' });
  }
});

export default router;
