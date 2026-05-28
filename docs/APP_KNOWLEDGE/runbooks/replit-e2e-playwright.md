# Replit: Playwright E2E

## Where to run E2E

**Use GitHub Actions** (`.github/workflows/e2e.yml`) for Playwright. CI runs `npx playwright install --with-deps chromium chromium-headless-shell` (headless shell needs its own OS libs on Ubuntu).

Replit’s Nix environment does **not** support the large native dependency set Chromium needs. An attempt to add `replit.nix` plus many `[nix].packages` entries (e.g. `alsa-lib`, `libdrm`, `gdk-pixbuf`) broke the Repl build (“Nix environment is broken”). `.replit` is kept minimal: `packages = ["jq"]` only.

## Symptom on Replit (if you try anyway)

```
chrome-headless-shell: error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file
exitCode=127
```

The Playwright **browser** may download, but **OS libraries** for Chromium are missing. This is an environment limitation, not an app bug.

## Local / CI

```bash
npx playwright install --with-deps chromium chromium-headless-shell
# or
npm run playwright:install:deps
```

```bash
npm run test:e2e -- e2e/parent-full-journey.spec.ts
```

(App must be reachable on port 5000; Playwright config can start `npm run dev` via webServer.)

## Requirements for full parent journey

- Real `DATABASE_URL`, `SUPABASE_*`, matching Stripe test keys (`TESTING_STRIPE_SECRET_KEY` / `VITE_TESTING_STRIPE_PUBLIC_KEY` from the same Stripe test account).

## After pulling a fix for a broken Nix env

If Replit shows **“Nix environment is broken”**:

1. **Pull latest** from your branch (config should have `packages = ["jq"]` and no `replit.nix`).
2. In Replit: **Recover original** / **Rebuild** the environment (or restart shell) so Nix reloads from `.replit`.
3. Do **not** re-add unsupported package names to `[nix].packages`; use CI for E2E instead.
