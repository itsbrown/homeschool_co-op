import { ZodError } from "zod";

/**
 * Formats ZodError object into a more user-friendly format
 */
export function formatZodError(error: ZodError) {
  return error.errors.map(err => ({
    path: err.path.join('.'),
    message: err.message
  }));
}