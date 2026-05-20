import { describe, it } from "@jest/globals";

/**
 * F001 — Session-based enrollment (integration backlog).
 * Product spec: docs/FUTURE_FEATURES.md (F001)
 */

describe("F001: cart and snapshot (session items)", () => {
  it.todo("calculateCartSnapshot includes sessionId and dayType in canonical items and HMAC input");
  it.todo("rejects expired cart snapshot past TTL with structured error for client refresh");
  it.todo("session line pricing uses sessions.halfDayPrice / fullDayPrice server-side only");
});

describe("F001: checkout and program_enrollments", () => {
  it.todo("creates program_enrollments with enrollmentVersion v2, session_id, dayType, enrolledHalfDayPrice, enrolledFullDayPrice");
  it.todo("sets programStartDate / programEndDate from session for payment schedule");
  // Initial price history on session enroll API — see session-enrollments.ts + f001-phase2-storage.test.ts
});

describe("F001: wizard gates and locations", () => {
  it.todo("returns 400 when child missing firstName, lastName, birthdate, gradeLevel, or locationId");
  it.todo("returns 400 when parent has no emergency_contacts rows (account-level rule)");
  it.todo("with three school locations, child locationId comes from request or users.locationId — not locations[0] default");
});

describe("F001: regression (v1 class path)", () => {
  it.todo("with sessionModeEnabled false, class-only cart snapshot and checkout unchanged from baseline");
});

describe("F001: biweekly session payment schedule", () => {
  it.todo("first payment at checkout included in splitIntegerEvenly-style cent split");
  // Covered by server/tests/cart-program-dates.test.ts and stripe-biweekly-checkout-phases.test.ts
});

describe("F002: abandoned enrollment funnel (separate workstream)", () => {
  it.todo("persists funnel step events with correlationId and schoolId");
  it.todo("resume token validates and does not leak PII in URL");
});
