/**
 * Unified Currency Utilities
 * 
 * Best Practice: Always store amounts in smallest currency unit (cents for USD)
 * Convert only at display layer for consistent handling across the application
 */

export class CurrencyUtils {
  /**
   * Convert dollars to cents for storage
   * @param dollars - Amount in dollars (can be decimal)
   * @returns Amount in cents (integer)
   */
  static toStorage(dollars: number): number {
    return Math.round(dollars * 100);
  }

  /**
   * Convert cents to dollars for calculations
   * @param cents - Amount in cents (integer)
   * @returns Amount in dollars (decimal)
   */
  static toDisplay(cents: number): number {
    return cents / 100;
  }

  /**
   * Format cents as currency string for UI display
   * @param cents - Amount in cents (integer)
   * @returns Formatted currency string (e.g., "$12.34")
   */
  static format(cents: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  /**
   * Parse user input to cents for storage
   * Handles both "$12.34" and "12.34" formats
   * @param input - User input string or number
   * @returns Amount in cents
   */
  static parseInput(input: string | number): number {
    if (typeof input === 'number') {
      return this.toStorage(input);
    }
    
    // Remove currency symbols and parse
    const cleaned = input.replace(/[$,\s]/g, '');
    const dollars = parseFloat(cleaned);
    
    if (isNaN(dollars)) {
      throw new Error(`Invalid currency input: ${input}`);
    }
    
    return this.toStorage(dollars);
  }

  /**
   * Safely add amounts in cents
   * @param amounts - Array of amounts in cents
   * @returns Sum in cents
   */
  static sum(amounts: number[]): number {
    return amounts.reduce((sum, amount) => sum + (amount || 0), 0);
  }

  /**
   * Calculate remaining balance
   * @param totalCost - Total cost in cents
   * @param amountPaid - Amount already paid in cents
   * @returns Remaining balance in cents
   */
  static calculateBalance(totalCost: number, amountPaid: number): number {
    return Math.max(0, totalCost - amountPaid);
  }

  /**
   * Validate that an amount is valid (non-negative)
   * @param cents - Amount in cents
   * @returns true if valid
   */
  static isValidAmount(cents: number): boolean {
    return typeof cents === 'number' && cents >= 0 && Number.isInteger(cents);
  }
}

/**
 * Centralized Billing Calculation Service
 * Single source of truth for all financial calculations
 */
export class BillingCalculationService {
  /**
   * Calculate total amount paid from payment history
   * @param payments - Array of payment records
   * @returns Total paid in cents
   */
  static calculateTotalPaid(payments: any[]): number {
    return CurrencyUtils.sum(
      payments
        .filter(p => ['completed', 'succeeded'].includes(p.status))
        .map(p => p.amount || 0)
    );
  }

  /**
   * Calculate total amount due from enrollments
   * @param enrollments - Array of enrollment records
   * @returns Total due in cents
   */
  static calculateTotalDue(enrollments: any[]): number {
    return CurrencyUtils.sum(
      enrollments.map(e => {
        const totalCost = e.totalCost || 0;
        const amountPaid = e.amountPaid || e.amount || 0;
        return CurrencyUtils.calculateBalance(totalCost, amountPaid);
      })
    );
  }

  /**
   * Update enrollment after payment
   * @param enrollment - Enrollment record
   * @param paymentAmount - Payment amount in cents
   * @returns Updated enrollment
   */
  static applyPaymentToEnrollment(enrollment: any, paymentAmount: number): any {
    // Use totalPaid as the source of truth (matches database schema), with fallback to amountPaid or amount
    const currentAmountPaid = enrollment.totalPaid || enrollment.amountPaid || enrollment.amount || 0;
    const newAmountPaid = currentAmountPaid + paymentAmount;
    const totalCost = enrollment.totalCost || 0;
    const remainingBalance = CurrencyUtils.calculateBalance(totalCost, newAmountPaid);

    return {
      ...enrollment,
      amount: newAmountPaid,
      amountPaid: newAmountPaid,
      totalPaid: newAmountPaid, // Matches database schema field name
      remainingBalance,
      outstandingBalance: remainingBalance,
      status: remainingBalance <= 0 ? 'enrolled' : 'enrolled' // Any payment enrolls student
    };
  }

  /**
   * Validate payment data
   * @param paymentData - Payment data to validate
   * @returns Validation result
   */
  static validatePayment(paymentData: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!paymentData.amount || paymentData.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!CurrencyUtils.isValidAmount(paymentData.amount)) {
      errors.push('Amount must be a valid integer in cents');
    }

    if (!paymentData.parentEmail) {
      errors.push('Parent email is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}