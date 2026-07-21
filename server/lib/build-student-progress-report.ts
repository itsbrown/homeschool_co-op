import {
  getBandTemplate,
  IHIP_GUIDE,
  IHIP_TEMPLATE_VERSION,
  type ReportBandTemplate,
} from '../data/ny-ihip-progress-report-template';
import {
  annualHourGuidance,
  phonogramDenominator,
  resolveProgressReportBand,
  type ProgressReportBand,
} from './resolve-progress-report-band';
import type { Child } from '../../shared/schema';

export type SkillCheckMap = Record<string, Record<string, 'unchecked' | 'consistent' | 'na'>>;

export type QuarterlyMetaInput = {
  quarterLabel?: string | null;
  asaCoopHours?: number | null;
  homeInstructionHours?: number | null;
  approvedNarrative?: string | null;
  draftNarrative?: string | null;
  notesObservations?: string | null;
  phonogramCount?: number | null;
  mathLevelLabel?: string | null;
  mathFallPercent?: number | null;
  mathWinterPercent?: number | null;
  mathSpringPercent?: number | null;
};

export type BuildReportOptions = {
  schoolYear: string;
  quarter: string;
  bandOverride?: ProgressReportBand;
  mentorName?: string | null;
  meta?: QuarterlyMetaInput | null;
  skillChecks?: SkillCheckMap;
  current: Awaited<ReturnType<typeof import('./assessment-progress-db').getStudentProgressCurrent>>;
  logs: Awaited<ReturnType<typeof import('./assessment-progress-db').getStudentProgressLog>>;
  assessments: Array<{ score: string; assessmentDate: Date | string; lesson?: number | null }>;
  /** Optional published schedule lessons for the child (coverage + completion marks). */
  scheduledLessons?: Array<{
    title: string;
    classTitle?: string | null;
    weekNumber?: number;
    weekStartDate?: string | null;
    isCompleted: boolean;
  }>;
};

export type StudentProgressReportDto = {
  template: 'ny-ihip-quarterly';
  templateVersion: string;
  band: ProgressReportBand;
  bandTemplate: ReportBandTemplate;
  guide: typeof IHIP_GUIDE;
  schoolYear: string;
  quarter: string;
  generatedAt: string;
  header: {
    studentName: string;
    mentorInstructor: string;
    quarterDates: string;
    totalHours: string;
    keyMaterialCovered: string;
  };
  populated: {
    readingLevel?: string;
    lexile?: string;
    phonogramDisplay?: string;
    mathLevelLabel?: string;
    mathPercents?: { fall?: number; winter?: number; spring?: number };
    otherCoreSubjects?: string;
  };
  skillChecks: SkillCheckMap;
  completeness: { filled: number; total: number; percent: number; gaps: string[] };
  gaps: string[];
  raw: {
    current: BuildReportOptions['current'];
    sessionLogs: BuildReportOptions['logs'];
    readingAssessments: BuildReportOptions['assessments'];
    scheduledLessons?: BuildReportOptions['scheduledLessons'];
  };
};

function buildKeyMaterial(logs: BuildReportOptions['logs'], approved?: string | null, draft?: string | null): string {
  if (approved?.trim()) return approved.trim();
  if (draft?.trim()) return draft.trim();
  const parts = logs
    .slice(0, 12)
    .map((l) => {
      const topic =
        l.log.topicsSummary ||
        (typeof l.log.topicsCovered === 'string' ? l.log.topicsCovered : null) ||
        '';
      return topic ? `${l.subject.label}: ${topic}` : null;
    })
    .filter(Boolean);
  return parts.join('; ') || '';
}

function buildOtherCoreSubjects(
  logs: BuildReportOptions['logs'],
  band: ProgressReportBand,
): string | undefined {
  if (band !== 'secondary') return undefined;
  const coreKeys = new Set(['science', 'history', 'social_studies', 'social studies']);
  const parts = logs
    .filter((l) => coreKeys.has(l.subject.key.toLowerCase()) || /science|history|social/i.test(l.subject.label))
    .slice(0, 8)
    .map((l) => `${l.subject.label}: ${l.log.topicsSummary || l.log.unitLabel || 'covered'}`);
  return parts.length ? parts.join('\n') : undefined;
}

