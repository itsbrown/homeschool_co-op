/**
 * Normalize Lexile range strings into numeric values for aggregation.
 * Handles: "400L", "BR400L", "400-600", "400L-600L", "896L", plain numbers.
 */

export interface ParsedLexileRange {
  low: number;
  high: number;
  midpoint: number;
  raw: string;
}

/** Strip L suffix and BR prefix, return numeric string or null. */
function extractLexileNumber(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const withoutL = trimmed.replace(/L$/i, '').trim();
  const brMatch = withoutL.match(/^BR\s*(-?\d+(?:\.\d+)?)$/i);
  if (brMatch) {
    const n = parseFloat(brMatch[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  const numMatch = withoutL.match(/^(-?\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  return null;
}

/**
 * Parse a Lexile range or single value into low/high/midpoint.
 * Returns null when the input cannot be parsed.
 */
export function parseLexileRange(input: string | null | undefined): ParsedLexileRange | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Range with dash (not leading negative): "400-600", "400L-600L"
  const rangeMatch = raw.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (rangeMatch) {
    const low = extractLexileNumber(rangeMatch[1]);
    const high = extractLexileNumber(rangeMatch[2]);
    if (low != null && high != null && low <= high) {
      return { low, high, midpoint: Math.round((low + high) / 2), raw };
    }
    if (low != null && high != null && low > high) {
      return { low: high, high: low, midpoint: Math.round((low + high) / 2), raw };
    }
  }

  const single = extractLexileNumber(raw);
  if (single != null) {
    return { low: single, high: single, midpoint: single, raw };
  }

  return null;
}

/** Parse grade-level score strings (0–20) for reading analytics. */
export function parseGradeLevelScore(score: string | null | undefined): number | null {
  if (score == null) return null;
  const parsed = parseFloat(String(score).trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20) return null;
  return parsed;
}

/** Derive Lexile midpoint from grade level when only grade is available (ASA convention). */
export function lexileFromGradeLevel(gradeLevel: number): number {
  return Math.round(200 + gradeLevel * 100);
}
