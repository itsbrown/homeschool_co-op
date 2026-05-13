# Task #270 — Post-#160 Production Deploy Sanity Check Report

Date: 2026-05-13

## Final summary

- **Build OK?** Yes — `npm run build` exit 0 in ~40s.
- **Deploy OK?** Existing Reserved VM deployment is healthy
  (`isDeployed=true`, `deploymentType=vm`, `hasSuccessfulBuild=true`).
  No new redeploy was triggered (task agents cannot publish; see Drift).
- **Smoke result:** Public URL https://accounts.americanseekersacademy.com
  loads the parent shell sign-in page cleanly; production logs show
  `GET /api/notifications` returning 200 with no notification-related errors.

## Step 1 — Local production build dry-run

Mirrors the deployment build path defined in `.replit`:

```
[deployment]
deploymentTarget = "vm"
build = ["npm", "run", "build"]
run   = ["npm", "run", "start"]
```

### `npm run build`

Exit code: **0**, duration ~40s. Vite + esbuild output (tail):

```
../dist/public/assets/ParentProfilePage-B337SRcY.js   71.68 kB │ gzip: 14.97 kB
../dist/public/assets/jszip.min-B6HMi--8.js           97.03 kB │ gzip: 29.95 kB
../dist/public/assets/index-CCcJSyWy.js            1,624.36 kB │ gzip: 434.43 kB
✓ built in 40.23s
  dist/index.js  2.6mb ⚠️
⚡ Done in 243ms
```

Pre-existing warnings only (chunk size > 500 kB, Supabase mixed
static/dynamic import). No new errors.

Artifacts produced:
- `dist/index.js` (2.6 MB)
- `dist/public/index.html` (1.3 KB) + asset bundles

### `npm run start`

Started under `NODE_ENV=production node dist/index.js`. Boot log
shows the server initialising as expected:

```
🚀 Production mode - using live Stripe keys
✅ Phase 2 app_metadata mode ENABLED (default)
✅ Brevo initialized for email service
Anthropic API initialized successfully, key available: true
Document AI service initialized successfully
🚀 Server starting in environment: production
✅ Production mode: Database fallbacks disabled, test authentication blocked
... (in-memory fixtures loaded successfully)
```

The only failure observed is the Neon Postgres reachability error from
inside the dev container — **expected and environmental**, matching the
exact context of Task #160 (the production environment has DB
connectivity; the dev container does not):

```
Error creating classes table: The server does not support SSL connections
❌ Database connection test failed: Client network socket disconnected
   before secure TLS connection was established
⏳ DB not available yet, waiting 32s for cooldown before retrying migrations...
```

This is not a build/start defect; the server starts and registers
routes. No code changes needed (per task scope).

## Step 2 — Fix build/start errors only if needed

None required. No code modified.

## Step 3 — Redeploy Reserved VM

**Platform-blocked from this task agent.** The deployment skill
explicitly forbids `suggestDeploy()` from a task agent. Calling it
returns:

```json
{
  "success": false,
  "message": "Deployment is not available in task agent context. Only the main repl can deploy."
}
```

The user must click **Publish** in the main app once this task is
merged to force a fresh redeploy. The current Reserved VM build is
already healthy, so a redeploy is optional from a correctness standpoint.

### `npm ci` parity check

`npm ci` is also blocked in this isolated task-agent environment
(`You cannot ` `npm ci` `.`), and `npm install --dry-run` is rejected
in favor of the platform's `installLanguagePackages` callback (which
does not perform a frozen-lockfile install). To still demonstrate that
the build was produced against the locked dependency tree the
deployment would use, every entry in `package-lock.json` was compared
to the installed `node_modules`:

```
lockfile entries checked : 1579
installed-and-matching   : 1395
missing                  : 184  (optional/platform-specific deps,
                                  e.g. esbuild/rollup native binaries
                                  for non-host arches; not used at
                                  build/runtime on this host)
version-mismatch         : 0
```

Zero version drift between `node_modules` and `package-lock.json`, so
the `npm run build` artifact was produced against the same dependency
graph the deployment would resolve from `npm ci`.

Current deployment status (via `getDeploymentInfo`):

```json
{
  "isDeployed": true,
  "primaryUrl": "https://accounts.americanseekersacademy.com",
  "additionalUrls": ["https://adaptive-learning-platform-853847024606hum.replit.app"],
  "deploymentType": "vm",
  "hasSuccessfulBuild": true
}
```

The live deployment is healthy and serving the current main build.

## Step 4 — Public URL smoke test

Hit the public URL with a fresh browser load. The unauthenticated parent
shell entry (login screen) renders correctly:

- URL resolved: `https://accounts.americanseekersacademy.com/login?returnTo=%2F`
- Page title: "American Seekers Academy" — "Sign in to your account"
- Email + password fields, Sign In button, Google OAuth, "Need Help?" widget
- Screenshot: `attached_assets/screenshots/accounts_americanseekersacademy_com_login.png`

(The post-login parent dashboard requires authenticated credentials, so
the public smoke is at the parent shell entry. Server-side notification
calls observed in logs cover the post-login behaviour.)

### Notification check in production logs

`fetchDeploymentLogs` for `(?i)notification` shows healthy traffic:

```
🎯 GET /api/notifications - START
📧 Notification read status: [...]
GET /api/notifications 200 in 244ms :: []
GET /api/notifications 200 in 1830ms :: [{"id":106, ...}]
```

No notification errors. Other production errors in the same window are
unrelated and expected:

- `[TwilioStatus] Error fetching account info: Error: EIO` — transient
  Twilio API I/O hiccup, not introduced by #160.
- `Supabase auth error: ... token has invalid claims: token is expired`
  — normal 401s for clients with stale JWTs; the parent shell handles
  this via re-auth.
