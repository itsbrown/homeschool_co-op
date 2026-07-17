# Architecture (operational view)

High-level map for agents. See [SYSTEM_DOCUMENTATION.md](../SYSTEM_DOCUMENTATION.md) for full detail.

## Stack

| Layer | Technology |
|-------|------------|
| API | Express (`server/`), TypeScript |
| Client | React, Vite, TanStack Query, Shadcn/Tailwind |
| DB | PostgreSQL via Drizzle (`shared/schema.ts`) |
| Auth | Supabase (JWT); legacy Auth0 fields in schema |

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

## Testing lanes

| Lane | What it proves |
|------|----------------|
| **production-path** | In-process Express + Postgres + mocked Supabase (`server/tests/integration/production-path/`) |
| **client jsdom** | UI contracts (`npm run test:client`) |
| **Payments CI** | Billing subset (`jest.payments.config.cjs`) |
| **E2E** | Playwright + dev server; real Supabase when secrets set |
| **Full test:server** | 700+ integration tests — local / not PR Tests gate |

See [domains/ci-and-testing.md](./domains/ci-and-testing.md).
