# CI and testing

How GitHub Actions and local test commands relate to merge gates.

## Workflows (PR / push to `main`)

| Workflow | Job | Merge signal |
|----------|-----|----------------|
| **Tests** | `tests.yml` | Schema + **production-path** + dev smoke + **client jsdom** |
| **Payments CI** | payments subset | Billing/webhook tests |
| **E2E** | Playwright | Dev server boot; placeholder Supabase env OK (see `playwright.config.ts` `envOr`) |

## Tests job steps (canonical)

1. `npm ci`, `vite build`
2. `node scripts/ci-db-push.mjs`
3. `node scripts/verify-core-schema.mjs` — `users`, `schools`, `locations`, `user_roles`, `children`
4. `node scripts/verify-f001-schema.mjs` — F001 columns/tables
5. `npm run test:server -- --testPathPatterns=production-path --runInBand --forceExit`
6. Start `npm run dev`, curl :5000
7. `npm run test:client -- --forceExit`

**Not in PR Tests gate:** full `npm run test:server` (700+ tests, Stripe/HTTP, ~45m failures). Run locally with `npm test` or debug in Payments CI.

## Env (Tests job)

- `DATABASE_URL` / `TEST_DATABASE_URL` → `asa_test` Postgres service
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — placeholders OK for production-path mocks
- Stripe secrets optional for registration lane

## Local commands

```bash
npm run test:client              # jsdom
npm run test:server              # full server integration
npm run test:payments            # payments subset
npm run test:e2e                 # Playwright (full e2e/)
npm test                         # client then full server (local)
```

**Playwright index (all `test:e2e` scripts, per-spec commands, env, seeds):** [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md).

**When adding a new `e2e/*.spec.ts`:** add a catalog row + run command to [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) (see “Maintaining this index” there); link from a domain doc/runbook if feature-specific; note in `CHANGELOG.md`. Example spec: [`e2e/public-custom-forms.spec.ts`](../../e2e/public-custom-forms.spec.ts) — `npm run test:e2e -- e2e/public-custom-forms.spec.ts`.

Production-path prerequisites: Postgres + `node scripts/ci-db-push.mjs`. See `server/tests/README.md`.

## Playwright E2E

| Topic | Detail |
|-------|--------|
| Full command index | [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) |
| CI workflow | `.github/workflows/e2e.yml` — `CI=true npm run test:e2e` |
| Config | `playwright.config.ts` — `webServer: npm run dev`, port 5000, `PLAYWRIGHT_WEB_SERVER=true` |
| Public forms lane | [`e2e/public-custom-forms.spec.ts`](../../e2e/public-custom-forms.spec.ts); domain doc [`custom-forms-public-access.md`](custom-forms-public-access.md) |
| Replit | Chromium OS libs missing — use GitHub Actions ([runbook](../runbooks/replit-e2e-playwright.md)) |

**Adding a spec:** catalog row in `E2E_COMMANDS.md` + CHANGELOG; see “Maintaining this index” in `E2E_COMMANDS.md`.

## Agent knowledge maintenance

The **Knowledge update** footer at the end of agent replies is a **session summary for humans**. It is **not** auto-ingested into a database.

| What persists | Where |
|---------------|--------|
| Durable facts, pitfalls, commands | `docs/APP_KNOWLEDGE/domains/*.md`, runbooks, [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) |
| Dated session log | [`CHANGELOG.md`](../CHANGELOG.md) |
| Agent guardrails | `.cursor/rules/app-knowledge.mdc`, `.agents/skills/asa-*` |

Future Cursor sessions read **files + rules**, not past chat footers. If the footer lists “Updated: CHANGELOG” but no file diff exists, nothing was saved.

Protocol: `~/.cursor/skills/maintain-app-knowledge/SKILL.md` (Step 2 = edit files, Step 3 = footer).

## Scripts added for CI hardening

| Script | Role |
|--------|------|
| `scripts/ci-db-push.mjs` | Bootstrap `role` enum + drizzle push, fail on error |
| `scripts/verify-core-schema.mjs` | Fail fast if core tables missing |
| `scripts/verify-f001-schema.mjs` | F001 phase columns |

## Common pitfalls

| Symptom | Cause | Fix |
|---------|--------|-----|
| `Missing script: "test"` | No `package.json` `test` script | `test` = client + server; CI uses scoped steps |
| Playwright: Supabase env empty | `""` breaks `??` defaults | `envOr()` in `playwright.config.ts` |
| Dev server: missing `SUPABASE_ANON_KEY` | tests.yml env incomplete | Placeholder in workflow |
| 49m Tests job, 180 failures | Full `test:server` in CI | Scoped to production-path + client only |
| Jest hang | Open handles | `--forceExit` in CI production-path step |
| E2E seed returns HTML / no data | Port 5000 reused by server without `/api/test` | `node scripts/free-port-5000.mjs` or `CI=true` for fresh `webServer` |
| Playwright `getByText` strict-mode: 2 matches | Print + screen copies of the same string (`hidden print:block` stays in the DOM; locators still match it) | Unique `data-testid` on the interactive copy |
| E2E all skipped; HTML Skipped filter empty | `beforeAll` `test.skip` after seed 500 (`getDb` / no Postgres); report counts skips but lists no rows | Worktree needs `.env` (symlink from main clone). Do not inject localhost `asa_test` in `playwright.config.ts` `webServer` env — it overrides `.env`. Check server log for `setup-*-scenario` 500 |
| Playwright `click` times out after success UI is visible | Overlay/toast intercepts pointer events. CSV import: first-visit `schedule-tour-prompt` (Radix `z-[9999]`) opens 600ms after Schedule Builder load and sits on `schedule-csv-*` buttons | Seed `schedule_builder_tour_seen` + `schedule_builder_tour_prompt_session` before `goto`; dismiss `schedule-tour-dismiss` if visible. After import success, `click({ force: true })` on `schedule-csv-done` if a toast remains. Do **not** `waitForLoadState("networkidle")`. |
| `text-placement-preview` missing in 45s | Preview only mounts when `autoPlaceByGrade` is on **and** location/session/grades make `canAutoPlace` true; form defaults are off until GET class `reset` | Wait for `switch-auto-place-by-grade` **enabled**, click only if `data-state !== "checked"` (toggling off hides preview). |

## Key files

- [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) — Playwright command + spec catalog
- `.github/workflows/tests.yml`
- `.github/workflows/e2e.yml`
- `jest.integration.config.cjs`, `jest.config.cjs`, `jest.payments.config.cjs`
- `server/tests/helpers/productionPathApp.ts`
- `.agents/skills/asa-testing-deployment/SKILL.md`
- [`domains/custom-forms-public-access.md`](custom-forms-public-access.md) — public Form Builder + mentor application
