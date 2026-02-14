export interface ProrateResult {
  originalPriceCents: number;
  proratedPriceCents: number;
  proratePercentage: number;
  totalDays: number;
  daysRemaining: number;
  daysElapsed: number;
  savingsCents: number;
  reason: string;
}

export function calculateProratedPrice(
  originalPriceCents: number,
  classStartDate: string | Date,
  classEndDate: string | Date,
  enrollmentDate?: string | Date,
): ProrateResult {
  const start = new Date(classStartDate);
  const end = new Date(classEndDate);
  const enroll = enrollmentDate ? new Date(enrollmentDate) : new Date();

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  enroll.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  if (enroll <= start) {
    return {
      originalPriceCents,
      proratedPriceCents: originalPriceCents,
      proratePercentage: 100,
      totalDays,
      daysRemaining: totalDays,
      daysElapsed: 0,
      savingsCents: 0,
      reason: 'Enrollment before or on class start date - full price applies',
    };
  }

  if (enroll >= end) {
    return {
      originalPriceCents,
      proratedPriceCents: 0,
      proratePercentage: 0,
      totalDays,
      daysRemaining: 0,
      daysElapsed: totalDays,
      savingsCents: originalPriceCents,
      reason: 'Enrollment after class end date - class has ended',
    };
  }

  const daysElapsed = Math.ceil((enroll.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = totalDays - daysElapsed;
  const proratePercentage = Math.round((daysRemaining / totalDays) * 100);
  const proratedPriceCents = Math.round((daysRemaining / totalDays) * originalPriceCents);
  const savingsCents = originalPriceCents - proratedPriceCents;

  return {
    originalPriceCents,
    proratedPriceCents,
    proratePercentage,
    totalDays,
    daysRemaining,
    daysElapsed,
    savingsCents,
    reason: `Pro-rated: ${daysRemaining} of ${totalDays} days remaining (${proratePercentage}%)`,
  };
}

export function formatProrateBreakdown(result: ProrateResult): string {
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (result.proratePercentage === 100) {
    return `Full price: ${formatCurrency(result.originalPriceCents)} (enrollment before class start)`;
  }

  if (result.proratePercentage === 0) {
    return `Class has ended - no charge`;
  }

  return [
    `Original: ${formatCurrency(result.originalPriceCents)}`,
    `Pro-rated: ${formatCurrency(result.proratedPriceCents)} (${result.proratePercentage}% remaining)`,
    `Savings: ${formatCurrency(result.savingsCents)}`,
    `${result.daysRemaining} of ${result.totalDays} days remaining`,
  ].join(' | ');
}
