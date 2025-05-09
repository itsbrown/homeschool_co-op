import { ZodError } from 'zod';

/**
 * Formats ZodError object into a more user-friendly format
 */
export function formatZodError(error: ZodError) {
  return error.errors.reduce((acc, err) => {
    const key = err.path.join('.');
    acc[key] = err.message;
    return acc;
  }, {} as Record<string, string>);
}