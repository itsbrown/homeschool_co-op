---
name: asa-testing-deployment
description: Workflow configuration, port binding, testing patterns, and deployment considerations for the ASA Learning Platform. Use when starting the app, debugging workflow issues, writing tests, configuring the dev environment, or preparing for deployment.
---

# ASA Testing & Deployment

## Core Rules

- **Use "Start application" workflow** (`npm run dev`) — this is the correct workflow. "Start App" is a legacy duplicate.
- **Frontend binds to port 5000** on `0.0.0.0` — never bind anything else to port 5000.
- **Never use Docker or virtual environments** — Replit uses Nix; nested virtualization is not supported.
- **Never edit `vite.config.ts` or `server/vite.ts`** — the Vite setup handles frontend/backend on the same port with all aliases preconfigured.
- **Never edit `package.json` scripts** without explicit user approval.
- **Never edit `drizzle.config.ts`**.

## Workflow Configuration

### Primary Workflow: "Start application"
- **Command**: `npm run dev`
- Starts Express backend + Vite frontend on the same port
- Backend serves API routes, Vite serves frontend with HMR
- Auto-restarts after package installation

### Legacy Workflow: "Start App"
- **Command**: `NODE_ENV=development tsx server/index.ts`
- This is a duplicate/legacy workflow — do not use it
- If both are running, prefer "Start application"

### Workflow Management
- Always restart workflows after making server-side changes
- Verify workflows run without errors before returning to the user
- Check workflow logs if the app isn't responding

## Port Configuration

- **Port 5000**: Frontend + backend (Express + Vite dev server)
- Backend API routes: `/api/*` handled by Express
- Frontend routes: Everything else handled by Vite SPA fallback
- No proxy configuration needed — same port serves both

## Database Operations

- **Schema file**: `shared/schema.ts` (Drizzle ORM)
- **Push changes**: `npm run db:push` — never write raw SQL migrations
- **Force push**: `npm run db:push --force` if data-loss warning appears
- **Debug queries**: Use the SQL execution tool, not raw `psql`
- **Never run destructive SQL** (DROP, DELETE, UPDATE) without explicit user approval
- **Connection string**: Resolve through `getNormalizedDatabaseUrl()` in `server/lib/database-url.ts` (it just normalizes `process.env.DATABASE_URL` so passwords with reserved characters parse cleanly). `DATABASE_URL` is the single source of truth in every environment — Replit injects it in dev (managed Helium) and the Reserved VM injects it in production. The legacy `PGHOST` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` / `PGPORT` fallback and the `NEON_DATABASE_URL` dev fallback have been removed.
- **SSL config**: Helium speaks plain TCP (no SSL); production uses managed SSL Postgres. Never hardcode `ssl: { rejectUnauthorized: false }` or `ssl: 'require'` on a new client — go through `getDbSslConfig()` / `getPostgresJsSslOption()` from `server/lib/database-url.ts`. See the `asa-database-patterns` skill for the copy-paste snippet.

## Testing Patterns

### End-to-End Testing (Playwright via run_test)
- Primary testing method for UI features, forms, multi-page flows
- Test against the running dev server on port 5000
- Application may have existing data — don't assume empty state
- Generate unique values (e.g., `nanoid`) for test data to avoid conflicts
- Include `data-testid` attributes on key interactive elements for reliable selectors

### What to Test with Playwright
- Frontend features and multi-page flows
- Form submission and validation
- Modal/dialog interactions
- Navigation and routing
- API + browser integration flows
- Visual verification of UI elements

### What NOT to Test with Playwright
- Pure backend logic with no frontend impact
- Simple text/copy changes
- Game-like interfaces where Playwright would fail

### Auth-Protected Testing
- Supabase auth is used — tests may need to handle login flows
- Google OAuth and other third-party providers cannot be automated via Playwright (providers block it)
- For admin/role-specific features: use DB queries to set user roles before testing (e.g., `UPDATE users SET ...`)

### API Testing
- Can test API routes directly in Playwright tests (fetch/POST)
- Include full endpoint details: method, request schema, expected response
- Test both success and error cases

### Manual Verification
- Use `curl` for quick API endpoint checks
- Check workflow logs for server errors
- Check browser console logs for frontend errors

### Test Seed Integrity
Test-seed endpoints (`/api/test/setup-cart-scenario`, `/api/test/setup-auto-pay-scenario`, etc.) must persist to Postgres via the same storage interface as production code. They must populate every NOT NULL column on the target table, and they must return `5xx` (never `200` with a MemStorage row) when a DB write fails. A silent MemStorage fallback hides schema-violating bugs and creates rows that downstream tests cannot SELECT.

- **List the NOT NULL columns first**:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'program_enrollments' AND is_nullable = 'NO';
  ```
