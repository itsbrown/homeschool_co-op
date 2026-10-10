# Parent concierge data model

Source of truth for columns: `shared/schema.ts` and `server/migrations/`. Live rows are the app's Postgres on Replit (`DATABASE_URL`). Whether that database is Replit-managed or Neon is still unconfirmed. `docs/DATA_MODELS.md` is an older overview (it describes Neon as the host, and columns `users` does not have). Use this page for concierge work. Supabase `moivwjuglwwfrhqeewju` is Auth only. ASA Platform Prod and ASA Platform 2026 hold no live data.

There is **no `parents` table** and **no `event_rsvps` table**.

## Parents

A parent is a `users` row.

| Column | Role |
|--------|------|
| `id` | Integer primary key. This is what routes store as `req.user.id` / `authData.dbUserId`. |
| `supabase_id` | Supabase Auth user id. Unique. Not used as a child foreign key. |
| `auth0_id` | Legacy unique column. Live login does not write the session from Auth0. |
| `email`, `username`, `name`, `first_name`, `last_name`, `phone` | Contact. Email is how `supabaseAuth` finds the row. |
| `role` | Legacy single role (`role` enum, default `student`). |
| `school_id`, `location_id` | Home school and campus. Admin school resolution still prefers `schools.admin_id` when `users.school_id` is wrong. Parent event scope uses children's campuses. |
| `is_active` | `false` blocks sign-in (`403` Account is inactive). |
| `stripe_customer_id`, `stripe_default_payment_method_id`, `auto_pay_enabled` | Billing. Concierge tools do not read or write these. |
| `member_id` | Membership id string. |
| `calendar_feed_token` | Secret for the family ICS URL. Do not put it in a prompt. |

`user_roles` (`user_id`, `role` text, `school_id`, `is_primary`) is the role list. A person can be `parent` and a staff title at the same school. `users.role` is only the fallback.

`password` is still `NOT NULL` on `users`. Supabase holds the real credential. The mask script replaces the column with a non-login sentinel.

## Children

`children` is the student record the parent manages.

| Column | Role |
|--------|------|
| `parent_id` | `users.id`. Required. |
| `parent_email` | Denormalized. |
| `first_name`, `last_name` | Required. |
| `birthdate` | `date`, required. There is no stored age. Age bands in analytics are computed (`prek_k`, `grades_1_3`, `grades_4_8`, `grades_9_12`, `adult`). |
| `grade_level` | Required display label (`1st Grade`), not the class slug (`1st-grade`). |
| `school_id`, `location_id` | Campus. |
| `allergies`, `medical_info`, `special_needs`, `gender`, Lexile / math fields | Sensitive. Phase 1 tools do not select them. The mask drops them. |

`child_guardians` links another `users.id` to a child (`guardian_user_id`, `relationship`, `is_primary`). `get_my_family` includes those children.

`school_students` is the school affiliation (`child_id`, `grade`, `status`). It is not the class roster the admin class screen uses.

`emergency_contacts.user_id` points at the parent user, not the child. `children.emergency_contact` is a legacy text field.

## Classes and rosters

Two class tables still exist:

| Table | Used for |
|-------|----------|
| `classes` | Unified marketplace + school-admin classes. `schedule` jsonb (`variants[]` with days and times). `grade_levels` text[]. `price` in cents. `session_id` for the term. |
| `school_classes` | Older school-managed classes. `schedule` jsonb. `school_class_enrollments.student_id` → `school_students.id`. |

Current roster for school-admin class UI and for parent week plans is `program_enrollments`:

| Column | Role |
|--------|------|
| `child_id` | `children.id` |
| `parent_id`, `parent_email`, `child_name`, `class_name` | Denormalized. A mask must rewrite the names and emails or the copy leaks. |
| `class_id` | `school_classes.id` when `class_type = school_class` |
| `marketplace_class_id` | `classes.id` when `class_type = marketplace` |
| `status` | `enrolled`, `waitlist`, and the other enrollment states |
| `session_id`, `day_type`, `variant_id`, `location_id` | Term, half/full day, schedule variant, campus |
| `effective_balance` | Generated. Do not insert it. Concierge tools do not read it. |
| Stripe columns | Out of scope for concierge tools. The mask nulls them by omitting them. |

Week materials:

```
weekly_skeletons / skeleton_blocks     weekly template
week_plans / week_plan_blocks          one week of lessons
curriculum_assets                      indexed Drive docs
```

Parent read path: published blocks for classes resolved by `marketplace_class_id ?? class_id`. Session-only enrollments with both ids null do not match a skeleton. Block fields the chat can quote: `title`, `description`, `objectives`, `materials`, `homework`, `lesson_link`.

## Events and RSVP

**Calendar events** (`events`): `title`, `start_date`, `end_date`, `location` text, `event_type` (`class`, `meeting`, `workshop`, `camp`, `holiday`, `deadline`, `special`, `other`), `school_id`, optional `location_id`, `organizer_id`. No RSVP columns. Parent visibility is `GET /api/calendar-events/parent/events`.

**Store event RSVP** is the RSVP that exists today:

| Piece | Where |
|-------|--------|
| Config (date, place, attendee prices, meal flags, caps) | `store_products.rsvp` jsonb when `product_kind = 'event'`. Shape: `shared/store-event-rsvp.ts`. Migration `server/migrations/266-store-event-products.sql`. |
| The parent's answer (adult / children / guest counts, meals) | `store_order_items.metadata.rsvp` |
| Who RSVP'd | `store_orders.parent_id` / `parent_email` |

A $0 event can be recorded without Stripe. A priced attendee type goes through store checkout and Stripe. `rsvp_event` in ADR-001 may record only the $0 case. Anything that would charge is a handoff.

## What concierge code must not treat as the family graph

- `users.auth0_id` or the Supabase UUID as `parent_id`
- `school_class_enrollments` as the only roster
- `checkout_funnel_events` or `user_activity_events` as the chat log
- `marketing_links` / `link_analytics` as a place to store child attributes

## Concierge analytics

`concierge_events` (`server/migrations/268-concierge-events.sql`, also `shared/schema.ts`):

| Column | Role |
|--------|------|
| `school_id`, `user_id` | Nullable. Anonymous turns leave `user_id` null. |
| `event_type` | `concierge_turn` or `concierge_tool` |
| `tool_name`, `ok`, `latency_ms` | Tool rows. Turn rows leave `tool_name` null. |
| `metadata` | jsonb. Allowed keys in practice: `anonymous`, `handoff`, `handoffCode`, `messageChars`, `mode`, `toolCount`. Sanitizer drops profile-like keys and long strings. |

`rsvp_event` writes a $0 `store_orders` row (`status` paid, `total_cents` 0, no Stripe ids) and `store_order_items.metadata.rsvp`. It does not call `fulfillStoreCheckoutWithoutPayment`. If any enabled attendee `priceCents` is above 0, the tool hands off and writes no order.
