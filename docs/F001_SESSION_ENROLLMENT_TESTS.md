# F001 session enrollment — saved test scaffolds

Product spec: [FUTURE_FEATURES.md](./FUTURE_FEATURES.md) (F001).  
Testing strategy and checklist: Cursor plan **F001 Session Enrollment** → section *Testing strategy*.  
Conventions: [.agents/skills/asa-testing-deployment/SKILL.md](../.agents/skills/asa-testing-deployment/SKILL.md).

Copy the blocks below into the paths shown when you implement F001 (or run Agent mode to create the files automatically).

---

## 1. Jest integration backlog

**Path:** `server/tests/integration/f001-session-enrollment/f001-session-enrollment.test.ts`

```typescript
import { describe, it } from "@jest/globals";

/**
 * F001 — Session-based enrollment (integration backlog).
 *
 * Product spec: docs/FUTURE_FEATURES.md (F001)
 * Testing notes: Cursor plan "F001 Session Enrollment" → section "Testing strategy"
 *
 * Replace `it.todo` with real tests as features land. Prefer:
 * - Postgres seeds via storage / `/api/test/setup-*` (see asa-testing-deployment skill — no MemStorage fallback on DB errors)
 * - `npm run test:server` (jest.integration.config.cjs)
 *
 * Payment + Stripe: `PAYMENT_PROCESSOR_ENABLED=true npm run test:server -- --runInBand --testPathPatterns="payment-flow/..."`
 */

describe("F001: cart and snapshot (session items)", () => {
  it.todo("calculateCartSnapshot includes sessionId and dayType in canonical items and HMAC input");
  it.todo("rejects expired cart snapshot past TTL with structured error for client refresh");
  it.todo("session line pricing uses sessions.halfDayPrice / fullDayPrice server-side only");
});

describe("F001: checkout and program_enrollments", () => {
  it.todo("creates program_enrollments with enrollmentVersion v2, session_id, dayType, enrolledHalfDayPrice, enrolledFullDayPrice");
  it.todo("sets programStartDate / programEndDate from session for payment schedule");
  it.todo("initial enrollmentPriceHistory row with changeType initial");
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
  it.todo("per-enrollment biweekly last due date on or before that session endDate minus 14 days");
  it.todo("first payment at checkout included in splitIntegerEvenly-style cent split");
});

describe("F002: abandoned enrollment funnel (separate workstream)", () => {
  it.todo("persists funnel step events with correlationId and schoolId");
  it.todo("resume token validates and does not leak PII in URL");
});
```

---

## 2. Playwright E2E backlog

**Path:** `e2e/f001-session-enrollment-wizard.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

/**
 * F001 parent session enrollment wizard (E2E backlog).
 *
 * Unskip when: wizard routes + data-testid hooks exist and authenticated parent
 * project can reach them (see playwright.config.ts, docs/E2E_PARENT_PROFILE.md).
 *
 * Run: npm run test:e2e -- e2e/f001-session-enrollment-wizard.spec.ts
 */

test.describe.skip("F001 session enrollment wizard", () => {
  test("Schedule: half and full day cards require explicit choice before Continue", async () => {
    // TODO: page.goto wizard schedule; expect Continue disabled; select half; enable Continue
  });

  test("Schedule: at least one session card must be selected", async () => {
    // TODO: select day type only; Continue disabled; select session; enabled
  });

  test("Review: shows child, day type, session title, subtotal, Edit returns with state", async () => {
    // TODO
  });

  test("Gate: incomplete profile shows emergency contact account-settings copy", async () => {
    // TODO
  });
});
```

---

## Commands (reference)

```bash
npm run test:server
PAYMENT_PROCESSOR_ENABLED=true npm run test:server -- --runInBand --testPathPatterns="payment-flow/"
npm run test:e2e
```

Existing coverage to extend for session dates: `server/tests/biweekly-schedule-end-buffer.test.ts`.
