/**
 * Deterministic integer split utility
 * 
 * Splits a total amount (in cents) into N parts that sum exactly to the total.
 * Uses floor + remainder distribution to handle odd amounts.
 * 
 * Example: splitIntegerEvenly(100, 3) => [34, 33, 33] (sums to 100)
 */
export function splitIntegerEvenly(total: number, parts: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('total must be non-negative integer');
  }
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error('parts must be positive integer');
  }

  const base = Math.floor(total / parts);
  let remainder = total % parts;
  const result: number[] = [];

  for (let i = 0; i < parts; i++) {
    if (remainder > 0) {
      result.push(base + 1);
      remainder -= 1;
    } else {
      result.push(base);
    }
  }

  const sum = result.reduce((s, v) => s + v, 0);
  if (sum !== total) {
    throw new Error(`split mismatch: ${sum} !== ${total}`);
  }

  return result;
}

/**
 * Split a total amount across specific enrollment IDs
 * Returns an array of { enrollmentId, amountCents } objects
 */
export function splitAmountAcrossEnrollments(
  totalCents: number,
  enrollmentIds: number[]
): { enrollmentId: number; amountCents: number }[] {
  if (enrollmentIds.length === 0) {
    return [];
  }

  const amounts = splitIntegerEvenly(totalCents, enrollmentIds.length);
  
  return enrollmentIds.map((enrollmentId, index) => ({
    enrollmentId,
    amountCents: amounts[index]
  }));
}
