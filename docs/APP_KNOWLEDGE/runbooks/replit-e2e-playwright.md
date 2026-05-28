# Replit: Playwright E2E

## Symptom

```
chrome-headless-shell: error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file
exitCode=127
```

The Playwright **browser** downloaded, but **OS libraries** for Chromium are missing. This is not an app bug.

## Fix (after `git pull`)

1. **Rebuild the Repl environment** so Nix picks up `replit.nix` and `.replit` `[nix].packages` (shell restart alone may not be enough — use Replit **Rebuild** / fresh shell from updated config).
2. Install the browser once per machine:

   ```bash
   npm run playwright:install:replit
   ```

3. Run E2E (app must be reachable on port 5000 — Playwright starts `npm run dev` unless one is already running):

   ```bash
   npm run test:e2e -- e2e/parent-full-journey.spec.ts
   ```

## Local Ubuntu / GitHub Actions

Use system deps via apt:

```bash
npx playwright install chromium --with-deps
# or
npm run playwright:install:deps
```

CI already runs `npx playwright install chromium --with-deps` in `.github/workflows/e2e.yml`.

## Requirements for full parent journey

- Real `DATABASE_URL`, `SUPABASE_*`, matching Stripe test keys (`TESTING_STRIPE_SECRET_KEY` / `VITE_TESTING_STRIPE_PUBLIC_KEY` from the same Stripe test account).
