import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGenerateContent = jest.fn<() => Promise<string | null>>();
const mockGetProgressInsightCache = jest.fn<() => Promise<null>>();
const mockSaveProgressInsightCache = jest.fn<() => Promise<void>>();
const mockGetChildrenByParentId = jest.fn<() => Promise<any[]>>();
const mockBuildBundle = jest.fn<() => Promise<any>>();

jest.mock('../services/anthropic', () => ({
  anthropicService: {
    isAvailable: () => true,
    generateContent: (...args: unknown[]) => mockGenerateContent(...args),
  },
}));

jest.mock('../storage', () => ({
  storage: {
    getProgressInsightCache: (...args: unknown[]) => mockGetProgressInsightCache(...args),
    saveProgressInsightCache: (...args: unknown[]) => mockSaveProgressInsightCache(...args),
    getChildrenByParentId: (...args: unknown[]) => mockGetChildrenByParentId(...args),
    getStudentProgressCurrent: jest.fn(async () => []),
    getStudentProgressLog: jest.fn(async () => []),
    getStudentAssessmentsByChildId: jest.fn(async () => []),
    getLexileHistoryForChildBySchool: jest.fn(async () => []),
    getChildByIdForSchool: jest.fn(async () => null),
  },
}));

jest.mock('../lib/progress-context-bundle', () => ({
  buildProgressContextBundle: (...args: unknown[]) => mockBuildBundle(...args),
  formatBundleForPrompt: () => 'bundle facts',
}));

jest.mock('../middleware/supabase-auth', () => ({
  supabaseAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 42, role: 'parent' };
    next();
  },
  requireSchoolContext: (_req: any, _res: any, next: any) => next(),
}));

import progressInsightsRouter, { aiRateLimit } from '../api/progress-insights';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/progress/insights', progressInsightsRouter);
  return app;
}

describe('progress-insights rate limit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProgressInsightCache.mockResolvedValue(null);
    mockSaveProgressInsightCache.mockResolvedValue(undefined);
    mockGetChildrenByParentId.mockResolvedValue([
      { id: 7, schoolId: 2, firstName: 'Test', lastName: 'Child', gradeLevel: '3' },
    ]);
    mockBuildBundle.mockResolvedValue({
      child: { id: 7, firstName: 'Test', lastName: 'Child', gradeLevel: '3' },
      current: [{ subject: { label: 'Math', key: 'math' }, track: { name: 'Saxon' }, current: { lessonNumber: 10 } }],
      logs: [],
      assessments: [],
      lexileHistory: [],
      derived: { dataGaps: [], weeksSinceLastLogBySubject: {}, subjectsWithNoCurrent: [], recentAssessmentTrend: 'insufficient' },
    });
    mockGenerateContent.mockResolvedValue(
      JSON.stringify({ summary: 'Doing well.', nextSteps: ['Keep reading'] }),
    );
  });

  it('returns 429 after exceeding aiRateLimit max (15/min)', async () => {
    const app = buildApp();
    expect(aiRateLimit).toBeDefined();

    for (let i = 0; i < 15; i++) {
      const res = await request(app).get('/api/progress/insights/summary/7');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/api/progress/insights/summary/7');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/too many requests/i);
  });
});
