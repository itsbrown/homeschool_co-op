const SENSITIVE_RULES: Array<{ code: string; pattern: RegExp }> = [
  { code: "payment", pattern: /\b(stripe|autopay|auto-pay|refund|charge my|my balance|payment method|credit card|card number|checkout|add to cart|shopping cart)\b/i },
  { code: "payment", pattern: /\b(pay|payment|invoice|billing)\b/i },
  { code: "medical", pattern: /\b(allerg\w*|medical|medication|medicine|epipen|epi-pen|birth\s?date|birthday|diagnosis|iep|504 plan)\b/i },
  { code: "custody", pattern: /\b(custody|restraining|divorce decree|who can pick up)\b/i },
  { code: "enrollment_change", pattern: /\b(withdraw|unenroll|drop (the |my )?class|promote.*waitlist|override (the )?cap)\b/i },
  { code: "child_registration", pattern: /\b(register (a |my |our )?child|add (a |my |our )?child|new child)\b/i },
];

export type SensitiveHandoff = { code: string };

/** Detect requests the assistant must hand to a person instead of acting on. */
export function detectSensitiveRequest(text: string): SensitiveHandoff | null {
  for (const rule of SENSITIVE_RULES) {
    if (rule.pattern.test(text)) return { code: rule.code };
  }
  return null;
}

export function handoffMessage(code: string): string {
  switch (code) {
    case "payment":
      return "I can't take payment, open a cart, or look up a balance. A person at the school needs to help with billing. I can ask Corey to follow up if you share your question.";
    case "medical":
      return "I can't record or discuss medical details, allergies, or birthdays here. Please contact the school office so a person can help.";
    case "custody":
      return "Custody and pickup changes need a person at the school. I can't update those records.";
    case "enrollment_change":
      return "I can't change an enrollment, a waitlist, or a class cap. I can ask Corey to follow up.";
    case "child_registration":
      return "I can't register a child from this chat. You can start an account with your school code, or I can ask Corey to follow up.";
    default:
      return "A person at the school needs to handle that. I can ask Corey to follow up.";
  }
}

const BANNED_METADATA_KEY = /birth|medic|allerg|gender|lexile|interest|grade|segment|stripe|token|ssn|child|name|email|phone|question|prompt/i;

/** Keep analytics metadata free of child profile fields and message text. */
export function sanitizeConciergeMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (BANNED_METADATA_KEY.test(key)) continue;
    if (value == null || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      if (value.length > 64) continue;
      out[key] = value;
    }
  }
  return out;
}

/** Concierge code uses users.id. The Supabase UUID is not a parent id. */
export function assertParentUserId(userId: unknown): number {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) {
    throw new Error("Parent id must be the integer users.id");
  }
  return userId;
}
