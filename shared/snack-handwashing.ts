/** Required hygiene copy for snack and lunch time blocks. */
export const SNACK_HANDWASHING_STATEMENT =
  "Students MUST wash their hands BEFORE and AFTER snack and Lunch";

const SNACK_OR_LUNCH_TITLE = /\b(snack|lunch)\b/i;
const STATEMENT_ALREADY_PRESENT = /must wash their hands/i;

export function isSnackOrLunchBlockTitle(title: string | null | undefined): boolean {
  return SNACK_OR_LUNCH_TITLE.test((title || "").trim());
}

export function textHasSnackHandwashingStatement(text: string | null | undefined): boolean {
  return STATEMENT_ALREADY_PRESENT.test(text || "");
}

/**
 * Prepend the hand-washing rule onto snack/lunch descriptions without duplicating it.
 * Non-eating titles are returned unchanged (trimmed).
 */
export function withSnackHandwashingStatement(
  title: string | null | undefined,
  description: string | null | undefined,
): string {
  const existing = (description || "").trim();
  if (!isSnackOrLunchBlockTitle(title)) return existing;
  if (textHasSnackHandwashingStatement(existing)) return existing;
  return existing ? `${SNACK_HANDWASHING_STATEMENT}\n\n${existing}` : SNACK_HANDWASHING_STATEMENT;
}
