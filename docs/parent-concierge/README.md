# Parent concierge (Phase 1)

Phase 0 recorded the design. Phase 1 ships the chat on this branch. It is not merged and not deployed.

The public page is `/concierge`. Signed-in parents also reach the same page at `/parent/concierge` inside `ParentAppShell`. The Express route is `POST /api/concierge/chat`.

The running app is **Vite + React + Express + Drizzle** on PostgreSQL. It is not a Next.js app. See [architecture.md](./architecture.md) and [ADR-001.md](./ADR-001.md).

| Doc | What it decides |
|-----|-----------------|
| [architecture.md](./architecture.md) | Live auth, where family data lives, how the chat should attach |
| [ADR-001.md](./ADR-001.md) | Chat page, Vercel AI SDK + AI Gateway, tools, SendGrid leads, analytics |
| [data-model.md](./data-model.md) | Parents, children, classes, events/RSVP as they exist in `shared/schema.ts` |
| [data-flows.md](./data-flows.md) | Where live data and Auth sit, and how they move |
| [masking.md](./masking.md) | One-way prod → dev mask. Source is production `DATABASE_URL`, read-only |
| [guardrails.md](./guardrails.md) | Own family only, no Stripe, human handoff, no marketing profiles of children |
| [preview.md](./preview.md) | Vercel preview settings, `PREVIEW_DEMO_MODE`, in-memory fake families |
| [CHANGELOG.md](./CHANGELOG.md) | Dated notes for this folder |

Operational hub: [../APP_KNOWLEDGE/README.md](../APP_KNOWLEDGE/README.md).

## What is live in production

- Parents sign in with **Supabase Auth** on project `moivwjuglwwfrhqeewju`. That project is Auth only and must never be paused. **ASA Platform Prod** and **ASA Platform 2026** are old Supabase projects and hold no live data. App rows live in the app's Postgres on Replit (`DATABASE_URL`); whether that database is Replit-managed or Neon is still unconfirmed. `users.auth0_id` and the Auth0 React package are leftovers. Passport is installed and unused. Detail: [architecture.md](./architecture.md), [data-flows.md](./data-flows.md).
- There is no `parents` table. A parent is a `users` row. Children are `children` rows with `parent_id`.
- The chat below is on this branch only. Production does not have `POST /api/concierge/chat` until this PR is merged and the migration is applied.

## What this branch adds

- `/concierge` and `/parent/concierge` render the chat-first `ParentConciergePage`. Anonymous visitors get enrollment answers from `server/services/concierge/enrollment-corpus.ts` (home page, registration screen, and the ADR lead sentence). Signed-in parents can call `get_my_family`, `get_week_materials`, and `rsvp_event`, scoped to `users.id` and `children.parent_id` / `child_guardians.guardian_user_id`.
- `POST /api/concierge/chat` is mounted from `server/index.ts`. The model path is the Vercel AI SDK through AI Gateway (`AI_GATEWAY_API_KEY`, optional `AI_GATEWAY_MODEL`). `CONCIERGE_AI_MOCK=1` answers without calling the gateway (tests and local screenshots).
- `start_enrollment_inquiry` emails Corey via `sendConciergeLeadEmail` (SendGrid only). Recipient `CONCIERGE_LEAD_EMAIL`. If SendGrid is missing, the tool fails and does not fall through to Brevo.
- Chat turns and tool calls insert `concierge_events` (`server/migrations/268-concierge-events.sql`). Apply it as SQL only, after PR #150's `267-platform-schools.sql`. Never `db:push` or `drizzle-kit push`.
- `server/api/parent-concierge.ts` stays **unmounted**. It still calls Anthropic and still has payment, credit, and cart tools. Do not mount it.

## Local fake data

`scripts/seed-concierge-local.ts` writes fake families (first names, age bands, classes, store events, week-plan blocks) only when `CONCIERGE_LOCAL_DATABASE_URL` is local Postgres whose database name contains `local` or `test`. It refuses production, Supabase, Neon, Railway, and Replit hosts. It applies migration 268 with SQL. It does not call `db:push`. Tests use `@example.invalid` addresses. No real families.

## Vercel preview

The preview is a separate Vercel project. It does not use the Replit `build` or `start` scripts and does not need a database. Settings, env names, and the demo-mode guard are in [preview.md](./preview.md).

Required preview env: `PREVIEW_DEMO_MODE=1`. Vercel sets `VERCEL=1`. The build command sets `VITE_PREVIEW_DEMO_MODE=1`. Optional: `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`, `CONCIERGE_LEAD_EMAIL`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`. Do not require `VERCEL_ENV=preview`: this project serves the demo on its production alias. Do not set a production `DATABASE_URL` or Supabase keys for this preview. Do not set `PREVIEW_DEMO_MODE` on the Replit production VM. The guard also refuses `REPLIT_DEPLOYMENT` and any `REPL_ID`-style variable.

## What this phase does not do

- No `db:push`, no new Supabase project, no pause of live Auth.
- No merge and no deploy.
- The mask script is not run against a database.
- No payment, Stripe, or cart tools. Sensitive requests hand off before the model is called.
