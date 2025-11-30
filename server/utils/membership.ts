import { randomBytes } from 'crypto';

/**
 * Generates a unique membership ID in the format: ASA-YEAR-RANDOM
 * Example: ASA-2025-X7K9M2
 * 
 * @returns A unique membership ID string
 */
export function generateMemberId(): string {
  const year = new Date().getFullYear();
  const randomPart = randomBytes(3)
    .toString('base64')
    .replace(/[+/=]/g, '') // Remove non-alphanumeric characters
    .toUpperCase()
    .slice(0, 6); // Take 6 characters
  
  return `ASA-${year}-${randomPart}`;
}

/**
 * Validates if a string is a valid membership ID format
 * Format: ASA-YEAR-RANDOM (e.g., ASA-2025-X7K9M2)
 * 
 * @param memberId The membership ID to validate
 * @returns true if valid format, false otherwise
 */
export function isValidMemberIdFormat(memberId: string): boolean {
  if (!memberId || typeof memberId !== 'string') {
    return false;
  }
  
  // Pattern: ASA-YYYY-XXXXXX where X is alphanumeric
  const pattern = /^ASA-\d{4}-[A-Z0-9]{6}$/;
  return pattern.test(memberId.toUpperCase());
}

/**
 * Checks if a user has a valid (non-empty) membership ID
 * 
 * @param memberId The membership ID to check
 * @returns true if user has a valid membership ID
 */
export function hasMemberId(memberId: string | null | undefined): boolean {
  return !!memberId && memberId.trim() !== '';
}
