import { differenceInDays, parseISO, isAfter, isBefore, startOfDay } from 'date-fns';

export interface ProRatedRefundResult {
  fullRefundAmount: number;
  proRatedAmount: number;
  usedPortion: number;
  remainingPortion: number;
  daysTotal: number;
  daysUsed: number;
  daysRemaining: number;
  refundPercentage: number;
  isBeforeStart: boolean;
  isAfterEnd: boolean;
  reason: string;
}

export function calculateProRatedRefund(
  totalPaidCents: number,
  programStartDate: string | Date,
  programEndDate: string | Date,
  cancellationDate: Date = new Date()
): ProRatedRefundResult {
  const startDate = startOfDay(typeof programStartDate === 'string' ? parseISO(programStartDate) : programStartDate);
  const endDate = startOfDay(typeof programEndDate === 'string' ? parseISO(programEndDate) : programEndDate);
  const cancelDate = startOfDay(cancellationDate);

  const totalDays = differenceInDays(endDate, startDate) + 1;
  
  if (totalDays <= 0) {
    return {
      fullRefundAmount: totalPaidCents,
      proRatedAmount: totalPaidCents,
      usedPortion: 0,
      remainingPortion: totalPaidCents,
      daysTotal: 0,
      daysUsed: 0,
      daysRemaining: 0,
      refundPercentage: 100,
      isBeforeStart: true,
      isAfterEnd: false,
      reason: 'Invalid program dates',
    };
  }

  if (isBefore(cancelDate, startDate)) {
    return {
      fullRefundAmount: totalPaidCents,
      proRatedAmount: totalPaidCents,
      usedPortion: 0,
      remainingPortion: totalPaidCents,
      daysTotal: totalDays,
      daysUsed: 0,
      daysRemaining: totalDays,
      refundPercentage: 100,
      isBeforeStart: true,
      isAfterEnd: false,
      reason: 'Full refund - cancellation before program start',
    };
  }

  if (isAfter(cancelDate, endDate)) {
    return {
      fullRefundAmount: totalPaidCents,
      proRatedAmount: 0,
      usedPortion: totalPaidCents,
      remainingPortion: 0,
      daysTotal: totalDays,
      daysUsed: totalDays,
      daysRemaining: 0,
      refundPercentage: 0,
      isBeforeStart: false,
      isAfterEnd: true,
      reason: 'No refund - program has ended',
    };
  }

  const daysElapsed = differenceInDays(cancelDate, startDate);
  const daysRemaining = totalDays - daysElapsed;
  
  if (daysRemaining <= 0) {
    return {
      fullRefundAmount: totalPaidCents,
      proRatedAmount: 0,
      usedPortion: totalPaidCents,
      remainingPortion: 0,
      daysTotal: totalDays,
      daysUsed: totalDays,
      daysRemaining: 0,
      refundPercentage: 0,
      isBeforeStart: false,
      isAfterEnd: true,
      reason: 'No refund - program complete',
    };
  }
  
  const refundPercentage = Math.round((daysRemaining / totalDays) * 100);
  const proRatedAmount = Math.round((daysRemaining / totalDays) * totalPaidCents);
  const usedPortion = totalPaidCents - proRatedAmount;

  return {
    fullRefundAmount: totalPaidCents,
    proRatedAmount,
    usedPortion,
    remainingPortion: proRatedAmount,
    daysTotal: totalDays,
    daysUsed: daysElapsed,
    daysRemaining,
    refundPercentage,
    isBeforeStart: false,
    isAfterEnd: false,
    reason: `Pro-rated refund - ${daysRemaining} of ${totalDays} days remaining`,
  };
}

export function formatRefundBreakdown(result: ProRatedRefundResult): string {
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  
  if (result.isBeforeStart) {
    return `Full refund of ${formatCurrency(result.fullRefundAmount)} available (cancellation before program start)`;
  }
  
  if (result.proRatedAmount === 0) {
    return `No refund available (program has ended)`;
  }
  
  return `Pro-rated refund: ${formatCurrency(result.proRatedAmount)} (${result.refundPercentage}% of ${formatCurrency(result.fullRefundAmount)})
Days used: ${result.daysUsed} of ${result.daysTotal}
Days remaining: ${result.daysRemaining}`;
}
