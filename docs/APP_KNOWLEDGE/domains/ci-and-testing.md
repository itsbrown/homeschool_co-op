# CI and testing

How GitHub Actions and local test commands relate to merge gates.

## Workflows (PR / push to `main`)

| Workflow | Job | Merge signal |
|----------|-----|----------------|
| **Tests** | `tests.yml` | Schema + **production-path** + dev smoke + **client jsdom** |
| **Payments CI** | payments subset | Billing/webhook tests |
| **E2E** | Playwright | Dev server boot; placeholder Supabase env OK (see `playwright.config.ts` `envOr`) |
| **Fall 2026 roster snapshot** | `fall-2026-roster-snapshot.yml` | Not a merge gate. Daily 08:00 ET through **2026-09-21**. Overwrites `docs/audit/fall-2026-class-rosters.csv`; appends pending→enrolled to `docs/audit/fall-2026-class-rosters-transitions.csv`. Secret: `PROD_DATABASE_URL` (Neon prod, never Railway clone). Optional `ROSTER_SNAPSHOT_TOKEN` if Actions cannot push `main`. Manual: Actions → Fall 2026 roster snapshot → Run workflow. |

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
| Seed/login helper | [`e2e/helpers/requireLinkedSeed.ts`](../../../e2e/helpers/requireLinkedSeed.ts) — fail if seed/Supabase missing |
| Cursor rule | `.cursor/rules/e2e-seed-gate.mdc` |
| Local DB | `.env` `DATABASE_URL` = Railway **clone** (dev). Never `.env.prod` / `with-prod-env.mjs` for Playwright |
| CI workflow | `.github/workflows/e2e.yml` — `CI=true npm run test:e2e` |
| Config | `playwright.config.ts` — `webServer: npm run dev`, port 5000, `PLAYWRIGHT_WEB_SERVER=true` |
| Public forms lane | [`e2e/public-custom-forms.spec.ts`](../../e2e/public-custom-forms.spec.ts); domain doc [`custom-forms-public-access.md`](custom-forms-public-access.md) |
| Replit | Chromium OS libs missing — use GitHub Actions ([runbook](../runbooks/replit-e2e-playwright.md)) |

**Adding a spec:** catalog row in `E2E_COMMANDS.md` + CHANGELOG; seed/login specs use `requireLinkedSeed` and must be run (skip ≠ pass).

## Agent knowledge maintenance

The **Knowledge update** footer at the end of agent replies is a **session summary for humans**. It is **not** auto-ingested into a database.

| What persists | Where |
|---------------|--------|
| Durable facts, pitfalls, commands | `docs/APP_KNOWLEDGE/domains/*.md`, runbooks, [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) |
| Dated session log | [`CHANGELOG.md`](../CHANGELOG.md) |
| Agent guardrails | `.cursor/rules/app-knowledge.mdc`, `.cursor/rules/e2e-seed-gate.mdc`, `.agents/skills/asa-*` |

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
| Edit Class lead mentor: HTML `Cannot POST /api/admin/educators/class-assignments` | Router file existed, never mounted in `registerRoutes` | Mount before `/api/admin`; gate: `admin-educators-mount.test.ts` |
| E2E seed returns HTML / no data | Port 5000 reused by server without `/api/test` | `node scripts/free-port-5000.mjs` or `CI=true` for fresh `webServer` |
| Playwright report green but skipped | `test.skip` on missing `supabaseLinked` | `requireLinkedSeed`; symlink `.env` + `.env.e2e` in worktrees |
| E2E against live Stripe/prod | Loaded `.env.prod` | Use `.env` (Railway clone) + `.env.e2e` only |

## Key files

- [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) — Playwright command + spec catalog
- [`e2e/helpers/requireLinkedSeed.ts`](../../../e2e/helpers/requireLinkedSeed.ts)
- `.cursor/rules/e2e-seed-gate.mdc`
- `.github/workflows/tests.yml`
- `.github/workflows/e2e.yml`
- `jest.integration.config.cjs`, `jest.config.cjs`, `jest.payments.config.cjs`
- `server/tests/helpers/productionPathApp.ts`
- `.agents/skills/asa-testing-deployment/SKILL.md`
- [`domains/custom-forms-public-access.md`](custom-forms-public-access.md) — public Form Builder + mentor application
