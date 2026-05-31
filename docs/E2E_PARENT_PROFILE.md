# Parent shell E2E (authenticated)

**Full Playwright index:** [`docs/E2E_COMMANDS.md`](E2E_COMMANDS.md).

These tests live under `e2e/authenticated/` and run in Playwright’s **`chromium-authenticated`** project. They assert that, for a real logged-in parent session, each major parent route loads and that **critical GET APIs return 2xx** (no silent HTML/SPA fallback for JSON routes).

## Prerequisites

1. **App + Vite** on port 5000 (Playwright `webServer` runs `npm run dev` unless you reuse an existing server).
2. **Supabase** reachable at the URLs used by the client and server (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, matching `VITE_*` vars). Local CLI default is `http://127.0.0.1:54321`.
3. **Database** — set `DATABASE_URL` so the API uses Postgres (same as production). Without it, the dev server may fall back to file-backed storage and routes/APIs will not match production behavior.
4. **Parent test user** — a Supabase user that can sign in at `/login` with the **parent** role (single-role parent is simplest; see `e2e/auth.setup.ts`).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `E2E_PARENT_EMAIL` | Parent login email (enables setup + `chromium-authenticated` project) |
| `E2E_PARENT_PASSWORD` | Parent login password |
| `E2E_TEST_API_TOKEN` | Optional; defaults match `e2e/helpers/testSeed.ts` for `/api/test/*` |

When `E2E_PARENT_EMAIL` and `E2E_PARENT_PASSWORD` are **unset**, Playwright does not register the setup project or `chromium-authenticated`; specs under `e2e/authenticated/` are **not** run by the default `chromium` project (they are ignored).

## Seed path (optional)

To create a disposable parent + enrollment + Supabase link (for checkout flows, not required for the shell route specs):

- `POST /api/test/setup-cart-scenario` with header `X-Test-Token` — see `e2e/helpers/testSeed.ts` and `e2e/parent-payment-flow.spec.ts`.
- Requires working **Postgres + Supabase service role** so `linkSupabaseAuth: true` succeeds.

The **`parent-profile-routes`** specs only need an **existing** parent who can log in; they do not call the cart seed endpoint.

## Commands

```bash
# Install browser once
npm run playwright:install

# Full E2E (unauthenticated + authenticated if env set)
npm run test:e2e

# Only authenticated parent-shell specs (still requires env + working stack)
npm run test:e2e:authenticated
```

Example with local Supabase + DB:

```bash
export DATABASE_URL="postgresql://..."
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export E2E_PARENT_EMAIL="parent-you-created@example.com"
export E2E_PARENT_PASSWORD="your-secure-password"

npm run test:e2e:authenticated
```

## What is asserted

For each listed route, the spec:

1. Starts `waitForResponse` on the expected **GET** URL substrings, then `goto` the page (so responses are not missed).
2. Expects each matching response **`ok()`** (2xx).
3. Expects the URL **not** to settle on `/login`.
4. Expects no known fatal copy (“Could not load children”, “Access Denied” as sole heading).
5. Expects a **visible** heading or label regex appropriate to that page.

Extend `e2e/authenticated/parent-profile-routes.spec.ts` when you add parent routes or new critical queries.

## School admin — parent profile Credits tab

`e2e/parent-profile-credits-tab.spec.ts` exercises the school-admin flow at `/schools/parents/:id` → **Credits** tab:

- Award credit and assert **Available Balance** (`data-testid="text-credits-available-balance"`)
- Edit an unused approved credit
- Revoke a credit and confirm revoked rows do not count toward the balance

It seeds via `POST /api/test/setup-cart-scenario` with `linkSupabaseAuth: true` and `linkSupabaseAuthAdmin: true` (same Postgres + Supabase requirements as checkout E2E).

```bash
export DATABASE_URL="postgresql://..."
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="..."
export SUPABASE_SERVICE_ROLE_KEY="..."

npm run test:e2e -- e2e/parent-profile-credits-tab.spec.ts
```
