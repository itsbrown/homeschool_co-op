# Parent concierge changelog

## 2026-10-11 (mask read and write guards)

- Source reads are accepted only for a read-only transaction (`default_transaction_read_only=on`) or a read-only role (`reader`, `readonly`, `read_only`).
- Writes are accepted only for a local or dev target. The database name must include `dev`, `mask`, `scratch`, `local`, or `test`. Neon, Supabase, and Replit hosts are refused, as are prod-looking and source-equal targets.
- Test fixtures in `scripts/lib/prod-to-dev-mask.test.mjs` are synthetic. The script was not run against a database.

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
