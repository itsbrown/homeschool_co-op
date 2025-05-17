/**
 * This module adds support for the status filter in classes database queries
 * Will be applied in both getClasses and getClassesCount functions
 */

/**
 * Add status condition to a query
 */
export function addStatusCondition(options: { status?: string }, queryParams: any[], conditions: string[]) {
  if (options.status) {
    queryParams.push(options.status);
    conditions.push(`status = $${queryParams.length}`);
  }
}