# F001 Phase 1 — Status

**Aligned with commits on `main` (Feb 2026):** session API, parent session list, checkout session line items, E2E scaffolds.

## Delivered (schema + wiring)

| Task | Item | Location |
|------|------|----------|
| T001 | `program_enrollments` v2 fields | `shared/schema.ts` |
| T002 | `family_payment_plans` table | `shared/schema.ts` |
| T003 | `enrollment_price_history` table | `shared/schema.ts` |
| T004 | `schools.session_mode_enabled` | `shared/schema.ts` |
| — | Session enroll API (v2, locked prices) | `server/api/session-enrollments.ts` |
| — | Enrollment factory defaults | `shared/enrollment-factory.ts` |
| — | Manual SQL mirror | `server/migrations/f001-phase1-schema.sql` |

## Apply schema (required once per environment)

```bash
node scripts/db-push-with-env.mjs
node scripts/verify-f001-schema.mjs
```

## Phase 1 completion notes

- **Initial price history** on session enroll create (`changeType: initial`) — Safeguard 5 entry point before full checkout (T015).
- **Phase 2 storage** (T005–T006): see `server/dbStorage.ts` + `f001-phase2-storage.test.ts`.

## Not in Phase 1 (later phases)

- Cart snapshot session items (Phase 3)
- Family plan checkout / recalculation service (Phase 4–7)
- Parent wizard UI (Phase 9)
- Playwright F001 wizard (`docs/F001_SESSION_ENROLLMENT_TESTS.md` backlog)

## Test harness (uncommitted / parallel work)

Integration stabilization: Postgres truncate in `testDb.cleanup()`, `describeIntegration`, `globalSetup`, helper scripts under `scripts/`. Complements session/checkout commits; does not conflict.
