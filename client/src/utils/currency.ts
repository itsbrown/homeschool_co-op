/**
 * Frontend currency formatting utilities
 * All prices in the database are stored in cents (integer)
 * These utilities ensure consistent conversion and formatting across the UI
 */

/**
 * Convert cents to dollars and format as currency string
 * @param cents - Amount in cents (integer)
 * @returns Formatted currency string (e.g., "$10.50")
 */
export function formatCurrency(cents: number): string {
  if (cents === null || cents === undefined || isNaN(cents)) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Convert cents to dollars (decimal)
 * @param cents - Amount in cents (integer)
 * @returns Amount in dollars with 2 decimal places
 */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Convert dollars to cents
 * @param dollars - Amount in dollars (decimal)
 * @returns Amount in cents (integer)
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Format cents as dollars with fixed decimal places
 * @param cents - Amount in cents (integer)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted dollar amount (e.g., "10.50")
 */
export function formatDollars(cents: number, decimals: number = 2): string {
  if (cents === null || cents === undefined || isNaN(cents)) {
    return '0.00';
  }
  return (cents / 100).toFixed(decimals);
}

/**
 * Parse currency string to cents
 * Handles various input formats: "$10.50", "10.50", "10"
 * @param currencyString - Currency string to parse
 * @returns Amount in cents (integer)
 */
export function parseCurrencyToCents(currencyString: string): number {
  // Remove currency symbols and whitespace
  const cleaned = currencyString.replace(/[$,\s]/g, '');
  const dollars = parseFloat(cleaned);
  
  if (isNaN(dollars)) {
    throw new Error(`Invalid currency string: ${currencyString}`);
  }
  
  return dollarsToCents(dollars);
}

/**
 * Validate that an amount is a valid integer in cents
 * @param cents - Amount to validate
 * @returns true if valid, throws error otherwise
 */
export function validateCentsAmount(cents: any): boolean {
  if (typeof cents !== 'number' || !Number.isInteger(cents)) {
    throw new Error(`Amount must be an integer in cents, got: ${cents}`);
  }
  if (cents < 0) {
    throw new Error(`Amount cannot be negative, got: ${cents}`);
  }
  return true;
}

/**
 * Format a number input value to currency format for display
 * Useful for controlled inputs
 * @param value - The input value (can be string or number)
 * @returns Formatted string for display
 */
export function formatInputCurrency(value: string | number): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '';
  return numValue.toFixed(2);
}