export function computeReportCompleteness(
  band: ProgressReportBand,
  header: StudentProgressReportDto['header'],
  meta: QuarterlyMetaInput | null | undefined,
  skillChecks: SkillCheckMap,
): { filled: number; total: number; percent: number; gaps: string[] } {
  const gaps: string[] = [];
  let filled = 0;
  let total = 0;

  const check = (ok: boolean, label: string) => {
    total += 1;
    if (ok) filled += 1;
    else gaps.push(label);
  };

  check(!!header.studentName.trim(), 'Student name');
  check(!!header.quarterDates.trim(), 'Quarter / dates');
  check(!!header.keyMaterialCovered.trim(), 'Key material covered (approve narrative)');
  check(
    (meta?.asaCoopHours ?? 0) + (meta?.homeInstructionHours ?? 0) > 0,
    'Total instructional hours',
  );

  const template = getBandTemplate(band);
  for (const section of template.sections) {
    for (const skill of section.skills || []) {
      if (skill.key === 'lit_phonograms') {
        total += 1;
        if (meta?.phonogramCount != null) filled += 1;
        else gaps.push('Phonogram count');
        continue;
      }
      for (const term of skill.columns || []) {
        total += 1;
        const st = skillChecks[skill.key]?.[term];
        if (st && st !== 'unchecked') filled += 1;
        else gaps.push(`${skill.label} (${term})`);
      }
    }
  }

  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
  return { filled, total, percent, gaps: gaps.slice(0, 15) };
}

export function buildStudentProgressReport(
  child: Child,
  options: BuildReportOptions,
): StudentProgressReportDto {
  const band = resolveProgressReportBand(child.gradeLevel, options.bandOverride);
  const bandTemplate = getBandTemplate(band);
  const meta = options.meta ?? null;
  const skillChecks = options.skillChecks ?? {};

  const totalHoursNum = (meta?.asaCoopHours ?? 0) + (meta?.homeInstructionHours ?? 0);
  const hourGuidance = annualHourGuidance(band);

  const header = {
    studentName: `${child.firstName} ${child.lastName}`.trim(),
    mentorInstructor: options.mentorName?.trim() || 'Parent(s)',
    quarterDates: meta?.quarterLabel?.trim() || `${options.quarter} ${options.schoolYear}`,
    totalHours: totalHoursNum > 0 ? `${totalHoursNum} hrs` : '________ hrs',
    keyMaterialCovered: buildKeyMaterial(options.logs, meta?.approvedNarrative, meta?.draftNarrative),
  };

  const latestAssessment = options.assessments[0];
  const denom = phonogramDenominator(band);
  const phonogramDisplay =
    meta?.phonogramCount != null ? `${meta.phonogramCount}/${denom}` : `___/${denom}`;

  const gaps: string[] = [];
  if (!meta?.approvedNarrative?.trim()) gaps.push('Approved quarterly narrative');
  if (totalHoursNum <= 0) gaps.push('Instructional hours');

  const dto: StudentProgressReportDto = {
    template: 'ny-ihip-quarterly',
    templateVersion: IHIP_TEMPLATE_VERSION,
    band,
    bandTemplate,
    guide: IHIP_GUIDE,
    schoolYear: options.schoolYear,
    quarter: options.quarter,
    generatedAt: new Date().toISOString(),
    header,
    populated: {
      readingLevel: child.currentReadingGradeLevel ?? undefined,
      lexile: child.currentLexileRange ?? undefined,
      phonogramDisplay,
      mathLevelLabel: meta?.mathLevelLabel ?? undefined,
      mathPercents: {
        fall: meta?.mathFallPercent ?? undefined,
        winter: meta?.mathWinterPercent ?? undefined,
        spring: meta?.mathSpringPercent ?? undefined,
      },
      otherCoreSubjects: buildOtherCoreSubjects(options.logs, band),
    },
    skillChecks,
    completeness: { filled: 0, total: 0, percent: 0, gaps: [] },
    gaps,
    raw: {
      current: options.current,
      sessionLogs: options.logs,
      readingAssessments: options.assessments.slice(0, 20),
      scheduledLessons: options.scheduledLessons ?? [],
    },
  };

  dto.completeness = computeReportCompleteness(band, header, meta, skillChecks);
  if (!latestAssessment?.score && !child.currentReadingGradeLevel) {
    gaps.push('Reading level or assessment score');
  }
  dto.gaps = [...new Set([...gaps, ...dto.completeness.gaps.slice(0, 5)])];

  dto.header.totalHours =
    totalHoursNum > 0
      ? `${totalHoursNum} hrs (${hourGuidance.label})`
      : `________ hrs (${hourGuidance.label})`;

  return dto;
}
