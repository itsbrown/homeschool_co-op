import { describe, expect, it } from '@jest/globals';
import { IHIP_GUIDE, REPORT_BANDS, allSkillKeysForBand } from '../data/ny-ihip-progress-report-template';

describe('NY IHIP template (verbatim ASA PDF)', () => {
  it('guide includes annual hour guidance', () => {
    const text = JSON.stringify(IHIP_GUIDE);
    expect(text).toContain('900 hrs/year');
    expect(text).toContain('990');
    expect(text).toContain('Parent(s)');
  });

  it('early band includes phonograms /26 skill row', () => {
    const early = REPORT_BANDS.early;
    const labels = early.sections.flatMap((s) => (s.skills || []).map((sk) => sk.label));
    expect(labels.some((l) => l.includes('Phonograms'))).toBe(true);
    expect(labels).toContain('Student can identify their own emotions');
  });

  it('secondary band includes other core subjects section', () => {
    const titles = REPORT_BANDS.secondary.sections.map((s) => s.title);
    expect(titles.some((t) => t.includes('Other Core Subjects'))).toBe(true);
  });

  it('each band has skill keys', () => {
    for (const band of ['early', 'lower', 'mid', 'upper', 'secondary'] as const) {
      expect(allSkillKeysForBand(band).length).toBeGreaterThan(5);
    }
  });
});
