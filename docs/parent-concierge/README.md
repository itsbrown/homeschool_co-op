# Parent concierge (Phase 0)

Phase 0 is the design record for a chat-first parent page. It does not ship the chat, mount a new route, or change the database.

The running app is **Vite + React + Express + Drizzle** on PostgreSQL. It is not a Next.js app. See [architecture.md](./architecture.md) and [ADR-001.md](./ADR-001.md).

| Doc | What it decides |
|-----|-----------------|
| [architecture.md](./architecture.md) | Live auth, where family data lives, how the chat should attach |
| [ADR-001.md](./ADR-001.md) | Chat page, Vercel AI SDK + AI Gateway, tools, SendGrid leads, analytics |
| [data-model.md](./data-model.md) | Parents, children, classes, events/RSVP as they exist in `shared/schema.ts` |
| [data-flows.md](./data-flows.md) | Where live data and Auth sit, and how they move |
| [masking.md](./masking.md) | One-way prod → dev mask. Source is production `DATABASE_URL`, read-only |
| [guardrails.md](./guardrails.md) | Own family only, no Stripe, human handoff, no marketing profiles of children |
| [CHANGELOG.md](./CHANGELOG.md) | Dated notes for this folder |

Operational hub: [../APP_KNOWLEDGE/README.md](../APP_KNOWLEDGE/README.md).

## What is live today

- Parents sign in with **Supabase Auth** on project `moivwjuglwwfrhqeewju`. That project is Auth only and must never be paused. **ASA Platform Prod** and **ASA Platform 2026** are old Supabase projects and hold no live data. App rows live in the app's Postgres on Replit (`DATABASE_URL`); whether that database is Replit-managed or Neon is still unconfirmed. `users.auth0_id` and the Auth0 React package are leftovers. Passport is installed and unused. Detail: [architecture.md](./architecture.md), [data-flows.md](./data-flows.md).
- There is no `parents` table. A parent is a `users` row. Children are `children` rows with `parent_id`.
- `/parent/concierge` renders `ParentConciergePage`. `server/api/parent-concierge.ts` is **not mounted** in `server/index.ts`, so `/api/parent-concierge/*` is not a live API. That file also calls Anthropic directly and exposes payment, credit, and cart tools. Those tools are out of scope for the design in ADR-001.

## What this phase does not do

- No schema push, no `db:push`, no new Supabase project.
- No merge and no deploy.
- The mask script is not run against a database in this phase.
