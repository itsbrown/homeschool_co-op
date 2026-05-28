import { describe, expect, it } from '@jest/globals';
import { insertStudentProgressLogBodySchema } from '../../shared/schema';

describe('insertStudentProgressLogBodySchema', () => {
  const base = {
    sessionId: 1,
    progressTrackId: 2,
    eventDate: '2026-05-26',
  };

  it('accepts lesson number only', () => {
    const r = insertStudentProgressLogBodySchema.safeParse({ ...base, lessonNumber: 12 });
    expect(r.success).toBe(true);
  });

  it('accepts unit label only', () => {
    const r = insertStudentProgressLogBodySchema.safeParse({ ...base, unitLabel: 'Chapter 4' });
    expect(r.success).toBe(true);
  });

  it('accepts topics covered only', () => {
    const r = insertStudentProgressLogBodySchema.safeParse({ ...base, topicsCovered: 'Fractions, decimals' });
    expect(r.success).toBe(true);
  });

  it('rejects when lesson, unit, and topics are all empty', () => {
    const r = insertStudentProgressLogBodySchema.safeParse({ ...base });
    expect(r.success).toBe(false);
  });
});
