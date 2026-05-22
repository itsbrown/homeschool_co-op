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

/** Biweekly installments must not charge on/after the class end; last due date is this many days before class end (calendar days). */
export const BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS = 14;

/**
 * Checkout "today" for biweekly schedule math. In integration tests, set
 * TEST_CHECKOUT_ANCHOR_ISO so cart, Stripe, and assertions share one anchor
 * without jest fake timers (which break HTTP/Postgres).
 */
export function checkoutAnchorDate(): Date {
  const iso = process.env.TEST_CHECKOUT_ANCHOR_ISO;
  if (process.env.NODE_ENV === 'test' && iso) {
    return new Date(iso);
  }
  return new Date();
}

/**
 * Last calendar day a biweekly installment may fall on (inclusive), relative to class/program end.
 * Uses the same local Y/M/D → UTC-midnight convention as {@link daysBetween}.
 */
export function biweeklyInstallmentScheduleEndDate(classEndDate: Date): Date {
  const utcEnd = Date.UTC(
    classEndDate.getFullYear(),
    classEndDate.getMonth(),
    classEndDate.getDate(),
  );
  return new Date(utcEnd - BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS * 86400000);
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

  // Biweekly: last charge must fall on or before (class end − 2 weeks).
  if (frequency === 'biweekly') {
    endDate = biweeklyInstallmentScheduleEndDate(endDate);
  }
  
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
  
  // Check if program is long enough for at least 2 payments at the given interval
  // Minimum requirement: enough time for first payment + one interval
  if (totalDays < intervalDays) {
    // Program too short for installment plan, fall back to one_time payment
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
  
  // Generate payment dates - all payments spaced at regular intervals from start date
  // BOUNDED: Only add dates that are on or before the program end date
  // FIX: Previously, the last payment was forced to effectiveEndDate which caused 
  // duplicate dates when the calculated interval didn't align properly
  const paymentDates: Date[] = [];
  let currentPaymentDate = new Date(startDate);
  
  while (currentPaymentDate <= endDate) {
    paymentDates.push(new Date(currentPaymentDate));
    currentPaymentDate.setDate(currentPaymentDate.getDate() + intervalDays);
  }
  
  // Ensure at least 2 payments for installment plans, otherwise fall back to one_time
  if (paymentDates.length < 2) {
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
  
  const numberOfPayments = paymentDates.length;
  
  // Calculate payment amounts based on actual number of payments
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
 * Calculate the biweekly checkout schedule — SINGLE SOURCE OF TRUTH
 * Used by both cart-pricing.ts (for display) and stripe-payment-plans.ts (for charging).
 *
 * Plan starts at checkout (not deferred to class start):
 * - First payment is collected immediately at enrollment
 * - All installments are spaced biweekly from checkout through (class end − {@link BIWEEKLY_CLASS_END_PAYMENT_BUFFER_DAYS} days)
 * - Total is divided evenly across every installment in that window
 *
 * Both the checkout display and the payment processor MUST use this function
 * to prevent display-vs-charge mismatches.
 */
export interface CheckoutBiweeklySchedule {
  firstPaymentAmount: number;
  numberOfPayments: number;
  paymentAmount: number;
  finalPaymentAmount: number;
  paymentDates: Date[];
  totalAmount: number;
}

export function calculateCheckoutBiweeklySchedule(
  totalAmountCents: number,
  _classStartDate: Date,
  classEndDate: Date,
  anchorDate?: Date
): CheckoutBiweeklySchedule {
  const now = anchorDate ?? checkoutAnchorDate();

  const schedule = calculatePaymentSchedule(totalAmountCents, now, classEndDate, 'biweekly');

  if (schedule.frequency === 'one_time' || schedule.numberOfPayments < 2) {
    return {
      firstPaymentAmount: totalAmountCents,
      numberOfPayments: 1,
      paymentAmount: totalAmountCents,
      finalPaymentAmount: totalAmountCents,
      paymentDates: [now],
      totalAmount: totalAmountCents
    };
  }

  const allPaymentDates = schedule.paymentDates;
  const totalPayments = allPaymentDates.length;
  
  const basePaymentAmount = Math.floor(totalAmountCents / totalPayments);
  const remainder = totalAmountCents - (basePaymentAmount * totalPayments);
  const finalPaymentAmount = basePaymentAmount + remainder;
  
  return {
    firstPaymentAmount: basePaymentAmount,
    numberOfPayments: totalPayments,
    paymentAmount: basePaymentAmount,
    finalPaymentAmount,
    paymentDates: allPaymentDates,
    totalAmount: totalAmountCents
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
  
  // Remaining installment window: biweekly charges stop 2 weeks before program end.
  const installmentBoundaryEndDate =
    newFrequency === 'biweekly'
      ? biweeklyInstallmentScheduleEndDate(programEndDate)
      : programEndDate;

  // Calculate remaining days from now to that boundary
  const remainingDays = daysBetween(currentDate, installmentBoundaryEndDate);
  
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
