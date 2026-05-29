import {
  formatEnrollmentCoverageLabel,
  resolveUpcomingEnrollmentCoverageLabel,
} from '../enrollmentCoverageLabel';

describe('enrollmentCoverageLabel', () => {
  it('formats singular and plural labels', () => {
    expect(formatEnrollmentCoverageLabel(1)).toBe('1 Enrollment');
    expect(formatEnrollmentCoverageLabel(3)).toBe('3 Enrollments');
    expect(formatEnrollmentCoverageLabel(0)).toBe('');
  });

  it('prefers API enrollmentCoverageLabel', () => {
    expect(
      resolveUpcomingEnrollmentCoverageLabel({
        enrollmentCoverageLabel: '3 Enrollments',
        childName: 'ho ho',
      }),
    ).toBe('3 Enrollments');
  });

  it('derives label from enrollmentCount when label omitted', () => {
    expect(
      resolveUpcomingEnrollmentCoverageLabel({
        enrollmentCount: 3,
        childName: 'ho ho',
      }),
    ).toBe('3 Enrollments');
  });
});
