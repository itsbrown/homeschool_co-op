/** Label for how many enrollments a payment installment covers (cart / multi-child plans). */
export function formatEnrollmentCoverageLabel(enrollmentCount: number): string {
  const n = Math.max(0, Math.floor(Number(enrollmentCount) || 0));
  if (n === 0) return '';
  return n === 1 ? '1 Enrollment' : `${n} Enrollments`;
}
