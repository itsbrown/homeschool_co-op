type ZodIssueLike = { path?: Array<string | number>; message?: string };

function formatZodIssues(errors: ZodIssueLike[]): string {
  return errors
    .map((issue) => {
      const field =
        issue.path && issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
      return `${field}: ${issue.message ?? "invalid"}`;
    })
    .join("; ");
}

/**
 * Turn apiRequest / fetch failures into short, user-safe messages (no raw HTML dumps).
 */
export function formatFetchErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('<!DOCTYPE') || raw.includes('<html')) {
    if (raw.includes('502') || raw.toLowerCase().includes("couldn't reach")) {
      return 'The app server is temporarily unavailable. Confirm the Replit app is running, then try again.';
    }
    return 'The server returned an unexpected page instead of an API response. Refresh and try again.';
  }

  const jsonMatch = raw.match(/^\d{3}:\s*(\{[\s\S]*\})$/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]) as {
        message?: string;
        hint?: string;
        detail?: string;
        errors?: unknown[];
      };
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const zodSummary = formatZodIssues(data.errors as ZodIssueLike[]);
        if (zodSummary) {
          return zodSummary;
        }
      }
      if (data.message && data.hint) {
        return `${data.message} ${data.hint}`;
      }
      if (data.message && data.message !== 'Validation error') {
        return data.message;
      }
      if (data.message) {
        return data.detail && process.env.NODE_ENV === 'development'
          ? `${data.message} (${data.detail})`
          : data.message;
      }
    } catch {
      // fall through
    }
  }

  return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
}
