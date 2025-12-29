/**
 * Helper functions for formatting class schedule data
 */

interface ScheduleVariant {
  days?: string[];
  startTime?: string;
  endTime?: string;
}

interface ScheduleObject {
  variants?: ScheduleVariant[];
}

/**
 * Formats a schedule object or string into a display-friendly string.
 * Handles both the object format with variants array and plain string format.
 * 
 * @param schedule - The schedule data (can be object with variants, string, or null/undefined)
 * @param defaultValue - The default string to return if schedule cannot be parsed (default: 'Schedule TBD')
 * @returns A formatted schedule string for display
 */
export function formatScheduleString(schedule: any, defaultValue: string = 'Schedule TBD'): string {
  if (!schedule) return defaultValue;
  
  // If it's already a string, return it directly
  if (typeof schedule === 'string') {
    return schedule || defaultValue;
  }
  
  // Handle object with variants array
  if (typeof schedule === 'object' && 'variants' in schedule) {
    const variants = (schedule as ScheduleObject).variants;
    if (Array.isArray(variants) && variants.length > 0) {
      const variant = variants[0];
      if (variant) {
        const days = Array.isArray(variant.days) ? variant.days.join(', ') : '';
        const startTime = variant.startTime || '';
        const endTime = variant.endTime || '';
        if (days && startTime && endTime) {
          return `${days} ${startTime}-${endTime}`;
        }
      }
    }
  }
  
  return defaultValue;
}
