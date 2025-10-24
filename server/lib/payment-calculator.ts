/**
 * Date-based payment schedule calculator
 * Calculates payment installments based on program start/end dates and payment frequency
 */

export type PaymentFrequency = 'weekly' | 'biweekly' | 'monthly' | 'one_time';

export interface PaymentSchedule {
  totalAmount: number; // in cents
  numberOfPayments: number;
  paymentAmount: number; // in cents per payment
  finalPaymentAmount: number; // in cents (adjusted for rounding)
  paymentDates: Date[];
  frequency: PaymentFrequency;
  startDate: Date;
  endDate: Date;
}

/**
 * Calculate the number of days between two dates
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((utcEnd - utcStart) / msPerDay);
}

/**
 * Calculate payment schedule based on program dates and frequency
 */
export function calculatePaymentSchedule(
  totalAmountCents: number,
  startDate: Date,
  endDate: Date,
  frequency: PaymentFrequency
): PaymentSchedule {
  // For one-time payments, return single payment
  if (frequency === 'one_time') {
    return {
      totalAmount: totalAmountCents,
      numberOfPayments: 1,
      paymentAmount: totalAmountCents,
      finalPaymentAmount: totalAmountCents,
      paymentDates: [new Date(startDate)],
      frequency,
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    };
  }

  // Calculate total program duration in days
  const totalDays = daysBetween(startDate, endDate);
  
  // Determine interval in days based on frequency
  const intervalDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30;
  
  // Calculate number of payment periods
  // We always start on the start date and try to land close to the end date
  const rawPeriods = totalDays / intervalDays;
  const numberOfPayments = Math.max(2, Math.ceil(rawPeriods)); // Minimum 2 payments for installment plans
  
  // Generate payment dates
  const paymentDates: Date[] = [];
  const currentDate = new Date(startDate);
  
  for (let i = 0; i < numberOfPayments; i++) {
    if (i === 0) {
      // First payment on start date
      paymentDates.push(new Date(currentDate));
    } else if (i === numberOfPayments - 1) {
      // Last payment on or close to end date
      paymentDates.push(new Date(endDate));
    } else {
      // Intermediate payments at regular intervals
      const nextPaymentDate = new Date(startDate);
      nextPaymentDate.setDate(startDate.getDate() + (i * intervalDays));
      paymentDates.push(nextPaymentDate);
    }
  }
  
  // Calculate payment amounts
  const basePaymentAmount = Math.floor(totalAmountCents / numberOfPayments);
  const remainder = totalAmountCents - (basePaymentAmount * numberOfPayments);
  const finalPaymentAmount = basePaymentAmount + remainder; // Add any rounding difference to final payment
  
  return {
    totalAmount: totalAmountCents,
    numberOfPayments,
    paymentAmount: basePaymentAmount,
    finalPaymentAmount,
    paymentDates,
    frequency,
    startDate: new Date(startDate),
    endDate: new Date(endDate)
  };
}

/**
 * Format payment schedule for display
 */
export function formatPaymentSchedule(schedule: PaymentSchedule): string {
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  
  let output = `Payment Schedule (${schedule.frequency}):\n`;
  output += `Total: ${formatCurrency(schedule.totalAmount)} over ${schedule.numberOfPayments} payments\n`;
  output += `From ${formatDate(schedule.startDate)} to ${formatDate(schedule.endDate)}\n\n`;
  
  schedule.paymentDates.forEach((date, index) => {
    const isLast = index === schedule.paymentDates.length - 1;
    const amount = isLast ? schedule.finalPaymentAmount : schedule.paymentAmount;
    output += `Payment ${index + 1}: ${formatDate(date)} - ${formatCurrency(amount)}\n`;
  });
  
  return output;
}

/**
 * Recalculate payment schedule for existing enrollment with partial payments
 * Preserves already-paid amounts and recalculates future installments
 */
export function recalculatePaymentSchedule(
  totalCostCents: number,
  alreadyPaidCents: number,
  programStartDate: Date,
  programEndDate: Date,
  newFrequency: PaymentFrequency,
  currentDate: Date = new Date()
): PaymentSchedule & { validationErrors?: string[] } {
  const errors: string[] = [];
  
  // Validation: Ensure we haven't already paid everything
  const remainingBalance = totalCostCents - alreadyPaidCents;
  if (remainingBalance <= 0) {
    errors.push('Enrollment is already paid in full');
  }
  
  // Validation: Ensure program hasn't ended
  if (currentDate > programEndDate) {
    errors.push('Program has already ended');
  }
  
  // Calculate remaining days from now to program end
  const remainingDays = daysBetween(currentDate, programEndDate);
  
  // Validation: Check if enough time remains for the requested frequency
  const minDaysRequired = newFrequency === 'weekly' ? 7 : newFrequency === 'biweekly' ? 14 : 30;
  if (remainingDays < minDaysRequired && newFrequency !== 'one_time') {
    errors.push(`Not enough time remaining (${remainingDays} days) for ${newFrequency} payments. Minimum required: ${minDaysRequired} days.`);
  }
  
  // If there are validation errors, return them
  if (errors.length > 0) {
    return {
      totalAmount: 0,
      numberOfPayments: 0,
      paymentAmount: 0,
      finalPaymentAmount: 0,
      paymentDates: [],
      frequency: newFrequency,
      startDate: currentDate,
      endDate: programEndDate,
      validationErrors: errors
    };
  }
  
  // Calculate schedule for the remaining balance starting from today
  const recalculatedSchedule = calculatePaymentSchedule(
    remainingBalance,
    currentDate,
    programEndDate,
    newFrequency
  );
  
  // Validation: Ensure at least 2 payments for installment plans
  if (newFrequency !== 'one_time' && recalculatedSchedule.numberOfPayments < 2) {
    errors.push(`Insufficient time for installment plan. Only ${recalculatedSchedule.numberOfPayments} payment(s) would be scheduled.`);
    return {
      ...recalculatedSchedule,
      validationErrors: errors
    };
  }
  
  return recalculatedSchedule;
}

/**
 * Validate if a payment frequency change is allowed
 */
export function validateFrequencyChange(
  totalCostCents: number,
  alreadyPaidCents: number,
  programStartDate: Date,
  programEndDate: Date,
  newFrequency: PaymentFrequency,
  currentDate: Date = new Date()
): { valid: boolean; errors: string[] } {
  const result = recalculatePaymentSchedule(
    totalCostCents,
    alreadyPaidCents,
    programStartDate,
    programEndDate,
    newFrequency,
    currentDate
  );
  
  return {
    valid: !result.validationErrors || result.validationErrors.length === 0,
    errors: result.validationErrors || []
  };
}

/**
 * Example usage with your dates (September 8 to November 14, 2025)
 */
export function exampleCalculation() {
  const startDate = new Date('2025-09-08');
  const endDate = new Date('2025-11-14');
  const totalCost = 130000; // $1,300 in cents
  
  console.log('=== Example: Seekers Program 09/08 - 11/14/2025 ===\n');
  
  const frequencies: PaymentFrequency[] = ['biweekly', 'weekly', 'monthly'];
  
  frequencies.forEach(freq => {
    const schedule = calculatePaymentSchedule(totalCost, startDate, endDate, freq);
    console.log(formatPaymentSchedule(schedule));
    console.log('---\n');
  });
}
