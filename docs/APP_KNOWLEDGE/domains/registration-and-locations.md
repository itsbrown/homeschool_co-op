# Registration and locations

Domain doc for school-code signup, campus/location management, and school context bugs.

## Purpose

Parents register with a **school registration code**, pick a location when offered, and get linked to the correct school. School admins manage **locations** (campuses) for the school they administer—even when `users.school_id` points at a different school (legacy data).

## Critical invariants

- **Parent campus on signup** — school-code registration must set **three** places: `user_locations` (permissions), `users.location_id` (profile), and each child’s `children.location_id` (+ `school_students.location_id`). Child rows used to get a default campus via `resolveSchoolAndChildLocation` even when parent `user_locations` failed silently; `ensureParentRegistrationLocation` in `server/lib/persist-parent-location.ts` now requires a selected campus and fails registration if persist fails.
- **Admin school** = school where `schools.admin_id = user.id`, not only `users.school_id`.
- **Public locations** must be readable **before** auth (registration landing).
- **POST /api/locations** must accept body `schoolId` for the registration school when admin is misaligned; server resolves via `resolveRequestedSchoolIdForUser`.
- **Location `code`** may be omitted in UI; API derives from name before Zod validation (`server/api/locations.ts`).
- **No auto-seed** “Main Campus” on wrong school (removed as source of cross-school pollution).

## Flow (happy path)

1. Parent opens registration URL with code.
2. `GET /api/public/registration/locations?code=REGCODE` (preferred) or `?schoolId=` — active campuses for that school (raw Postgres). Parent registration page passes the URL code so campuses cannot drift from a stale client `schoolId`.
3. `GET /api/schools/validate-code` — school metadata.
4. Supabase signup → app user row → associate parent with school (direct storage, not self-HTTP).
5. Admin: Location Management uses resolved admin school; create/list locations for that school.

## Production-path tests (CI)

Harness: `server/tests/helpers/productionPathApp.ts`, `describeProductionPath.ts`, `seedRegistrationScenario.ts`.

| Suite | Proves |
|-------|--------|
| `public-registration-locations.test.ts` | Public list by code |
| `school-validate-code.test.ts` | Valid / invalid codes |
| `auth-register-school-signup.test.ts` | Register + DB user + campus on parent/child |
| `auth-register-location-persist.test.ts` | Campus before children; 400 invalid campus; 500 + rollback on persist failure |
| `persist-parent-location.test.ts` (unit) | `user_locations` + `users.location_id`; school-code validation |
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
| Registration dropdown empty, admin sees campuses | Locations `school_id` ≠ registration-code school | `node scripts/diagnose-location-school-alignment.mjs CODE`; align with `server/scripts/align-locations-to-registration-school.sql` |
| “No campuses configured” with valid code | Zero `is_active` rows for that school | Add campuses in Location Management for the school that owns the code |
| POST /api/locations 400 | `code` validated before derive | Derive code before `insertLocationSchema.parse` |
| associate-school 500 on Replit | Self-HTTP or wrong storage | `associate-parent-school.ts` direct storage |
| Enrollment Sessions page shows no data and create fails | `sessions.location_id` missing in older DBs while API/schema expect it | Ensure startup migration runs `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location_id ...` (`server/init-db.ts`) |

## Key files

- `server/lib/resolve-school-id.ts` — admin school resolution
- `server/lib/registration-public-locations.ts` — public location list
- `server/lib/location-db.ts` — Postgres location reads
- `server/lib/associate-parent-school.ts` — parent ↔ school link
- `server/lib/persist-parent-location.ts` — `user_locations` + `users.location_id` on signup
- `server/scripts/audit-registration-locations.ts` — find/fix parents missing campus while children have `location_id`
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
