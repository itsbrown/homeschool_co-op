# Parent concierge changelog

## 2026-10-09

Phase 0. Docs only, plus the prod → dev mask script and its unit tests.

- Live auth is Supabase (`SupabaseProvider` + `supabaseAuth`). `auth0-auth.ts` also checks Supabase tokens. Auth0 React is not mounted. Passport is unused.
- Parents are `users`. Children are `children`. RSVP that exists today is the store event (`store_products.rsvp`), not a column on `events`.
- ADR-001: chat on the existing Vite page, Vercel AI SDK + AI Gateway from an Express route. Tools `get_my_family`, `get_week_materials`, `rsvp_event`, `start_enrollment_inquiry`. Leads to Corey via SendGrid. Turns and tool calls become analytics events in a later additive table, not `user_activity_events`.
- `server/api/parent-concierge.ts` is unmounted and out of scope (Anthropic, payments, cart).
- Mask script refuses a target that equals the source or looks like prod, and opens the source read-only. Not run against a database. No schema change and no `db:push`.
