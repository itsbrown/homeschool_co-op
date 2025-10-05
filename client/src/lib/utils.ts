import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines tailwind classes using clsx and twMerge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string into a human-readable format
 * Handles date strings without timezone conversions
 */
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  
  // For standard ISO dates (YYYY-MM-DD), parse directly without timezone adjustments
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
    return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
  }
  
  // For other date formats, use the Date object but add timezone offset
  const date = new Date(dateString);
  
  // Check if date is invalid
  if (isNaN(date.getTime())) return '';
  
  // Format as MM/DD/YYYY
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${month}/${day}/${year}`;
}

/**
 * Format currency
 * @param amount The amount to format (in cents)
 * @param inCents Whether the amount is in cents (true) or dollars (false)
 */
export function formatCurrency(amount: number, inCents: boolean = true): string {
  // Convert from cents to dollars if needed
  const dollars = inCents ? amount / 100 : amount;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Truncate text to a specific length
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Safely parse JSON
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    return fallback;
  }
}

/**
 * Generate a random ID (useful for temporary IDs)
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Calculate age from birthdate
 */
export function calculateAge(birthdate: string): number {
  const today = new Date();
  const birthDate = new Date(birthdate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Group items by a key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, currentItem) => {
    const groupKey = String(currentItem[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(currentItem);
    return result;
  }, {} as Record<string, T[]>);
}

/**
 * Creates a debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format class schedule with support for variants
 * @param schedule Either a string (legacy), a JSON string with variants, or an object with variants
 * @param includePricing Whether to include pricing information in the display
 */
export function formatClassSchedule(schedule: any, includePricing: boolean = false): string {
  // If schedule is a string, try to parse it as JSON first
  if (typeof schedule === 'string') {
    try {
      const parsed = JSON.parse(schedule);
      // If successfully parsed and has variants, use the parsed object
      if (parsed && parsed.variants && Array.isArray(parsed.variants)) {
        schedule = parsed;
      } else {
        // Otherwise return the string as-is (legacy format)
        return schedule;
      }
    } catch (e) {
      // Not JSON, return the string as-is (legacy format)
      return schedule;
    }
  }
  
  // Now handle the object format with variants
  if (!schedule || !schedule.variants || !Array.isArray(schedule.variants)) {
    return '';
  }
  
  const { variants } = schedule;
  
  if (variants.length === 0) {
    return '';
  }
  
  if (variants.length === 1) {
    const variant = variants[0];
    const daysStr = variant.days?.join(', ') || '';
    const timeStr = `${variant.startTime}-${variant.endTime}`;
    const priceStr = includePricing && variant.price ? ` - $${(variant.price / 100).toFixed(2)}` : '';
    return `${daysStr} ${timeStr}${priceStr}`;
  }
  
  // Multiple variants: format as "Option 1 OR Option 2"
  return variants
    .map((variant, index) => {
      const daysStr = variant.days?.join(', ') || '';
      const timeStr = `${variant.startTime}-${variant.endTime}`;
      const priceStr = includePricing && variant.price ? ` - $${(variant.price / 100).toFixed(2)}` : '';
      const label = variant.name ? `${variant.name} (${timeStr})` : `${daysStr} ${timeStr}`;
      return `${label}${priceStr}`;
    })
    .join(' OR ');
}