---
name: asa-app-knowledge
description: >-
  ASA app knowledge hub, architecture map, domain runbooks, and agent maintenance
  protocol. Use when onboarding to the codebase, after fixing production bugs,
  changing CI or deploy, or when the user asks to update or read app knowledge.
---

# ASA app knowledge

## Core rules

- **Start at the hub:** `docs/APP_KNOWLEDGE/README.md` — index, non-negotiables, skill map.
- **Update knowledge in the same session** when you learn durable invariants, pitfalls, or CI/deploy truth.
- **Do not duplicate the PRD** — link to `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` for product depth.
- **Cross-repo habit:** personal skill `~/.cursor/skills/maintain-app-knowledge` defines the maintenance workflow for any project with `docs/APP_KNOWLEDGE/`.
- **Prod DB:** additive SQL only; never `db:push` on live data (see hub non-negotiables).

## Hub layout

| Path | Use |
|------|-----|
| `docs/APP_KNOWLEDGE/README.md` | Entry point |
| `docs/APP_KNOWLEDGE/architecture.md` | Stack, tenancy, storage |
| `docs/APP_KNOWLEDGE/domains/*.md` | Feature/ops deep dives |
| `docs/APP_KNOWLEDGE/runbooks/*.md` | Merge, Replit, prod SQL |
| `docs/APP_KNOWLEDGE/CHANGELOG.md` | Dated knowledge edits |

## When to update which domain doc

| You touched | Update |
|-------------|--------|
| Registration, locations, school_id | `domains/registration-and-locations.md` |
| CI, Jest, Playwright, workflows | `domains/ci-and-testing.md` + `asa-testing-deployment` + row in `docs/E2E_COMMANDS.md` for each new `e2e/*.spec.ts` |
| Payments, Stripe, cart, prod balance audit | `domains/payments-and-billing.md` + `asa-payment-patterns` |
| Credits | `asa-credit-system` |
| Auth, API tenancy | `asa-auth-patterns` |
| Form Builder, public forms, mentor app | `domains/custom-forms-public-access.md` |

## Maintenance workflow

1. Read hub + relevant domain doc and `asa-*` skill.
2. Complete the task.
3. Edit domain doc / skill if conventions changed.
4. **New Playwright spec:** add testing links in [`docs/E2E_COMMANDS.md`](../../docs/E2E_COMMANDS.md) (catalog row: file path, `npm run test:e2e -- e2e/…`, prerequisites, seed endpoint); cross-link from runbook/domain doc when applicable.
5. Add a bullet to `docs/APP_KNOWLEDGE/CHANGELOG.md` (date + summary).
6. End with **Knowledge update** (learned / updated / gaps).

## Common pitfalls

- **Skipping the hub** → re-discovering `school_id` vs `admin_id` and CI scope every session.
- **Writing essays in skills** → put narrative in `docs/APP_KNOWLEDGE/domains/`; keep skills actionable.
- **Stale CI docs** → Tests job scope changed to production-path + client; full `test:server` is not the PR gate.

## Best practices

### Do

- Link from hub to existing `docs/*.md` instead of copying.
- Record symptom → cause → fix in domain pitfall tables.
- Keep CHANGELOG entries short and dated.

### Don't

- Store secrets or connection strings in APP_KNOWLEDGE.
- Append contradictory CI instructions — update in place.
- Create parallel READMEs outside the hub without linking back.

## Key files

- `docs/APP_KNOWLEDGE/README.md` — hub
- `docs/APP_KNOWLEDGE/architecture.md` — system map
- `docs/APP_KNOWLEDGE/domains/registration-and-locations.md` — registration lane
- `docs/APP_KNOWLEDGE/domains/payments-and-billing.md` — ledgers, credits, prod corrections
- `docs/APP_KNOWLEDGE/domains/ci-and-testing.md` — CI gates
- `docs/APP_KNOWLEDGE/runbooks/merge-replit-prod.md` — ship checklist
- `.cursor/rules/app-knowledge.mdc` — always-on reminder in Cursor
- `~/.cursor/skills/maintain-app-knowledge/SKILL.md` — personal maintenance protocol
