# Parent concierge architecture

Stack: Vite + React client, Express API (`server/index.ts` is the canonical process), Drizzle schema in `shared/schema.ts`, PostgreSQL. Not Next.js.

## Live auth

Three mechanisms exist in the repo. One is live.

| Path | What the code does | Live? |
|------|--------------------|-------|
| **Supabase Auth** | `SupabaseProvider` wraps `App.tsx`. Login uses `supabase.auth.signInWithPassword` and Google OAuth. API calls send `Authorization: Bearer` via `apiRequest`. | **Yes.** This is the parent session. |
| **`supabaseAuth`** (`server/middleware/supabase-auth.ts`) | Validates the bearer token with Supabase, loads `users` by email, sets `req.user.id` to the integer primary key. | **Yes.** `server/routes.ts` assigns `jwtCheck = supabaseAuth`. |
| **`jwtCheck` in `server/middleware/auth0-auth.ts`** | Despite the filename and the `verifyAuth0Token` alias, it calls `supabase.auth.getUser`. `UserSyncService.syncAuth0User` writes the Supabase user into `users`. | **Yes, as a second Supabase checker** on some routers (`server/api/children.ts`, `server/api/ai-pricing.ts`). It does not validate Auth0 tokens. |
| **Auth0 SDK** | `@auth0/auth0-react` is a dependency. `client/src/components/Auth0Provider.tsx` is not mounted. `/auth0-login` renders `DirectAuth0Login`, which calls `useAuth0()` with no provider in the tree. `users.auth0_id` remains a legacy column. | **No.** |
| **Passport** | `passport` and `passport-local` are in `package.json`. No application file imports them. | **No.** |
| **express-session** | `configureSession` runs in test apps only (`server/simple-test-app.ts`, `server/test-app.ts`). `server/index.ts` does not install it. `supabaseAuth` still has a `session.userId` branch for those test apps. | **Not the production path.** |

Database role and `school_id` come from Postgres (`users`, `user_roles`), not from Supabase `user_metadata`. Concierge tools must use `req.user.id` (integer). The Supabase UUID is `req.user.sub` and is not a foreign key on `children`.

`hooks/useAuth0.ts` is a misnamed wrapper around `useSupabase()`. Older pages import it. New concierge UI should use `useAuth()` from `SupabaseProvider`, same as `ParentConciergePage` already does.

## Family, classes, events

There is no `parents` table.

```
users (parent: role / user_roles = parent)
  └─ children.parent_id
       ├─ program_enrollments.child_id  → classes.id (marketplace) or school_classes.id
       └─ school_students.child_id
events.school_id + optional location_id     calendar rows, no RSVP column
store_products.rsvp                         event product config
store_order_items.metadata.rsvp             headcount for that order
week_plans / week_plan_blocks               published materials for the week
```

A second guardian is `child_guardians.guardian_user_id`, not a second `parent_id`. Detail: [data-model.md](./data-model.md).

Parent calendar reads `GET /api/calendar-events/parent/events` (child campuses, not `users.school_id` alone). Week lessons read `GET /api/schedule-builder/parent/my-week-plans`. Both are already scoped in Express. The chat tools should call the same storage paths, not a second query layer that takes a parent id from the model.

## Where the chat runs

ADR-001 recommends an **Express route on this process**, not a separate Vercel deploy. The Vite page stays at `/parent/concierge` inside `ParentAppShell` and posts to that route with the existing bearer token.

The Vercel AI SDK (`ai`) and AI Gateway are HTTP clients. They do not require Next.js or hosting the UI on Vercel. Model calls leave the Express handler with `AI_GATEWAY_API_KEY`. Family queries stay in-process, behind `supabaseAuth`.

`server/api/parent-concierge.ts` is the wrong base to extend: it is unmounted, it talks to Anthropic directly, and its tools include payments, credits, cart, and `register_child`. The new route replaces that contract. See [guardrails.md](./guardrails.md).

## Analytics and leads

Chat turns and tool calls are product analytics, not the checkout funnel and not the engagement report that slices by child age and gender. `user_activity_events.event_type` only allows `login`, `page_view`, `session_start`, `session_end`, and `heartbeat` (`server/migrations/253-school-analytics-events.sql`). A later phase adds a separate table with an additive SQL file under `server/migrations/`. This phase does not.

Enrollment leads go to Corey through the existing SendGrid path in `server/lib/email-service.ts` (`SENDGRID_API_KEY`). The tool does not insert `program_enrollments`.

## Schema changes

Production changes are additive SQL files. Do not run `npm run db:push` or `drizzle-kit push` against a database that has real families. This phase adds no migration.
