/** Matches server `formatEnrollmentCoverageLabel` for upcoming payment sublines. */
export function formatEnrollmentCoverageLabel(enrollmentCount: number): string {
  const n = Math.max(0, Math.floor(Number(enrollmentCount) || 0));
  if (n === 0) return '';
  return n === 1 ? '1 Enrollment' : `${n} Enrollments`;
}

export function resolveUpcomingEnrollmentCoverageLabel(payment: {
  enrollmentCoverageLabel?: string;
  enrollmentCount?: number;
  childName?: string;
}): string {
  if (payment.enrollmentCoverageLabel?.trim()) {
    return payment.enrollmentCoverageLabel.trim();
  }
  if (typeof payment.enrollmentCount === 'number' && payment.enrollmentCount > 0) {
    return formatEnrollmentCoverageLabel(payment.enrollmentCount);
  }
  return '';
}
