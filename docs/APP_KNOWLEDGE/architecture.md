# Architecture (operational view)

High-level map for agents. See [SYSTEM_DOCUMENTATION.md](../SYSTEM_DOCUMENTATION.md) for full detail.

## Stack

| Layer | Technology |
|-------|------------|
| API | Express (`server/`), TypeScript |
| Client | React, Vite, TanStack Query, Shadcn/Tailwind |
| DB | PostgreSQL via Drizzle (`shared/schema.ts`) |
| Auth | Supabase JWT (live). Auth0 filenames and Passport are not the session. [Parent concierge](../parent-concierge/architecture.md) |

Unused Firebase SDKs were removed from `package.json` (Jul 2026): they had no imports and pulled Replit-blocked `websocket-driver`. Do not re-add them.
| Payments | Stripe (PaymentIntents, webhooks, autopay) |
| CI | GitHub Actions: Tests, Payments CI, E2E (Playwright) |

## Multi-tenancy

- **`school_id`** scopes schools, locations, classes, enrollments, many admin APIs.
- **`requireSchoolContext`** middleware injects resolved school on authenticated routes.
- **Resolve school for admin:** `server/lib/resolve-school-id.ts` — prefers school where `schools.admin_id = user.id` when `users.school_id` is misaligned (production incident).

## Storage

- **`CombinedStorage`** (`server/storage.ts`): tries Postgres first; falls back to mem/file JSON when DB unavailable or schema missing.
- **Risk:** Tests or dev without Postgres look “green” while hitting mem storage — always verify Postgres in production-path and integration tests (`assertCorePostgresSchema`, `assertPostgresStorageForProductionPath`).

## School clock (America/New_York)

The API process runs in UTC. Do not persist admin-entered dates with bare `new Date(string)`.

| Input | Wrong | Right |
|-------|--------|--------|
| `datetime-local` `2026-10-12T11:00` | UTC 11:00 → displays 7:00 AM ET | `parseSchoolWallTime` → 15:00Z (11:00 AM EDT) |
| `<input type="date">` `2026-10-13` | UTC midnight → label “Oct 12”, hidden at 8:00 PM ET the day before | `parseDocumentExpiry` → 23:59:59.999 ET that day |

Helpers: `shared/school-timezone.ts`. Edit Event must load the input with `formatSchoolWallTimeLocal` and save with `parseSchoolWallTime`. Saving a description must not move the clock. Strings that already have `Z` or an offset stay that instant — do not shift rows that were stored earlier.

Scheduled notifications use the same wall-time parser. A future `scheduledFor` stays `scheduled` until `startScheduledNotificationJob` (every 60s, same `ENABLE_BACKGROUND_JOBS` worker as reminders). Production does not run that job until the flag is true and the process is restarted. No extra Replit cron.

A throw while delivering one claimed row must not skip the rest of the batch. The tick requeues that row only when it has no `notification_recipients` (up to 3 times, counted in `delivery_stats.claimRecoveries`). If any recipient row exists, it is marked `failed` and not sent again. The same rule recovers rows left in `sending` for 15 minutes. `processNotification` swallows errors and sets `failed` without throwing; the tick re-reads status and only counts `sent` as delivered. A quiet `failed` with zero recipient rows is requeued the same way. No schema change.

## Parent concierge (Phase 0, not built)

Chat-first design is [../parent-concierge/ADR-001.md](../parent-concierge/ADR-001.md): an Express route using the Vercel AI SDK and AI Gateway, not a second Vercel app and not the unmounted Anthropic router in `server/api/parent-concierge.ts`. Tools are `get_my_family`, `get_week_materials`, `rsvp_event`, and `start_enrollment_inquiry` (SendGrid lead to Corey). No Stripe. A parent sees only their own `children` / `child_guardians` rows. Live app data is the Postgres on Replit (`DATABASE_URL`); Replit-managed vs Neon is unconfirmed. Live Auth is Supabase `moivwjuglwwfrhqeewju` only and must never be paused. ASA Platform Prod and ASA Platform 2026 hold no live data. Dev copies use `scripts/mask-prod-to-dev.mjs` with that production `DATABASE_URL` opened read-only (ideally a read-only role) and refuse a prod-looking target. Stores and flows: [../parent-concierge/data-flows.md](../parent-concierge/data-flows.md). No schema change in that phase.

## Schema changes

| Environment | Method |
|-------------|--------|
| CI `asa_test` | `node scripts/ci-db-push.mjs` (bootstrap `role` enum + `drizzle-kit push --force`) |
| Local test DB | Same scripts; `scripts/verify-core-schema.mjs`, `scripts/verify-f001-schema.mjs` |
| Production | Additive SQL in `server/migrations/` — **not** `db:push` |

## Registration / locations (critical path)

```
Public: GET /api/public/registration/locations?code=REGCODE (or legacy ?schoolId=)
        GET /api/schools/validate-code
Auth:   POST register (Supabase) → associate parent → school
Admin:  POST /api/locations (school from resolve-school-id + body schoolId)
```

Key files: `server/lib/registration-public-locations.ts`, `server/lib/location-db.ts`, `server/lib/associate-parent-school.ts`, `server/api/locations.ts`, `server/middleware/require-school-context.ts`.

## Multi-role chrome (Phase 1)

Parent+teaching (e.g. parent + custom `Mentor`) share **one parent chrome**: Family and Teaching are sibling nav groups. `/dashboard` is always the family hub for that cohort, even if `users.active_role` is `Mentor`. Parent-only families keep today’s flat sidebar. Parent+schoolAdmin without teaching still land on admin home. Same-school RoleSwitcher stays hidden.

Helpers: `client/src/lib/user-jobs.ts`. Do **not** use `hasRole('parent')` (schoolAdmin hierarchy would show Family to pure admins). E2E: `e2e/additive-nav.spec.ts` via `POST /api/test/setup-additive-nav-scenario`.

## Account deactivate (school Users)

School owners deactivate a departed parent from `/schools/users` (`PUT /api/school-admin/users/:id/deactivate` and `.../reactivate`). That sets `users.is_active` only. Children, payments, and other linked rows stay. The person cannot sign in (`403` “Account is inactive”) and is omitted from `/schools/notifications` recipient resolution (email and in-app), including resend. The same `403` is required in **both** `supabaseAuth` and `jwtCheck` (`server/middleware/auth0-auth.ts`). Parent routes such as `GET /api/children` use `jwtCheck`. Token sync must not set `users.is_active` back to true.

`GET /api/school-admin/users` `isActive` is the **account** flag. Staff employment is `staffIsActive` (Resend Staff Invite). Do not overwrite `isActive` with `school_staff.is_active` or the Inactive badge and notification filter disagree.

Platform `PUT /api/user-management/users/:id/deactivate|reactivate` still keys off `users.auth0_id` and `admin` / `superAdmin`. The school screen does not call it.

## Testing lanes

| Lane | What it proves |
|------|----------------|
| **production-path** | In-process Express + Postgres + mocked Supabase (`server/tests/integration/production-path/`) |
| **client jsdom** | UI contracts (`npm run test:client`) |
| **Payments CI** | Billing subset (`jest.payments.config.cjs`) |
| **E2E** | Playwright + dev server; real Supabase when secrets set |
| **Full test:server** | 700+ integration tests — local / not PR Tests gate |

See [domains/ci-and-testing.md](./domains/ci-and-testing.md).
