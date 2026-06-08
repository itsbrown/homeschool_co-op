import { describe, expect, it } from '@jest/globals';
import { buildStudentProgressReport } from '../lib/build-student-progress-report';
import { generateProgressReportPdf } from '../services/progressReportPdf';
import type { Child } from '../../shared/schema';

const mockChild: Child = {
  id: 1,
  parentId: 1,
  schoolId: 1,
  firstName: 'Test',
  lastName: 'Student',
  gradeLevel: 'Kindergarten',
  dateOfBirth: '2019-01-01',
  gender: null,
  medicalNotes: null,
  emergencyContact: null,
  profileImageUrl: null,
  currentLexileRange: '400L',
  currentReadingGradeLevel: '1.2',
  currentBookList: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Child;

describe('progress report PDF', () => {
  it('builds early band for kindergarten', () => {
    const report = buildStudentProgressReport(mockChild, {
      schoolYear: '2025-2026',
      quarter: 'fall',
      current: [],
      logs: [],
      assessments: [],
      meta: {
        approvedNarrative: 'Covered phonics and counting.',
        asaCoopHours: 45,
        homeInstructionHours: 180,
        phonogramCount: 12,
      },
      skillChecks: {},
    });
    expect(report.band).toBe('early');
    expect(report.header.keyMaterialCovered).toContain('phonics');
    expect(report.populated.phonogramDisplay).toBe('12/26');
  });

  it('generates PDF buffer with %PDF header', async () => {
    const report = buildStudentProgressReport(mockChild, {
      schoolYear: '2025-2026',
      quarter: 'fall',
      current: [],
      logs: [],
      assessments: [],
      meta: { approvedNarrative: 'Sample quarter work.' },
      skillChecks: {},
    });
    const buf = await generateProgressReportPdf(report, { includeGuide: true });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
