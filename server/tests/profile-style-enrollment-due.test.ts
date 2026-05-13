import { describe, expect, it } from '@jest/globals';
import {
  isEnrollmentIncludedInProfileClassAmountDue,
  sumProfileStyleClassEnrollmentDueCents,
} from '../lib/profile-style-enrollment-due';

describe('profile-style-enrollment-due', () => {
  it('excludes completed/cancelled etc. from profile-style class due sum', () => {
    expect(isEnrollmentIncludedInProfileClassAmountDue('completed')).toBe(false);
    expect(isEnrollmentIncludedInProfileClassAmountDue('enrolled')).toBe(true);
    expect(isEnrollmentIncludedInProfileClassAmountDue(undefined)).toBe(true);
  });

  it('sums only included statuses with positive effective balance', () => {
    const enrollments = [
      { status: 'enrolled', effectiveBalance: 5_000 },
      { status: 'completed', effectiveBalance: 3_000 },
      { status: 'enrolled', effectiveBalance: 0 },
    ];
    expect(sumProfileStyleClassEnrollmentDueCents(enrollments)).toBe(5_000);
  });

  it('matches formula when effectiveBalance absent', () => {
    const enrollments = [
      { status: 'enrolled', totalCost: 10_000, totalPaid: 2_000, compAmountCents: 0 },
    ];
    expect(sumProfileStyleClassEnrollmentDueCents(enrollments)).toBe(8_000);
  });
});