- **Round-trip the row** — after creating, SELECT it back from Postgres in the same handler; return `500` if not found.
- **Never `catch` a DB error and fall through to `memStorage`** — fail loud with the underlying constraint violation in the response body.

**Historical example (Task #203 #8)**: `setup-cart-scenario` hit `null value in column "child_name"` on every call and silently fell back to MemStorage. The seed returned `200`, but `POST /api/payment-history/manual` (#17) returned `400 "Enrollment not found"` because the manual-payment lookup hit Postgres, not MemStorage. Two scenarios silently broke from one missing column. See `ARCHITECTURAL_PATTERNS.md` §11.

### Payment-Flow Integration Tests
End-to-end Stripe-touching tests live under `server/tests/integration/payment-flow/`.

- **How to run**: `PAYMENT_PROCESSOR_ENABLED=true npm run test:server -- --runInBand --testPathPatterns="payment-flow/<name>"` — `--runInBand` is **required**; multi-worker jest hits foreign-key contention on the shared dev Postgres (one worker's seed deletes a class while another worker is inserting an enrollment that references it). `PAYMENT_PROCESSOR_ENABLED=true` is enforced by `server/tests/setup.ts` and must be set explicitly when invoking the runner.
- **Helpers** (all under `server/tests/integration/payment-flow/helpers/`):
  - `signWebhook.ts` — signs a Stripe event with `STRIPE_WEBHOOK_SECRET` so `/api/stripe/webhook` accepts it.
  - `stripeTestClient.ts` — returns a Stripe SDK client wired to the dev Connection-API test key.
  - `confirmTestPaymentIntent.ts` — confirms a PI with a Stripe test card.
  - `seedCartScenario.ts` — `getProgramEnrollment(id)` reads back a row from Postgres for assertions.
  - `autoPayHelpers.ts` — wrappers for `/api/test/setup-auto-pay-scenario`, `/setup-multi-enrollment-cart-scenario`, `/seed-paid-enrollment-with-payment`, `/scheduled-payment/:id`, `/payment-by-stripe-id/:id`, `/refund-payment-for/:id`.
- **Stripe test-mode wiring**:
  - **In dev**: the harness fetches the Stripe test key from the Replit Connection API (`stripe`, environment=`development`), the same path `server/stripeClient.ts` and `server/config/stripe.ts` use. Do **not** rely on `STRIPE_SECRET_KEY` (it is `sk_live_…` in this project) or on `TESTING_STRIPE_SECRET_KEY` (a different test account that does not match the Connection-API key in use).
  - **In CI**: a GitHub secret (TBD: name set by the harness task) supplies the same Stripe test account credentials. CI must never use the live key.
- **What a payment-flow test must prove** (per the eight money-path patterns in `ARCHITECTURAL_PATTERNS.md` §9–§16): webhook persistence (DB row exists after a signed event), idempotency on `/create-payment-intent`, snapshot/commit parity, env-flag fail-loud behavior, no SPA shadowing of `/api/*` routes.

#### Hard-won rules (Task #217)

1. **Always import jest from `@jest/globals`** at the top of every server test file:
   ```typescript
   import { describe, it, expect, beforeAll } from '@jest/globals';
   ```
   Under `--experimental-vm-modules` ESM, the `jest` global is **not** auto-injected. A missing import surfaces as `ReferenceError: jest is not defined` — and `server/tests/setup.ts` itself needs `import { jest } from '@jest/globals'` for the same reason. A missing import in `setup.ts` silently breaks every test in the suite, not just one file.

2. **Cart-checkout endpoints reject session cookies — they require a real Supabase JWT.** `POST /api/test/login` only sets a session cookie. `/api/cart/snapshot` and `/api/stripe/create-payment-intent` go through `supabaseAuth`, which expects an `Authorization: Bearer …` header and returns `401 "Missing or invalid authorization header"` to session-only callers. Webhook-flow tests must drive PaymentIntents **directly** with the `paymentType` metadata the webhook handler expects (`scheduled_payment`, `balance_payment`, etc.) instead of going through the cart route. Cart auth in tests is an unsolved problem — do not assume the existing `cart-pi-success.test.ts` pattern works.

3. **For non-cart-checkout PI metadata shapes, the webhook handler skips PaymentProcessorService whenever it returns `success: false`.** PaymentProcessor returns false when the parent has no `stripe_customer_id` or no signed snapshot — both of which are true in tests. The legacy branch (`processBalancePayment`, scheduled-payment branch, etc.) then runs and writes to the legacy `payments` table. This is why direct-PI tests work without setting up customers/snapshots.

4. **Refund regressions must pre-seed the `payments` row, not derive it from a success webhook.** `charge.refunded` queries `payments` via `storage.getPaymentByStripeId`. Whether the original payment lands in `payments` (legacy) or `stripe_payment_history` (PaymentProcessor) depends on which success branch ran in production. Pre-seeding via `/api/test/seed-paid-enrollment-with-payment` keeps the refund test focused on the refund handler in isolation and immune to upstream routing changes.

5. **`program_enrollments.status` enum reminder.** Allowed values are `pending_payment | pending_admin_approval | enrolled | waitlist | cancelled | completed | withdrawn | failed`. There is no `'active'` — that's the `users` table. Wrong values fail a CHECK constraint at insert time, not at validation time.

## Environment Variables

- **Secrets** (API keys, credentials): Use the secrets request tool — never set directly or expose values
- **Regular env vars**: Use the env var set tool
- **Default environment**: Use `shared` unless different values are needed for dev/production
- **Frontend env vars**: Must be prefixed with `VITE_` to be accessible via `import.meta.env`
- View current vars/secrets with the env var view tool
- **`DATABASE_URL`** is the single source of truth for the DB connection. Replit dev points it at Helium Postgres (no SSL); production points it at the managed SSL Postgres. Never reintroduce `PGHOST` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` / `PGPORT` fallbacks, and never hardcode SSL — see `getDbSslConfig()` / `getPostgresJsSslOption()` in `server/lib/database-url.ts`.

## Deployment (Publishing)

- Use Replit's built-in publishing — no external hosting needed
- Publishing handles building, hosting, TLS, and health checks automatically
- App will be available at a `.replit.app` domain or custom domain
- Production logs are separate from development workflow logs — check them if the published app has issues

### Deployment Type: Reserved VM (Required)

This app **must always be deployed as a Reserved VM**, not Autoscale.

**Why**: The auto-pay scheduler, payment reminder jobs, membership updater, reconciliation job,
and WebSocket server all run on `setInterval` in a long-lived Node.js process. Autoscale
deployments spin down between requests, silently killing all background services:
- Payments due during downtime are not collected
- WebSocket connections drop without reconnect
- No error is thrown — the scheduler simply never runs

**Production commands**:
- Build: `npm run build`
- Start: `npm run start`

Verify the deployment type in Replit's deployment settings before every publish.

## Vite SPA Deployment: Cache Headers

**Apply before every first deployment. Verify after every rebuild.**

Vite fingerprints asset chunk filenames (e.g., `CartCheckout-D5A6e8cz.js`) for safe long-lived
caching. However, `index.html` is never fingerprinted — it is always served at the same URL. If a
browser caches a pre-deployment `index.html`, it will request old chunk filenames that no longer
exist on the new build. The server returns the SPA fallback (HTML), and the browser throws:

> "Failed to fetch dynamically imported module" / "text/html is not a valid JavaScript module"

This breaks ALL frontend routes simultaneously — users see blank pages or JS errors with no obvious
connection to a deployment event. Symptoms are reported as individual feature failures ("biweekly
payment broken", "notifications page broken") but the root cause is a single missing header.

### The Fix (permanent — already applied, never remove)

This middleware lives in `server/index.ts` **inside the `else` block, before `serveStatic(app)`**.
Never add it to `server/vite.ts` — that file is forbidden to edit. It only runs in production
(`NODE_ENV !== 'development'`), so it does not affect local dev.

```typescript
app.use((req, res, next) => {
  if (
    req.path === "/" ||
    (!req.path.startsWith("/api") && !req.path.match(/\.\w+$/))
  ) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
serveStatic(app);
```

Asset chunks (`/assets/*.js`, `/assets/*.css`) are **not** affected — their filenames change with
every build, so they remain safe to cache indefinitely.

### Stale-Cache Symptom Pattern

When multiple users report different features failing after a deployment, check error telemetry
**first** for these strings before investigating any feature-specific bug:

- `"Failed to fetch dynamically imported module"`
- `"text/html is not a valid JavaScript module"`
- `"ChunkLoadError"`

If these appear clustered around a deploy time, the root cause is always stale cache — one fix
resolves all reported symptoms. Do not chase individual feature bugs until this is ruled out.

## Post-Deployment Verification Checklist

Run within 5 minutes of every deployment:

**1. Background services started**
Check production logs for scheduler startup messages:
- `💳 Starting auto-pay job...` + `✅ Auto-pay job initialized`
- `✅ Enrollment reminder scheduler started`
- `[ReconciliationJob] Scheduled daily reconciliation`
If absent → deployment type is Autoscale, not Reserved VM. Change it.

**2. No chunk-load failures**
Search production logs for:
- `"Failed to fetch dynamically imported module"`
- `"text/html is not a valid JavaScript module"`
If present → `Cache-Control` middleware is missing or placed after `serveStatic`.

**3. Frontend loads in a fresh browser**
Open `/dashboard` or `/cart/checkout` in an incognito window. Blank page or JS error → same fix as step 2.

**4. Test endpoints locked**
Confirm `POST /api/test/setup-auto-pay-scenario` returns `403 Forbidden` in production.
If it returns data → `NODE_ENV` is not set to `production` in the deployment environment.

## Common Pitfalls

- **App not starting** → used "Start App" workflow instead of "Start application" → switch to "Start application" (`npm run dev`)
- **Frontend can't reach API** → port conflict or wrong binding → ensure only Express+Vite uses port 5000
- **Server changes not visible** → workflow not restarted after code changes → restart "Start application" and verify clean startup
- **Tests fail with "element not found"** → test assumes empty database state → generate unique test data with `nanoid` instead
- **Frontend env var undefined** → missing `VITE_` prefix → rename to `VITE_MY_VAR` and access via `import.meta.env.VITE_MY_VAR`
- **Schema change not applied** → wrote raw SQL migration file → use `npm run db:push` (Drizzle handles it)
- **`The server does not support SSL connections`** in dev → a `pg`/`postgres.js` client was opened with hardcoded `ssl: { rejectUnauthorized: false }` or `ssl: 'require'`. Replit dev uses Helium, which does not accept SSL handshakes. Replace the hardcoded option with `getDbSslConfig()` (for `pg`) or `getPostgresJsSslOption()` (for `postgres.js`) from `server/lib/database-url.ts` so SSL is enabled only when `NODE_ENV === 'production'`.
- **Chunk load failures after deployment** → `index.html` cached by browser with stale chunk hashes → verify `Cache-Control: no-cache` middleware is present in `server/index.ts` inside the production `else` block, before `serveStatic(app)`. Symptom: "Failed to fetch dynamically imported module" or "text/html is not valid JavaScript" in error telemetry. Affects ALL frontend routes simultaneously — not just the one the user reported.
- **Scheduler not running in production** → deployment type is Autoscale, not Reserved VM → change to Reserved VM in Replit deployment settings. Autoscale spins down between requests, killing all `setInterval`-based background jobs silently with no error or warning.

## Best Practices

### Do
- Always use the "Start application" workflow (`npm run dev`)
- Always restart workflows after server-side changes and verify they start cleanly
- Always generate unique test data (nanoid) to avoid conflicts with existing records
- Always check workflow logs when debugging server issues
- Always use `npm run db:push` for schema changes — never write raw SQL migrations
- Always prefix frontend env vars with `VITE_`
- Always use the secrets tool for sensitive values like API keys
- Always verify the `Cache-Control: no-cache` middleware is present in `server/index.ts` before publishing
- Always check error telemetry for chunk-load failure patterns before diagnosing individual feature bugs after a deployment
- Always deploy as Reserved VM — verify this setting before every publish

### Don't
- Don't use the "Start App" workflow — it's a legacy duplicate
- Don't bind anything other than the frontend to port 5000
- Don't use Docker, virtual environments, or containerization
- Don't edit `vite.config.ts`, `server/vite.ts`, or `drizzle.config.ts`
- Don't edit `package.json` scripts without user approval
- Don't write Playwright tests that assume empty database state
- Don't expose or log secrets/API keys in code
- Don't use raw `psql` for database debugging — use the SQL execution tool
- Don't remove the `Cache-Control: no-cache` middleware from `server/index.ts` — post-deployment chunk-load failures will break all frontend routes for users with cached browsers
- Don't treat "feature X is broken" reports at face value after a deployment — rule out stale-cache chunk errors first
- Don't deploy as Autoscale — background schedulers and WebSocket connections will silently die between requests

## Key Files
- `server/index.ts` — Express server entry point; port binding; `Cache-Control` middleware for production
- `server/vite.ts` — Vite dev server integration (do not edit)
- `vite.config.ts` — Vite configuration with aliases (do not edit)
- `drizzle.config.ts` — Drizzle ORM config (do not edit)
- `shared/schema.ts` — database schema definitions
- `client/src/lib/queryClient.ts` — API client configuration
- `replit.md` — project documentation and architecture notes
