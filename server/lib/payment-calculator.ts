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
 * Safely parse and validate a date, returning null if invalid
 */
function safeParseDate(date: any, fieldName: string): Date | null {
  if (!date) {
    console.warn(`⚠️ ${fieldName} is null/undefined`);
    return null;
  }
  
  let parsed: Date;
  if (date instanceof Date) {
    parsed = date;
  } else if (typeof date === 'string' || typeof date === 'number') {
    parsed = new Date(date);
  } else {
    console.warn(`⚠️ ${fieldName} has unexpected type: ${typeof date}`);
    return null;
  }
  
  if (isNaN(parsed.getTime())) {
    console.warn(`⚠️ ${fieldName} is invalid date: ${date}`);
    return null;
  }
  
  return parsed;
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
  // Validate dates first
  const validStartDate = safeParseDate(startDate, 'startDate');
  const validEndDate = safeParseDate(endDate, 'endDate');
  
  // If dates are invalid, fall back to one-time payment from today
  if (!validStartDate || !validEndDate) {
    console.warn('⚠️ Invalid dates provided to calculatePaymentSchedule, falling back to one-time payment');
    const today = new Date();
    return {
      totalAmount: totalAmountCents,
      numberOfPayments: 1,
      paymentAmount: totalAmountCents,
      finalPaymentAmount: totalAmountCents,
      paymentDates: [today],
      frequency: 'one_time',
      startDate: today,
      endDate: today
    };
  }
  
  // Use validated dates from here on
  startDate = validStartDate;
  endDate = validEndDate;
  
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
  
  // For biweekly plans, final payment should be 2 weeks before program end
  // But ensure we don't go before the start date for short programs
  let effectiveEndDate: Date;
  if (frequency === 'biweekly') {
    const twoWeeksBeforeEnd = new Date(endDate);
    twoWeeksBeforeEnd.setDate(endDate.getDate() - 14);
    
    // If the effective end would be before the start, the program is too short for biweekly
    if (twoWeeksBeforeEnd < startDate) {
      // For programs shorter than 14 days, fall back to one_time payment
      return {
        totalAmount: totalAmountCents,
        numberOfPayments: 1,
        paymentAmount: totalAmountCents,
        finalPaymentAmount: totalAmountCents,
        paymentDates: [new Date(startDate)],
        frequency: 'one_time',
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      };
    }
    effectiveEndDate = twoWeeksBeforeEnd;
  } else {
    effectiveEndDate = new Date(endDate);
  }
  
  // Calculate number of payment periods based on effective end date
  const effectiveDays = daysBetween(startDate, effectiveEndDate);
  const rawPeriods = effectiveDays / intervalDays;
  const numberOfPayments = Math.max(2, Math.ceil(rawPeriods)); // Minimum 2 payments for installment plans
  
  // Generate payment dates
  const paymentDates: Date[] = [];
  const currentDate = new Date(startDate);
  
  for (let i = 0; i < numberOfPayments; i++) {
    if (i === 0) {
      // First payment on start date
      paymentDates.push(new Date(currentDate));
    } else if (i === numberOfPayments - 1) {
      // Last payment on effective end date (2 weeks before for biweekly)
      paymentDates.push(new Date(effectiveEndDate));
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
  
  // Validate dates first
  const validStartDate = safeParseDate(programStartDate, 'programStartDate');
  const validEndDate = safeParseDate(programEndDate, 'programEndDate');
  const validCurrentDate = safeParseDate(currentDate, 'currentDate') || new Date();
  
  // If dates are invalid, return one-time payment schedule
  if (!validStartDate || !validEndDate) {
    console.warn('⚠️ Invalid dates in recalculatePaymentSchedule, using one-time fallback');
    const today = new Date();
    const remainingBalance = totalCostCents - alreadyPaidCents;
    return {
      totalAmount: Math.max(0, remainingBalance),
      numberOfPayments: 1,
      paymentAmount: Math.max(0, remainingBalance),
      finalPaymentAmount: Math.max(0, remainingBalance),
      paymentDates: [today],
      frequency: 'one_time',
      startDate: today,
      endDate: today,
      validationErrors: ['Invalid program dates - using one-time payment']
    };
  }
  
  // Use validated dates
  programStartDate = validStartDate;
  programEndDate = validEndDate;
  currentDate = validCurrentDate;
  
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
