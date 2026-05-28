# Registration and locations

Domain doc for school-code signup, campus/location management, and school context bugs.

## Purpose

Parents register with a **school registration code**, pick a location when offered, and get linked to the correct school. School admins manage **locations** (campuses) for the school they administer—even when `users.school_id` points at a different school (legacy data).

## Critical invariants

- **Admin school** = school where `schools.admin_id = user.id`, not only `users.school_id`.
- **Public locations** must be readable **before** auth (registration landing).
- **POST /api/locations** must accept body `schoolId` for the registration school when admin is misaligned; server resolves via `resolveRequestedSchoolIdForUser`.
- **Location `code`** may be omitted in UI; API derives from name before Zod validation (`server/api/locations.ts`).
- **No auto-seed** “Main Campus” on wrong school (removed as source of cross-school pollution).

## Flow (happy path)

1. Parent opens registration URL with code.
2. `GET /api/public/registration/locations` — locations for code’s school (raw Postgres in public path where needed).
3. `GET /api/schools/validate-code` — school metadata.
4. Supabase signup → app user row → associate parent with school (direct storage, not self-HTTP).
5. Admin: Location Management uses resolved admin school; create/list locations for that school.

## Production-path tests (CI)

Harness: `server/tests/helpers/productionPathApp.ts`, `describeProductionPath.ts`, `seedRegistrationScenario.ts`.

| Suite | Proves |
|-------|--------|
| `public-registration-locations.test.ts` | Public list by code |
| `school-validate-code.test.ts` | Valid / invalid codes |
| `auth-register-school-signup.test.ts` | Register + DB user |
| `auth-register-orphan-supabase.test.ts` | Block orphan Supabase-only users |
| `associate-parent-school.test.ts` | Associate parent ↔ school |
| `location-school-context.test.ts` | Misaligned `users.school_id`; POST/GET locations |

Run locally (Postgres required):

```bash
node scripts/ci-db-push.mjs
node scripts/verify-core-schema.mjs
npm run test:server -- --runInBand --testPathPatterns=production-path --forceExit
```

## Common pitfalls

| Symptom | Cause | Fix |
|---------|--------|-----|
| `relation "users" does not exist` in CI | `drizzle-kit push` failed (`role` enum missing) | `scripts/ci-db-push.mjs`; export `roleEnum` in schema |
| Tests pass but Replit fails | Mem/file storage fallback | Fix `DATABASE_URL`; verify Postgres |
| Locations on wrong school | `users.school_id` ≠ admin school | Use `resolve-school-id`; fix data with SQL |
| POST /api/locations 400 | `code` validated before derive | Derive code before `insertLocationSchema.parse` |
| associate-school 500 on Replit | Self-HTTP or wrong storage | `associate-parent-school.ts` direct storage |

## Key files

- `server/lib/resolve-school-id.ts` — admin school resolution
- `server/lib/registration-public-locations.ts` — public location list
- `server/lib/location-db.ts` — Postgres location reads
- `server/lib/associate-parent-school.ts` — parent ↔ school link
- `server/api/locations.ts` — CRUD + school context
- `server/api/schools.ts` — validate registration code
- `client/src/pages/.../RegistrationLandingPage.tsx` — `data-testid` for E2E
- `server/migrations/locations-schema-align.sql` — prod-safe location columns

## Location activation threshold (planned — product locked 2026-05-26)

New campuses may require a minimum number of **students** before billing and full enrollment. Existing locations are unchanged (`activation_threshold` NULL = today’s behavior).

| Decision | Choice |
|----------|--------|
| Threshold unit | **Students** on session wishlist at that campus |
| **Counts when** | Parent has saved default payment method (`stripe_default_payment_method_id`) **and** child has `location_wishlist` enrollment |
| Sessions | **`sessions.location_id`** required for location-scoped programs; parents only enroll in sessions for their campus |
| Threshold never met | Cron + admin: cancel wishlist enrollments, detach saved PMs (no charge), email families |
| Early activation | Admin may activate before N; write **`audit_logs`** (`action_type`: `location_activate_early`) |
| Charge timing | **Short notice window** after threshold met (not instant capture); then batch charge |

### Location lifecycle

```
collecting → notice_period → activated
     |              |
     +-- expired ----+→ cancelled (threshold never met)
```

- **`collecting`**: `activation_threshold` set; enrollments use status `location_wishlist`; SetupIntent vaults PM; no PaymentIntent.
- **`notice_period`**: `COUNT(students on wishlist) >= threshold`; email “we hit the goal — charge on {date}”; `charge_scheduled_at` = now + notice window (configurable per school, default TBD e.g. 48–72h).
- **`activated`**: cron runs off-session charges; enrollments → `pending_payment` / confirm flow → `enrolled`; `sessions.enrollment_open` for that `location_id`.
- **`cancelled`**: deadline passed without threshold, or admin closes campus; wishlist cleared; notification sent.

### Counting students

- Count **distinct `children.id`** with `location_wishlist` enrollments for sessions at that `location_id`, only when parent has a saved payment method.
- Removing the default PM during `collecting` removes those students from the count until a card is saved again.

### Existing locations

- Migration: `locations.activation_threshold` NULL, `activation_status` = `activated` (or NULL = legacy active).
- No retroactive wishlist or session `location_id` backfill required for old campuses.

### Implementation touchpoints (not built yet)

- Schema: `locations` (threshold, status, `notice_started_at`, `charge_scheduled_at`, `activated_at`); `sessions.location_id`; enrollment status `location_wishlist`.
- Jobs: `location-activation-scheduler` (notice → charge), `location-activation-expiry` (never met → cancel + email).
- UI: optional threshold on Location Management create; progress on registration; admin “Activate now”.
- Reuse: `audit_logs`, SetupIntent (`/api/user/setup-intent`), email patterns from `enrollmentReminderScheduler`.

## Related skills

- `asa-auth-patterns`, `asa-enrollment-classes`, `asa-database-patterns`, `asa-testing-deployment`, `asa-payment-patterns`
