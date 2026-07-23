# Playwright E2E — command index

Single reference for **npm scripts**, **per-spec commands**, prerequisites, and test seeds. Specs live in [`e2e/`](../e2e/); config is [`playwright.config.ts`](../playwright.config.ts).

## Maintaining this index (required when adding E2E)

When you add or materially change a Playwright spec under `e2e/`:

1. **Add a row** to the [Spec catalog](#spec-catalog) below: spec path, run command, what it covers, prerequisites, and `/api/test/*` seed if any.
2. **Optional:** add a dedicated npm script in `package.json` only when the spec is run often (e.g. `test:e2e:checkout-membership`); otherwise use `npm run test:e2e -- e2e/your-spec.spec.ts`.
3. **Cross-link** from a domain doc or runbook when the spec documents a product lane (example: [`public-mentor-application-form.md`](APP_KNOWLEDGE/runbooks/public-mentor-application-form.md) → `e2e/public-custom-forms.spec.ts`).
4. **CHANGELOG:** one dated bullet in [`docs/APP_KNOWLEDGE/CHANGELOG.md`](APP_KNOWLEDGE/CHANGELOG.md) with spec file + command.

Agents: see `asa-testing-deployment` and `asa-app-knowledge` maintenance workflow.

## Quick start

```bash
# Install browser + OS libs (once per machine / CI image)
npm run playwright:install:deps

# Full suite (starts npm run dev on :5000 unless CI/reuse rules apply)
npm run test:e2e

# One file or folder (recommended for focused work)
npm run test:e2e -- e2e/public-custom-forms.spec.ts
```

**Local env:** Copy [`.env.e2e.example`](../.env.e2e.example) → `.env.e2e` (gitignored). Loaded by [`scripts/run-playwright.mjs`](../scripts/run-playwright.mjs) without overriding shell exports.

**Port 5000:** If tests fail with HTML instead of JSON from `/api/test/*`, free the port and avoid a stale server:

```bash
node scripts/free-port-5000.mjs
CI=true npm run test:e2e -- e2e/smoke.spec.ts
```

**Replit:** Prefer GitHub Actions for E2E; see [`docs/APP_KNOWLEDGE/runbooks/replit-e2e-playwright.md`](APP_KNOWLEDGE/runbooks/replit-e2e-playwright.md).

---

## npm scripts (`package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `test:e2e` | `node scripts/run-playwright.mjs test` | All specs under `e2e/` |
| `test:e2e:ui` | `… test --ui` | Playwright UI mode |
| `test:e2e:headed` | `… test --headed` | Visible browser |
| `test:e2e:checkout-membership` | `… test e2e/checkout-membership-order-summary.spec.ts` | Membership order summary |
| `test:e2e:authenticated` | `… test e2e/authenticated/` | Logged-in parent specs (needs env below) |
| `playwright:install` | `… install chromium` | Browser binary only |
| `playwright:install:deps` | `… install-deps chromium chromium-headless-shell` | Browser + Ubuntu/macOS libs |
| `playwright:install:replit` | alias of `playwright:install` | Replit (limited; use CI for full E2E) |

**CI:** [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) runs `CI=true npm run test:e2e` (full suite, placeholder Supabase OK for smoke/public specs).

**Pass extra Playwright flags** after `--`:

```bash
npm run test:e2e -- e2e/smoke.spec.ts --debug
npm run test:e2e:headed -- e2e/school-code-registration.spec.ts
```

---

## Environment variables

| Variable | Used for |
|----------|----------|
| `DATABASE_URL` | Postgres; required for any spec that calls `/api/test/*` seeds |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Real auth (registration, login, seeded users) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser Supabase client (often same as above) |
| `E2E_PARENT_EMAIL`, `E2E_PARENT_PASSWORD` | `auth.setup.ts` + `e2e/authenticated/**` project |
| `E2E_EDUCATOR_EMAIL` (+ password if added later) | `e2e/authenticated/educator-progress-tab.spec.ts` |
| `E2E_TEST_API_TOKEN` | `X-Test-Token` header (default `test-secret-token`) |
| `TESTING_STRIPE_SECRET_KEY`, `VITE_TESTING_STRIPE_PUBLIC_KEY` | Live Stripe test mode checkout specs |
| `VITE_E2E_EXPOSE_CART` | Set `true` by Playwright webServer for membership cart hook |

Placeholder Supabase keys in `playwright.config.ts` are enough for **smoke** and **public custom forms**. Specs that call `isRealSupabaseConfigured()` or need `supabaseLinked: true` **skip** without real keys.

---

## Playwright projects

| Project | Runs | When |
|---------|------|------|
| `chromium` | All `e2e/*.spec.ts` except `auth.setup.ts` and `authenticated/` | Always |
| `setup` | `e2e/auth.setup.ts` | `E2E_PARENT_EMAIL` + `E2E_PARENT_PASSWORD` set |
| `chromium-authenticated` | `e2e/authenticated/**` | After `setup`; uses `playwright/.auth/parent.json` |

Run authenticated lane only:

```bash
npm run test:e2e:authenticated
```

See also [`docs/E2E_PARENT_PROFILE.md`](E2E_PARENT_PROFILE.md).

---

## Spec catalog

### Always runs (default `chromium` project)

| Spec | Command | What it covers | Prerequisites |
|------|---------|----------------|---------------|
| [`e2e/smoke.spec.ts`](../e2e/smoke.spec.ts) | `npm run test:e2e -- e2e/smoke.spec.ts` | `/` HTML shell; `/api/cart/snapshot` returns JSON | Dev server on :5000 |
| [`e2e/permissions-nav.spec.ts`](../e2e/permissions-nav.spec.ts) | `npm run test:e2e -- e2e/permissions-nav.spec.ts` | School-admin finance deep link → login or forbidden (permissions smoke) | Dev server on :5000 |
| [`e2e/public-custom-forms.spec.ts`](../e2e/public-custom-forms.spec.ts) | `npm run test:e2e -- e2e/public-custom-forms.spec.ts` | Public `/forms/:slug`, API, **resume `upload-attachment`**, browser upload + submit | `DATABASE_URL`; seed `setup-public-form-scenario`; stub storage via `PLAYWRIGHT_WEB_SERVER` |
| [`e2e/form-editor-fields.spec.ts`](../e2e/form-editor-fields.spec.ts) | `npm run test:e2e -- e2e/form-editor-fields.spec.ts` | School-admin Form Editor: add/update/delete field persist; publish → public form shows field | `setup-public-form-scenario` + `linkSupabaseAuthAdmin` |
| [`e2e/form-submission-notify-spam.spec.ts`](../e2e/form-submission-notify-spam.spec.ts) | `npm run test:e2e -- e2e/form-submission-notify-spam.spec.ts` | Submit persist; admin + submitter `email_log`; honeypot; required fields; duplicate block; submit rate limit 429 | `setup-public-form-scenario`; `GET /api/test/email-log`; `FORM_SUBMIT_RATE_LIMIT` |
| [`e2e/form-smart-builder.spec.ts`](../e2e/form-smart-builder.spec.ts) | `npm run test:e2e -- e2e/form-smart-builder.spec.ts` | AI Smart Builder chat → draft → apply-draft; no auto-publish; AI rate limit | `setup-public-form-scenario` + `linkSupabaseAuthAdmin`; `FORM_BUILDER_AI_MOCK=1` |
| [`e2e/parent-dashboard.spec.ts`](../e2e/parent-dashboard.spec.ts) | `npm run test:e2e -- e2e/parent-dashboard.spec.ts` | Unauthenticated dashboard gating | — |

### Postgres + Supabase (skips if seed/auth fails)

| Spec | Command | What it covers | Seed endpoint |
|------|---------|----------------|---------------|
| [`e2e/school-code-registration.spec.ts`](../e2e/school-code-registration.spec.ts) | `npm run test:e2e -- e2e/school-code-registration.spec.ts` | `/register/:code` UI + live signup | `POST /api/test/setup-registration-scenario` |
| [`e2e/session-enrollment-flow.spec.ts`](../e2e/session-enrollment-flow.spec.ts) | `npm run test:e2e -- e2e/session-enrollment-flow.spec.ts` | Parent session wizard + `POST /api/session-enrollments` | `setup-session-enrollment-scenario` |
| [`e2e/quarterly-progress-report-wizard.spec.ts`](../e2e/quarterly-progress-report-wizard.spec.ts) | `npm run test:e2e -- e2e/quarterly-progress-report-wizard.spec.ts` | Educator NY \| Progress report wizard (save rubric, finalize) + parent PDF download + optional axe on parent hub | `setup-progress-scenario`, Supabase auth linked |
| [`e2e/public-store-share.spec.ts`](../e2e/public-store-share.spec.ts) | `npm run test:e2e -- e2e/public-store-share.spec.ts` | Store **Share** button on catalog + detail; guest share message (description + link, no `userId`); `?userId=` session capture; merch checkout sends `referredByUserId` and admin sign-ups show referral; logged-in parent share includes `userId` | `ensure-public-store-schema` + `setup-public-store-scenario`; Supabase for logged-in parent share + admin sign-ups verification; `fulfill-store-checkout` |
| [`e2e/public-store-auth-redirect.spec.ts`](../e2e/public-store-auth-redirect.spec.ts) | `npm run test:e2e -- e2e/public-store-auth-redirect.spec.ts` | Store login **`returnTo`**: browse → store, item detail → same slug URL, merch checkout contact → checkout + cart, program checkout children step → checkout + cart, `sessionStorage` persistence, member banner after login | `ensure-public-store-schema` + `setup-public-store-scenario` with `withParent` + `linkSupabaseAuthParent`; Supabase required (spec skips without link) |
| [`e2e/public-store.spec.ts`](../e2e/public-store.spec.ts) | `npm run test:e2e -- e2e/public-store.spec.ts` | Public store merch + **Classes & programs** (catalog image, admin listing toggle, program image); **item detail** page; guest class checkout (emergency contact, grade select, test fulfill); **login from checkout** (`returnTo` + cart preserved); **cart UX** (add toast, qty +/-, remove line) | `ensure-public-store-schema` + `setup-public-store-scenario` (+ `withParent` / `linkSupabaseAuthParent` for login test); optional `fulfill-store-checkout`; `PUBLIC_STORE_ENABLED=true`; Supabase for admin/login tests |
| [`e2e/credit-management-parent-lookup.spec.ts`](../e2e/credit-management-parent-lookup.spec.ts) | `npm run test:e2e -- e2e/credit-management-parent-lookup.spec.ts` | School-admin parent search / manual credit | `setup-credit-lookup-scenario` |
| [`e2e/parent-profile-credits-tab.spec.ts`](../e2e/parent-profile-credits-tab.spec.ts) | `npm run test:e2e -- e2e/parent-profile-credits-tab.spec.ts` | Admin parent profile Credits tab | `setup-cart-scenario` (`linkSupabaseAuthAdmin`) |
| [`e2e/help-issue-submission.spec.ts`](../e2e/help-issue-submission.spec.ts) | `npm run test:e2e -- e2e/help-issue-submission.spec.ts` | Need Help → Report an Issue (platform + school policy, screenshot upload, payment help link, school admin list) | `ensure-technical-support-schema` + `setup-cart-scenario` (`linkSupabaseAuth`, `linkSupabaseAuthAdmin`) |
| [`e2e/school-analytics-engagement.spec.ts`](../e2e/school-analytics-engagement.spec.ts) | `npm run test:e2e -- e2e/school-analytics-engagement.spec.ts` | School Analytics → Engagement tab + `/api/school-analytics/engagement` | `setup-cart-scenario` (`linkSupabaseAuthAdmin`) |
| [`e2e/school-analytics-cart-abandonment.spec.ts`](../e2e/school-analytics-cart-abandonment.spec.ts) | `npm run test:e2e -- e2e/school-analytics-cart-abandonment.spec.ts` | School Analytics → Cart Abandonment tab + funnel API | `setup-cart-scenario` (`linkSupabaseAuthAdmin`) |
| [`e2e/parent-progress-charts.spec.ts`](../e2e/parent-progress-charts.spec.ts) | `npm run test:e2e -- e2e/parent-progress-charts.spec.ts` | Parent `/parent/progress` Charts tab + child analytics API | `setup-progress-scenario` (`linkSupabaseAuth`) |
| [`e2e/schedule-builder-publish.spec.ts`](../e2e/schedule-builder-publish.spec.ts) | `npm run test:e2e -- e2e/schedule-builder-publish.spec.ts` | Admin Week Planner: edit draft block → publish | `setup-schedule-builder-scenario` (`linkSupabaseAuth`) |
| [`e2e/parent-weekly-schedule.spec.ts`](../e2e/parent-weekly-schedule.spec.ts) | `npm run test:e2e -- e2e/parent-weekly-schedule.spec.ts` | Parent `/parent/weekly-schedule` enrolled-class sections + print root | `setup-schedule-builder-scenario` (`linkSupabaseAuth`) |
| [`e2e/parent-progress-scheduled-lessons.spec.ts`](../e2e/parent-progress-scheduled-lessons.spec.ts) | `npm run test:e2e -- e2e/parent-progress-scheduled-lessons.spec.ts` | Parent progress “Scheduled lessons” + completion pills | `setup-schedule-builder-scenario` (`linkSupabaseAuth`) |
| [`e2e/school-admin-academics-kpi.spec.ts`](../e2e/school-admin-academics-kpi.spec.ts) | `npm run test:e2e -- e2e/school-admin-academics-kpi.spec.ts` | Attendance → Lesson plans tab: completion % + attendance KPI | `setup-schedule-builder-scenario` (`linkSupabaseAuth`) |
| [`e2e/schedule-template-csv-import.spec.ts`](../e2e/schedule-template-csv-import.spec.ts) | `npm run test:e2e -- e2e/schedule-template-csv-import.spec.ts` | Weekly Templates: CSV map → preview → confirm import + block titles | `setup-schedule-builder-scenario` (`linkSupabaseAuth`) |
| [`e2e/educator-weekly-schedule-plans.spec.ts`](../e2e/educator-weekly-schedule-plans.spec.ts) | `npm run test:e2e -- e2e/educator-weekly-schedule-plans.spec.ts` | Educator Schedule: published plan overlay + detail sheet + print | `setup-schedule-builder-scenario` (`linkSupabaseAuth`) |

**Supabase:** Real project required (`isRealSupabaseConfigured()` or `supabaseLinked === true`).

### Postgres + Supabase + Stripe test keys

| Spec | Command | What it covers | Seed endpoint |
|------|---------|----------------|---------------|
| [`e2e/parent-payment-flow.spec.ts`](../e2e/parent-payment-flow.spec.ts) | `npm run test:e2e -- e2e/parent-payment-flow.spec.ts` | Pay in full, biweekly checkout, upcoming payment | `setup-cart-scenario`, `seed-upcoming-scheduled-payment` |
| [`e2e/checkout-volunteer-credits.spec.ts`](../e2e/checkout-volunteer-credits.spec.ts) | `npm run test:e2e -- e2e/checkout-volunteer-credits.spec.ts` | Credits reduce Stripe charge at checkout | `setup-cart-scenario` (`withCredits`) |
| [`e2e/checkout-payment-options-audit.spec.ts`](../e2e/checkout-payment-options-audit.spec.ts) | `npm run test:e2e -- e2e/checkout-payment-options-audit.spec.ts` | **Payment options audit:** pay-in-full, biweekly, Upcoming Pay Now, partial credits, credits unchecked (no auto-spend), credits-only confirm, class+membership | `setup-cart-scenario` (+ `withCredits` / `unpaidMembershipFeeCents` / `seed-upcoming-scheduled-payment`); Stripe + Supabase; runbook [checkout-payment-e2e-audit.md](./APP_KNOWLEDGE/runbooks/checkout-payment-e2e-audit.md) |
| [`e2e/checkout-membership-order-summary.spec.ts`](../e2e/checkout-membership-order-summary.spec.ts) | `npm run test:e2e:checkout-membership` | Membership lines + `__E2E_CART__` refresh | `setup-cart-scenario` (`membershipRequired`) |
| [`e2e/parent-full-journey.spec.ts`](../e2e/parent-full-journey.spec.ts) | `npm run test:e2e -- e2e/parent-full-journey.spec.ts` | Register → 2 sessions → biweekly → autopay #2 | `setup-registration-scenario` (`openSessionCount: 2`) + Stripe + test autopay APIs |

Stripe helpers: [`e2e/helpers/stripePlaywright.ts`](../e2e/helpers/stripePlaywright.ts). Use **test mode** keys from the same Stripe account.

### Authenticated (`chromium-authenticated`)

Requires `E2E_PARENT_EMAIL` / `E2E_PARENT_PASSWORD` (and real Supabase). Run via `npm run test:e2e:authenticated` or full `test:e2e` when env is set.

| Spec | Command | What it covers |
|------|---------|----------------|
| [`e2e/authenticated/dashboard.spec.ts`](../e2e/authenticated/dashboard.spec.ts) | `npm run test:e2e -- e2e/authenticated/dashboard.spec.ts` | Logged-in parent not sent to login |
| [`e2e/authenticated/parent-profile-routes.spec.ts`](../e2e/authenticated/parent-profile-routes.spec.ts) | `npm run test:e2e -- e2e/authenticated/parent-profile-routes.spec.ts` | Parent routes + critical GET APIs 2xx |
| [`e2e/authenticated/parent-progress-hub.spec.ts`](../e2e/authenticated/parent-progress-hub.spec.ts) | `npm run test:e2e -- e2e/authenticated/parent-progress-hub.spec.ts` | `/parent/progress` hub |
| [`e2e/authenticated/educator-progress-tab.spec.ts`](../e2e/authenticated/educator-progress-tab.spec.ts) | `npm run test:e2e -- e2e/authenticated/educator-progress-tab.spec.ts` | Educator progress tab (`E2E_EDUCATOR_EMAIL`) |

---

## Test seed API (`/api/test/*`)

Only when `NODE_ENV !== 'production'`. Header: `X-Test-Token: test-secret-token` (or `E2E_TEST_API_TOKEN`).

Wrappers: [`e2e/helpers/testSeed.ts`](../e2e/helpers/testSeed.ts).

| Endpoint | Used by |
|----------|---------|
| `POST /api/test/setup-public-form-scenario` | `public-custom-forms`, `form-editor-fields`, `form-submission-notify-spam`, `form-smart-builder` |
| `GET /api/test/email-log` | `form-submission-notify-spam` |
| `POST /api/test/setup-registration-scenario` | `school-code-registration`, `parent-full-journey` |
| `POST /api/test/setup-session-enrollment-scenario` | `session-enrollment-flow` |
| `POST /api/test/setup-cart-scenario` | Payment, credits, membership, profile credits, help issue submission |
| `POST /api/test/ensure-technical-support-schema` | `help-issue-submission.spec.ts` |
| `GET /api/test/technical-support-issue/:id` | `help-issue-submission.spec.ts` (persistence verify) |
| `POST /api/test/setup-credit-lookup-scenario` | `credit-management-parent-lookup` |
| `POST /api/test/setup-progress-scenario` | `quarterly-progress-report-wizard` |
| `POST /api/test/setup-schedule-builder-scenario` | `schedule-builder-publish`, `parent-weekly-schedule`, `parent-progress-scheduled-lessons`, `school-admin-academics-kpi`, `schedule-template-csv-import`, `educator-weekly-schedule-plans` |
| `POST /api/test/ensure-public-store-schema` | `public-store.spec.ts` |
| `POST /api/test/setup-public-store-scenario` | `public-store.spec.ts`, `public-store-share.spec.ts` |
| `POST /api/test/fulfill-store-checkout` | `public-store.spec.ts`, `public-store-share.spec.ts` (simulates Stripe webhook after guest checkout) |
| `POST /api/test/seed-upcoming-scheduled-payment` | `parent-payment-flow` (installment test) |

Implementation: [`server/api/test.ts`](../server/api/test.ts). Helpers: [`server/tests/helpers/`](../server/tests/helpers/).

---

## Related docs

| Doc | Topic |
|-----|--------|
| [`docs/APP_KNOWLEDGE/domains/ci-and-testing.md`](APP_KNOWLEDGE/domains/ci-and-testing.md) | CI workflows vs local Jest |
| [`server/tests/README.md`](../server/tests/README.md) | Integration tests + E2E cross-links |
| [`docs/E2E_PARENT_PROFILE.md`](E2E_PARENT_PROFILE.md) | Authenticated parent route matrix |
| [`docs/APP_KNOWLEDGE/runbooks/replit-e2e-playwright.md`](APP_KNOWLEDGE/runbooks/replit-e2e-playwright.md) | Replit limitations |
| [`.agents/skills/asa-testing-deployment/SKILL.md`](../.agents/skills/asa-testing-deployment/SKILL.md) | Agent conventions |

### Planned / doc-only

[`docs/F001_SESSION_ENROLLMENT_TESTS.md`](F001_SESSION_ENROLLMENT_TESTS.md) describes `e2e/f001-session-enrollment-wizard.spec.ts`; that file is **not** in the repo yet—use `session-enrollment-flow.spec.ts` for session E2E today.
