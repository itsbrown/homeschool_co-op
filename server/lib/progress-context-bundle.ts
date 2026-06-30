import { storage } from '../storage';

export type ProgressContextBundle = {
  child: {
    id: number;
    firstName: string;
    lastName: string;
    gradeLevel: string | null;
    currentLexileRange: string | null;
    currentReadingGradeLevel: string | null;
    currentBookList: string | null;
  };
  current: Awaited<ReturnType<typeof storage.getStudentProgressCurrent>>;
  logs: Awaited<ReturnType<typeof storage.getStudentProgressLog>>;
  assessments: Awaited<ReturnType<typeof storage.getStudentAssessmentsByChildId>>;
  lexileHistory: Awaited<ReturnType<typeof storage.getLexileHistoryForChildBySchool>>;
  derived: {
    weeksSinceLastLogBySubject: Record<string, number | null>;
    subjectsWithNoCurrent: string[];
    recentAssessmentTrend: 'improving' | 'stable' | 'declining' | 'insufficient';
    dataGaps: string[];
  };
};

export type BuildProgressContextOptions = {
  childId: number;
  schoolId: number;
  sessionId?: number;
  subjectFilter?: string;
};

function weeksBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}

function filterBySubject<T extends { subject: { label: string; key: string } }>(
  rows: T[],
  subjectFilter?: string,
): T[] {
  if (!subjectFilter) return rows;
  const needle = subjectFilter.toLowerCase();
  return rows.filter(
    (r) => r.subject.label.toLowerCase().includes(needle) || r.subject.key.toLowerCase().includes(needle),
  );
}

function computeAssessmentTrend(
  assessments: Array<{ score: string; assessmentDate: Date | string }>,
): ProgressContextBundle['derived']['recentAssessmentTrend'] {
  if (assessments.length < 2) return 'insufficient';
  const numeric = assessments
    .slice(0, 5)
    .map((a) => parseFloat(String(a.score).replace(/[^\d.]/g, '')))
    .filter((n) => !Number.isNaN(n));
  if (numeric.length < 2) return 'insufficient';
  const newest = numeric[0];
  const oldest = numeric[numeric.length - 1];
  const delta = newest - oldest;
  if (delta > 5) return 'improving';
  if (delta < -5) return 'declining';
  return 'stable';
}

export async function buildProgressContextBundle(
  options: BuildProgressContextOptions,
): Promise<ProgressContextBundle | null> {
  const { childId, schoolId, subjectFilter } = options;
  const child = await storage.getChildByIdForSchool(childId, schoolId);
  if (!child) return null;

  const [currentRaw, logsRaw, assessments, lexileHistory] = await Promise.all([
    storage.getStudentProgressCurrent(childId, schoolId),
    storage.getStudentProgressLog(childId, schoolId),
    storage.getStudentAssessmentsByChildId(childId),
    storage.getLexileHistoryForChildBySchool(childId, schoolId),
  ]);

  const current = filterBySubject(currentRaw, subjectFilter);
  let logs = filterBySubject(logsRaw, subjectFilter);
  if (options.sessionId) {
    logs = logs.filter((l) => l.log.sessionId === options.sessionId);
  }

  const now = new Date();
  const weeksSinceLastLogBySubject: Record<string, number | null> = {};
  const subjectKeysSeen = new Set(current.map((c) => c.subject.key));
  for (const entry of logsRaw) {
    subjectKeysSeen.add(entry.subject.key);
  }

  for (const key of subjectKeysSeen) {
    const subjectLogs = logsRaw.filter((l) => l.subject.key === key);
    const latest = subjectLogs[0]?.log.eventDate;
    weeksSinceLastLogBySubject[key] = latest ? weeksBetween(new Date(latest), now) : null;
  }

  const subjectsWithNoCurrent = [...subjectKeysSeen].filter(
    (key) => !current.some((c) => c.subject.key === key),
  );

  const dataGaps: string[] = [];
  if (current.length === 0 && logs.length === 0) {
    dataGaps.push('No curriculum progress logged yet');
  }
  for (const [key, weeks] of Object.entries(weeksSinceLastLogBySubject)) {
    if (weeks != null && weeks >= 4) {
      dataGaps.push(`No ${key} log in ${weeks} weeks`);
    }
  }
  if (!child.currentLexileRange && lexileHistory.length === 0) {
    dataGaps.push('No reading level (Lexile) recorded');
  }
  if (assessments.length === 0) {
    dataGaps.push('No formal assessments on file');
  }

  return {
    child: {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      gradeLevel: child.gradeLevel,
      currentLexileRange: child.currentLexileRange,
      currentReadingGradeLevel: child.currentReadingGradeLevel,
      currentBookList: child.currentBookList,
    },
    current,
    logs,
    assessments,
    lexileHistory,
    derived: {
      weeksSinceLastLogBySubject,
      subjectsWithNoCurrent,
      recentAssessmentTrend: computeAssessmentTrend(assessments),
      dataGaps,
    },
  };
}

export function formatBundleForPrompt(bundle: ProgressContextBundle): string {
  const { child, current, logs, assessments, lexileHistory, derived } = bundle;
  const gapLines = derived.dataGaps.length ? derived.dataGaps.map((g) => `- ${g}`).join('\n') : '- None identified';
  const staleSubjects = Object.entries(derived.weeksSinceLastLogBySubject)
    .filter(([, w]) => w != null && w >= 4)
    .map(([k, w]) => `${k}: ${w} weeks since last log`)
    .join('; ');

  return `Student: ${child.firstName} ${child.lastName}, grade ${child.gradeLevel ?? 'unknown'}
Reading snapshot: Lexile ${child.currentLexileRange || 'n/a'}, grade level ${child.currentReadingGradeLevel || 'n/a'}, book list ${child.currentBookList || 'n/a'}

Current positions:
${current.map((c) => `- ${c.subject.label} / ${c.track.name}: lesson ${c.current.lessonNumber ?? 'n/a'}, unit ${c.current.unitLabel ?? 'n/a'}, ${c.current.topicsSummary ?? ''}`).join('\n') || 'None'}

Recent session activity (last 10):
${logs.slice(0, 10).map((l) => `- ${l.subject.label} (${l.log.eventDate}): ${JSON.stringify(l.log.topicsCovered || l.log.topicsSummary)}`).join('\n') || 'None'}

Assessments (last 5):
${assessments.slice(0, 5).map((a) => `- ${a.score} on ${new Date(a.assessmentDate).toLocaleDateString()}`).join('\n') || 'None'}

Lexile history (last 5):
${lexileHistory.slice(0, 5).map((h) => `- ${new Date(h.assessmentDate).toLocaleDateString()}: ${h.score}`).join('\n') || 'None'}

Derived signals:
- Assessment trend: ${derived.recentAssessmentTrend}
- Subjects without current position: ${derived.subjectsWithNoCurrent.join(', ') || 'none'}
- Stale logging: ${staleSubjects || 'none'}
- Data gaps:
${gapLines}

IMPORTANT: Base all recommendations only on the facts above. Do not invent scores, checklist marks, or assessment results.`;
}
