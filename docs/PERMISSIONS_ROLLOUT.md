# Permissions rollout (nav + location / school-wide scoping)

## Model

| Tier | Source | Behavior |
|------|--------|----------|
| Location-scoped | `user_locations` | Data + nav for assigned locations only |
| School-wide (regional manager) | `user_school_permissions` | Same flags apply to **all** locations (`canAccessEntireSchool`) |
| Role bypass | `schoolAdmin`, `director`, `admin`, `superAdmin` | Full access when that role is **active** |

Canonical registry: [`shared/permissions.ts`](../shared/permissions.ts).

## Enforcement

Env `PERMISSIONS_ENFORCEMENT`:

- `off` — no API denial
- `observe` (default) — nav filtered; API logs would-deny, still allows
- `enforce` — API returns 403 when grant missing

List APIs (`GET /staff`, `/students`, `/classes`) also filter by `accessibleLocationIds` unless school-wide / bypass. For location-scoped staff, class/student rows with `locationId == null` are treated as school-wide and kept.

## Replit / production DB (no `db:push`)

```bash
git fetch origin && git checkout main && git reset --hard origin/main
npm ci
# Apply additive SQL in Database SQL tool or:
psql "$DATABASE_URL" -f server/migrations/permissions-scoping.sql
node scripts/verify-permissions-schema.mjs
```

Then Stop → Run **Start application**. Optional dry-run backfill:

```bash
npx tsx server/scripts/backfill-staff-user-locations.ts
npx tsx server/scripts/backfill-staff-user-locations.ts --apply
```

## Staff Permissions UI

- **Per location** — flags unlock matching sidebar groups (see toggle help text).
- **School-wide access** — regional manager; entire school read/write for granted flags.
- **Invite with campus** — `POST /staff/invite` creates a default closed `user_locations` row when `locationId` is set.

## Client API

- `GET /api/me/effective-permissions` — source of truth for nav / guards (client query key includes `activeRole`)
- Hook: `useEffectivePermissions` / `useCan`
- Route guard: `SchoolRouteGuard` wraps the app router (covers `/schools/*` and `/school-admin/*`)
- Unlisted staff deep links (not in `NAV_REGISTRY`) require school-wide / bypass — not a single unrelated location flag
- `/admin/roles` matrix is **docs only** — live grants are Staff Permissions + registry

## Legacy notes

- `client/.../Sidebar.tsx` is out of scope for permission nav (prefer Unified / Parent / Educator shells).
- `users.permissions.canCreateClasses` — use `legacyCanCreateClassesAllowed`; JSONB `true` is not authorization.

## Tests

```bash
npm run test:client -- --testPathPattern="permissions|permission-shells|SchoolRouteGuard"
npm run test:server -- --testPathPattern="permissions|access-scope-middleware"
```
