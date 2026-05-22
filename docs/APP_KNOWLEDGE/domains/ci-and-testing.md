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
npm run test:e2e                 # Playwright
npm test                         # client then full server (local)
```

Production-path prerequisites: Postgres + `node scripts/ci-db-push.mjs`. See `server/tests/README.md`.

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

## Key files

- `.github/workflows/tests.yml`
- `.github/workflows/e2e.yml`
- `jest.integration.config.cjs`, `jest.config.cjs`, `jest.payments.config.cjs`
- `server/tests/helpers/productionPathApp.ts`
- `.agents/skills/asa-testing-deployment/SKILL.md`
