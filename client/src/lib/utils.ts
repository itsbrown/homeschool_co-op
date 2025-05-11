import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

/**
 * Combines multiple class names into one, while properly handling Tailwind CSS.
 * @param inputs - Class names to combine
 * @returns Combined class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string into a localized format
 * @param dateString - ISO date string to format
 * @param formatStr - Optional format string (defaults to locale date string)
 * @returns Formatted date string
 */
export function formatDate(dateString: string, formatStr = "PPP") {
  if (!dateString) return "";
  try {
    const date = parseISO(dateString);
    return format(date, formatStr);
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateString;
  }
}