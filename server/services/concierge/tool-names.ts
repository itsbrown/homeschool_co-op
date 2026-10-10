/** Tools the concierge model may call. ADR-001. */
export const CONCIERGE_TOOL_NAMES = [
  "get_my_family",
  "get_week_materials",
  "rsvp_event",
  "start_enrollment_inquiry",
] as const;

export type ConciergeToolName = (typeof CONCIERGE_TOOL_NAMES)[number];

/** Present on the unmounted Anthropic router. They must not be registered here. */
export const FORBIDDEN_CONCIERGE_TOOL_NAMES = [
  "check_payments",
  "check_credits",
  "check_waitlist",
  "add_to_cart",
  "register_child",
  "lookup_classes",
] as const;

export function isConciergeToolName(value: string): value is ConciergeToolName {
  return (CONCIERGE_TOOL_NAMES as readonly string[]).includes(value);
}

/** Family tools require a signed-in parent. Inquiry is also offered to visitors. */
export function toolsForActor(signedIn: boolean): ConciergeToolName[] {
  if (!signedIn) return ["start_enrollment_inquiry"];
  return [...CONCIERGE_TOOL_NAMES];
}
