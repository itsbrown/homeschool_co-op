/** Maps ASA child gradeLevel to NY IHIP quarterly form band (pages 2–6 of ASA template). */

export type ProgressReportBand = 'early' | 'lower' | 'mid' | 'upper' | 'secondary';

export const TEMPLATE_VERSION = '2026-05-asa-v1';

const PRE_K = /pre[- ]?k|prek|pk/i;
const KINDERGARTEN = /kindergarten|^k$|^k[- ]|kinder/i;
const GRADE_NUM = /(\d+)/;

export function resolveProgressReportBand(
  gradeLevel: string | null | undefined,
  override?: ProgressReportBand | null,
): ProgressReportBand {
  if (override && ['early', 'lower', 'mid', 'upper', 'secondary'].includes(override)) {
    return override;
  }
  const g = (gradeLevel || '').trim().toLowerCase();
  if (!g) return 'lower';

  if (PRE_K.test(g) || KINDERGARTEN.test(g)) return 'early';

  const numMatch = g.match(GRADE_NUM);
  const gradeNum = numMatch ? parseInt(numMatch[1], 10) : NaN;

  if (!isNaN(gradeNum)) {
    if (gradeNum <= 0) return 'early';
    if (gradeNum <= 2) return 'lower';
    if (gradeNum <= 4) return 'mid';
    if (gradeNum <= 6) return 'upper';
    return 'secondary';
  }

  if (/tycoon|yankee|seeker|pioneer|scout/i.test(g)) {
    if (/tycoon|yankee/i.test(g)) return 'early';
    if (/seeker/i.test(g)) return 'lower';
    if (/pioneer/i.test(g)) return 'mid';
    return 'upper';
  }

  return 'lower';
}

export function phonogramDenominator(band: ProgressReportBand): number {
  switch (band) {
    case 'early':
      return 26;
    case 'lower':
      return 46;
    default:
      return 72;
  }
}

export function annualHourGuidance(band: ProgressReportBand): { min: number; max: number; label: string } {
  if (band === 'secondary') {
    return { min: 990, max: 990, label: '990 hrs/year (grades 7–12)' };
  }
  return { min: 900, max: 900, label: '900 hrs/year (K–6)' };
}
