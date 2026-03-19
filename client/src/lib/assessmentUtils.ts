/**
 * Shared assessment utilities for formatting and displaying scores.
 * These functions should be used anywhere assessment scores are rendered
 * to ensure consistent formatting across the application.
 */

/**
 * Format a score value for display based on its score format type.
 *
 * @param score - The raw score string stored in the database
 * @param scoreFormat - The format type: 'numeric', 'fraction', 'percentage', 'level', 'letter_grade'
 * @param levelOptions - Array of valid level options (used for 'level' format)
 * @param maxScore - Optional max score for context display (used for 'numeric' format)
 * @returns A formatted display string
 */
export function displayScore(
  score: string | null | undefined,
  scoreFormat: string | null | undefined,
  levelOptions?: string[] | null,
  maxScore?: number | null
): string {
  if (!score) return '—';
  if (!scoreFormat) return score;

  switch (scoreFormat) {
    case 'numeric':
      // Return score as-is; caller can append "/ maxScore" for context
      return score;
    case 'fraction':
      // Return score as-is (e.g. "8/10")
      return score;
    case 'percentage':
      // Append % sign
      return `${score}%`;
    case 'level': {
      // Return "Level {score}" unless the score already looks like a formatted level
      if (levelOptions && levelOptions.includes(score)) {
        // If the stored value is already one of the options, show as-is
        return score;
      }
      return `Level ${score}`;
    }
    case 'letter_grade':
      // Return as-is (already normalized to uppercase on save)
      return score;
    default:
      return score;
  }
}

/**
 * Format a score with max score context for display.
 * For numeric scores with a max, shows "score / max" (e.g. "8 / 10").
 * For all other formats, returns displayScore result.
 */
export function displayScoreWithMax(
  score: string | null | undefined,
  scoreFormat: string | null | undefined,
  levelOptions?: string[] | null,
  maxScore?: number | null
): string {
  const formatted = displayScore(score, scoreFormat, levelOptions, maxScore);
  if (scoreFormat === 'numeric' && maxScore != null) {
    return `${formatted} / ${maxScore}`;
  }
  return formatted;
}

/**
 * Get a human-readable label for a score format type.
 */
export function getScoreFormatLabel(scoreFormat: string): string {
  const labels: Record<string, string> = {
    numeric: 'Numeric',
    fraction: 'Fraction (e.g. 8/10)',
    percentage: 'Percentage',
    level: 'Level',
    letter_grade: 'Letter Grade',
    pass_fail: 'Pass/Fail',
    custom: 'Custom',
  };
  return labels[scoreFormat] || scoreFormat;
}

/**
 * Get a helper text string for the score input field based on format.
 */
export function getScoreInputHelper(scoreFormat: string): string {
  const helpers: Record<string, string> = {
    numeric: 'Enter a number (e.g., 85)',
    fraction: "Enter as fraction (e.g., 8/10)",
    percentage: 'Enter percentage 0–100 (e.g., 85)',
    level: 'Enter level value',
    letter_grade: 'Enter letter grade (A, B+, C-, etc.)',
    pass_fail: 'Enter Pass or Fail',
    custom: 'Enter score value',
  };
  return helpers[scoreFormat] || 'Enter score value';
}
