/**
 * School ID Normalization Utility
 * 
 * Ensures consistent numeric school ID handling across payment and discount flows.
 * School IDs should always be numeric integers in the database.
 * 
 * SECURITY: This utility prevents string/number type mismatches that could cause
 * incorrect school isolation in multi-tenant operations.
 */

/**
 * Normalizes a school ID to a numeric value.
 * Handles: undefined, null, strings, numbers, objects with schoolId property
 * 
 * @param schoolId - The school ID in various formats
 * @param fallback - Optional fallback value if normalization fails (default: 1)
 * @returns A numeric school ID or the fallback value
 * 
 * @example
 * normalizeSchoolId(123) // returns 123
 * normalizeSchoolId("123") // returns 123
 * normalizeSchoolId(undefined) // returns 1
 * normalizeSchoolId({ schoolId: 456 }) // returns 456
 */
export function normalizeSchoolId(
  schoolId: number | string | undefined | null | { schoolId?: number | string },
  fallback: number = 1
): number {
  // Handle object with schoolId property
  if (schoolId && typeof schoolId === 'object' && 'schoolId' in schoolId) {
    return normalizeSchoolId(schoolId.schoolId, fallback);
  }

  // Handle undefined or null
  if (schoolId === undefined || schoolId === null) {
    console.warn(`⚠️ School ID normalization: received ${schoolId}, using fallback ${fallback}`);
    return fallback;
  }

  // Handle numeric value
  if (typeof schoolId === 'number') {
    if (Number.isNaN(schoolId) || !Number.isFinite(schoolId)) {
      console.warn(`⚠️ School ID normalization: invalid number ${schoolId}, using fallback ${fallback}`);
      return fallback;
    }
    return Math.floor(schoolId); // Ensure integer
  }

  // Handle string value
  if (typeof schoolId === 'string') {
    const trimmed = schoolId.trim();
    if (trimmed === '') {
      console.warn(`⚠️ School ID normalization: empty string, using fallback ${fallback}`);
      return fallback;
    }
    
    const parsed = parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      console.warn(`⚠️ School ID normalization: could not parse "${schoolId}", using fallback ${fallback}`);
      return fallback;
    }
    return parsed;
  }

  // Fallback for unexpected types
  console.warn(`⚠️ School ID normalization: unexpected type ${typeof schoolId}, using fallback ${fallback}`);
  return fallback;
}

/**
 * Validates that a school ID is a positive integer.
 * Use this for strict validation in security-critical paths.
 * 
 * @param schoolId - The school ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidSchoolId(schoolId: unknown): schoolId is number {
  return (
    typeof schoolId === 'number' &&
    Number.isFinite(schoolId) &&
    Number.isInteger(schoolId) &&
    schoolId > 0
  );
}

/**
 * Asserts that a school ID is valid, throwing an error if not.
 * Use this in critical paths where an invalid school ID should stop execution.
 * 
 * @param schoolId - The school ID to validate
 * @param context - Optional context for error message
 * @throws Error if school ID is invalid
 */
export function assertValidSchoolId(schoolId: unknown, context?: string): asserts schoolId is number {
  if (!isValidSchoolId(schoolId)) {
    const contextMsg = context ? ` in ${context}` : '';
    throw new Error(`Invalid school ID${contextMsg}: expected positive integer, got ${typeof schoolId} (${schoolId})`);
  }
}
