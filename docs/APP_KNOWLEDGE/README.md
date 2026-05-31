# ASA app knowledge hub

**Purpose:** Single entry point for humans and agents working on the ASA Learning Platform (homeschool co-op monorepo). Detailed product specs remain in [`docs/PRODUCT_REQUIREMENTS_DOCUMENT.md`](../PRODUCT_REQUIREMENTS_DOCUMENT.md) and [`docs/SYSTEM_DOCUMENTATION.md`](../SYSTEM_DOCUMENTATION.md)—this hub indexes them and captures **operational truth** learned from the codebase and incidents.

## What this product is

Multi-tenant school management for co-ops and academies: registration, campuses/locations, enrollments, cart/checkout, memberships, credits, autopay, Stripe, Supabase auth, school-admin tooling, and parent-facing dashboards.

## Personas (short)

| Persona | Primary concerns |
|---------|------------------|
| **Parent** | School-code registration, children, cart/pay, locations, credits |
| **School admin** | Locations, staff, classes, enrollments, school context (`school_id`) |
| **Platform admin** | Cross-school ops, billing, errors, migrations |

## Non-negotiables

- **Production / shared dev DB:** additive SQL only (`server/migrations/*.sql`). **Never** `db:push` / `drizzle-kit push` on databases with real users.
- **School context:** Admin workflows must resolve school via `schools.admin_id`, not only `users.school_id` (misalignment caused registration/location bugs).
- **Postgres in tests:** Integration tests that claim production path must use real Postgres; mem/file `CombinedStorage` fallback invalidates results.
- **CI merge gate (Tests workflow):** schema verify → production-path → dev server smoke → client jsdom. Full `test:server` (700+ tests) is local / Payments CI, not the PR Tests job.

## Doc index

| Doc | Contents |
|-----|----------|
| [architecture.md](./architecture.md) | Stack, tenancy, storage, auth |
| [domains/registration-and-locations.md](./domains/registration-and-locations.md) | School code signup, locations, school_id |
| [domains/payments-and-billing.md](./domains/payments-and-billing.md) | Ledgers, credits, prod balance audit, correction email |
| [domains/ci-and-testing.md](./domains/ci-and-testing.md) | GitHub Actions, Playwright, agent knowledge maintenance |
| [domains/custom-forms-public-access.md](./domains/custom-forms-public-access.md) | Public Form Builder, mentor app, resume upload, E2E |
| [../E2E_COMMANDS.md](../E2E_COMMANDS.md) | Playwright: npm scripts, per-spec commands, seeds (**update catalog when adding `e2e/*.spec.ts`**) |
| [domains/student-progress-assessments.md](./domains/student-progress-assessments.md) | F-14 assessments, Lexile, progress tracking audit |
| [runbooks/merge-replit-prod.md](./runbooks/merge-replit-prod.md) | Merge → Replit → prod SQL |
| [runbooks/public-mentor-application-form.md](./runbooks/public-mentor-application-form.md) | Mentor form: seed, clone/provision, public URL |
| [CHANGELOG.md](./CHANGELOG.md) | Knowledge updates by date |

### Existing project docs (authoritative for depth)

- [PRODUCT_REQUIREMENTS_DOCUMENT.md](../PRODUCT_REQUIREMENTS_DOCUMENT.md) — PRD
- [GIT_WORKFLOW.md](../GIT_WORKFLOW.md) — branching, worktrees
- [AUTOPAY_PRODUCTION_CHECKLIST.md](../AUTOPAY_PRODUCTION_CHECKLIST.md) — autopay go-live
- [F001_PHASE1_STATUS.md](../F001_PHASE1_STATUS.md) — session / F001 schema
- [server/tests/README.md](../../server/tests/README.md) — test layout, payment-flow harness

### Agent skills (`.agents/skills/`)

Use the matching skill when editing that area; update the skill if you change conventions.

| Skill | Domain |
|-------|--------|
| `asa-app-knowledge` | This hub + maintenance protocol |
| `asa-auth-patterns` | Auth, API, tenancy |
| `asa-enrollment-classes` | Enrollments, classes |
| `asa-payment-patterns` | Stripe, billing, cart |
| `asa-credit-system` | Credits, FIFO, holds |
| `asa-database-patterns` | Schema, storage |
| `asa-testing-deployment` | CI, Replit, workflows |
| `asa-frontend-conventions` | React, TanStack Query |
| `asa-skill-standards` | How to write/update skills |

## Agent onboarding (every session)

1. Read this README.
2. Read [architecture.md](./architecture.md) if touching server, DB, or auth.
3. Read the relevant **domain** doc and **asa-* skill**.
4. Do the task.
5. Update domain doc / skill / [CHANGELOG.md](./CHANGELOG.md) if you learned something durable (**files are the source of truth**).
6. End with a **Knowledge update** footer (learned / updated / gaps) — a summary only; it does not replace step 5. See [ci-and-testing.md](./domains/ci-and-testing.md#agent-knowledge-maintenance).

## Personal skill (all projects)

Cross-repo protocol: `~/.cursor/skills/maintain-app-knowledge/SKILL.md` (maintain hub + CHANGELOG when `docs/APP_KNOWLEDGE/` exists).
