# Parent concierge changelog

## 2026-10-11 (mask read and write guards)

- Source reads are accepted only for a read-only transaction (`default_transaction_read_only=on`) or a read-only role (`reader`, `readonly`, `read_only`).
- Writes are accepted only for a local or dev target. The database name must include `dev`, `mask`, `scratch`, `local`, or `test`. Neon, Supabase, and Replit hosts are refused, as are prod-looking and source-equal targets.
- Test fixtures in `scripts/lib/prod-to-dev-mask.test.mjs` are synthetic. The script was not run against a database.

## 2026-10-11 (Review: demo guard, school scope)

- Demo mode starts only when `PREVIEW_DEMO_MODE` is set and `VERCEL=1`. It refuses `REPLIT_DEPLOYMENT`, any `REPL_ID`-style variable, and a production-looking `DATABASE_URL`. It does not require `VERCEL_ENV=preview`, because `asa-concierge-preview` uses its Vercel production alias.
- `get_my_family`, `get_week_materials`, and `rsvp_event` use the session user and that user's school. A `childId` outside that family is refused before the tool returns data. An event is loaded only when `store_products.school_id` is the parent's school.
- An unauthenticated `POST /api/concierge/chat` (the public `/concierge` page) answers from the enrollment corpus. Family tool text does not query family, week, or RSVP data.
- `268-concierge-events.sql` stays numbered after #150's `267-platform-schools.sql`. Apply it as a SQL migration only. Never `db:push`.

## 2026-10-10 (Vercel preview)

- `vercel.json` builds the Vite client to `dist/public` and leaves `package.json` `build` / `start` for Replit.
- `api/index.ts` wraps `server/preview/express-app.ts`. That app does not import `server/index.ts` or Supabase.
- `PREVIEW_DEMO_MODE` uses in-memory fake families. Demo sign-in replaces Supabase. Leads are logged unless `CONCIERGE_LEAD_EMAIL` and `SENDGRID_API_KEY` are both set. Analytics stay in memory.
- The guard refuses demo mode when `NODE_ENV=production` on Replit, or when `DATABASE_URL` looks like production. See [preview.md](./preview.md).

## 2026-10-10 (Phase 1)

- Chat page: `/concierge` (anonymous) and `/parent/concierge` (signed-in shell). `POST /api/concierge/chat` uses the Vercel AI SDK and AI Gateway. `CONCIERGE_AI_MOCK=1` skips the gateway.
- Tools: `get_my_family`, `get_week_materials`, `rsvp_event`, `start_enrollment_inquiry`. Actor is `req.user.id` only. Anonymous callers get the enrollment corpus and the inquiry tool.
- Leads: `sendConciergeLeadEmail` calls SendGrid only. Missing `SENDGRID_API_KEY` or `CONCIERGE_LEAD_EMAIL` fails visibly. No Brevo fallback. No `program_enrollments` write.
- Analytics: additive `server/migrations/268-concierge-events.sql` (`concierge_turn`, `concierge_tool`). Not `user_activity_events`. Metadata sanitizer drops profile keys and long strings. Number 267 left for the unmerged school-setup migration.
- `rsvp_event` records a $0 store order (`metadata.rsvp`) and hands off when any enabled attendee price is above 0. It does not call Stripe or `fulfillStoreCheckoutWithoutPayment`.
- Local seed: `scripts/seed-concierge-local.ts` plus `CONCIERGE_LOCAL_DATABASE_URL`. Fake `@example.invalid` families only. Refuses non-local hosts. Does not `db:push`.
- `server/api/parent-concierge.ts` stays unmounted.
- Tests: `server/tests/concierge-guardrails.test.ts` and `server/tests/integration/concierge-phase1.integration.test.ts` against local Postgres. No Playwright spec.

## 2026-10-09 (data stores)

- Added [data-flows.md](./data-flows.md) and linked it from the README.
- Live app data is the Postgres behind the Replit app (`DATABASE_URL`). Replit-managed vs Neon is still unconfirmed.
- Supabase `moivwjuglwwfrhqeewju` is live Auth only and must never be paused. ASA Platform Prod and ASA Platform 2026 are old and hold no live data.
- The mask source is that production `DATABASE_URL`, opened read-only, ideally with a read-only role. Docs only. The script was not changed and was not run.

## 2026-10-09

Phase 0. Docs only, plus the prod → dev mask script and its unit tests.

- Live auth is Supabase (`SupabaseProvider` + `supabaseAuth`). `auth0-auth.ts` also checks Supabase tokens. Auth0 React is not mounted. Passport is unused.
- Parents are `users`. Children are `children`. RSVP that exists today is the store event (`store_products.rsvp`), not a column on `events`.
- ADR-001: chat on the existing Vite page, Vercel AI SDK + AI Gateway from an Express route. Tools `get_my_family`, `get_week_materials`, `rsvp_event`, `start_enrollment_inquiry`. Leads to Corey via SendGrid. Turns and tool calls become analytics events in a later additive table, not `user_activity_events`.
- `server/api/parent-concierge.ts` is unmounted and out of scope (Anthropic, payments, cart).
- Mask script refuses a target that equals the source or looks like prod, and opens the source read-only. Not run against a database. No schema change and no `db:push`.
