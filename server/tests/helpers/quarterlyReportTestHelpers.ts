import { REPORT_BANDS } from '../../data/ny-ihip-progress-report-template';
import type { ProgressReportBand } from '../../lib/resolve-progress-report-band';

export function buildFullSkillChecksForBand(
  band: ProgressReportBand,
): Array<{ skillKey: string; term: 'fall' | 'winter' | 'spring'; status: 'consistent' }> {
  const checks: Array<{ skillKey: string; term: 'fall' | 'winter' | 'spring'; status: 'consistent' }> = [];
  for (const section of REPORT_BANDS[band].sections) {
    for (const skill of section.skills || []) {
      if (skill.key === 'lit_phonograms') continue;
      for (const term of skill.columns || []) {
        checks.push({ skillKey: skill.key, term, status: 'consistent' });
      }
    }
  }
  return checks;
}

export function currentSchoolYearLabel(): string {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}
