# Prod → dev masking

Script: `scripts/mask-prod-to-dev.mjs`
Rules (no I/O): `scripts/lib/prod-to-dev-mask.mjs`
Tests: `node --test scripts/lib/prod-to-dev-mask.test.mjs`

The script copies a fixed set of tables from production into a dev database. The source is the production `DATABASE_URL`: the app's Postgres on Replit (Replit-managed vs Neon is still unconfirmed). Pass that URL as `MASK_SOURCE_DATABASE_URL`. The script opens it **read-only**. Prefer a read-only database role on that URL so a session setting is not the only thing stopping a write. Writes go only to the target, and only after the target is shown not to be the source and not to look like production.

Phase 0 does not run the script. Do not point it at a real database to "try it."

## Command

```bash
# Validates the two URLs and exits. Opens nothing.
MASK_SOURCE_DATABASE_URL="postgresql://..." \
MASK_TARGET_DATABASE_URL="postgresql://.../asa_dev" \
node scripts/mask-prod-to-dev.mjs

# Copies. Still refuses a prod-looking target.
node scripts/mask-prod-to-dev.mjs --execute
```

The script reads `MASK_SOURCE_DATABASE_URL` and `MASK_TARGET_DATABASE_URL` only. It does not pick up the process `DATABASE_URL` by itself, so an app env pointed at prod cannot become the write target by accident. The value you put in `MASK_SOURCE_DATABASE_URL` is still that production `DATABASE_URL`, opened read-only, ideally with a read-only role. Supabase is not a data source for this copy. Project `moivwjuglwwfrhqeewju` is Auth only and must never be paused. ASA Platform Prod and ASA Platform 2026 hold no live data.

It does not run `db:push`, does not create tables, and does not create a Supabase project. The target must already have the schema (additive SQL applied on a dev database).

## Refusals

`assertSafeMaskTarget` throws `MaskRefused` and the process exits before any socket when:

| Code | Condition |
|------|-----------|
| `same_url` | The two URL strings are equal |
| `same_database` | Host, port, and database name match, even if the password differs |
| `target_looks_like_prod` | Target host or database name contains `prod` or `production` as a label. This wins over a dev-like database name, so `prod-db.internal/asa_dev` is still refused |
| `same_host` | Same server as the source, and the target database name does not contain `dev`, `mask`, `scratch`, `local`, or `test` |
| `production_process` | `NODE_ENV=production` |
| `missing_url` / `invalid_url` | Either URL is missing or not a postgres URL |

On `--execute`, after connect and before any target write:

- The source session must report `default_transaction_read_only = on`. The client is started with `-c default_transaction_read_only=on`.
- `current_database()` on each connection must match the database name in that URL.
- Source SQL is `select *` on the allowlist only. `assertSqlIsSelect` rejects insert, update, delete, truncate, and the rest.
- `TRUNCATE ... RESTART IDENTITY CASCADE` runs inside a transaction on the **target**. Cascade clears dev rows that point at the copied parents (including payment rows on that dev database). It is never issued on the source.

Logs print host, port, database name, and row counts. They do not print URLs, passwords, or row bodies.

## What is faked

| Data | Replacement |
|------|-------------|
| Parent and staff names | Stable fake first and last names from a fixed list |
| Emails | `user-{id}@masked.invalid`, `school-{id}@masked.invalid`, `campus-{id}@masked.invalid` |
| Phones | `555-010-####` |
| Street addresses | `### Masked Lane`. City and state stay so campuses still match the schedule. ZIP becomes `00000`. |
| School and campus phones, emails, manager name | Faked. Campus **name** stays. |
| `users.password` | `masked-no-login` (not a credential) |
| `auth0_id`, `supabase_id`, calendar feed token, Stripe customer and payment-method ids | Omitted. Autopay is forced off. |
| Child | Fake first name, last name `Student`, `grade_level` set to the age band (`prek_k`, `grades_1_3`, `grades_4_8`, `grades_9_12`, `adult`). `birthdate` is 1 January of a year that falls in that band, not the real birthday. |
| Child medical, allergy, gender, Lexile, math, notes, photo | Null |
| Enrollment `child_name` / `parent_email` | Rewritten to the masked values. Stripe ids and `effective_balance` omitted. `notes` and `metadata` cleared. |
| Class `instructor_name` | `Mentor {id}`. `meeting_url` and `location_address` cleared. |
| Store order parent name, email, checkout token, Stripe ids | Masked or cleared. |

## What stays realistic

- `program_enrollments` links (`child_id`, class ids, `status`, `variant_id`, `session_id`, `day_type`)
- `classes.schedule` / `school_classes.schedule`, titles, start and end times, grade lists on the **class**
- `events` title, type, start, end, and venue text
- `store_products.rsvp` config and `store_order_items.metadata` (headcount, not a parent's name)
- Week templates, week plans, and `curriculum_assets` (lesson titles, objectives, materials)

Not copied: payments, credits, `family_payment_plans` (`family_plan_id` is nulled), marketing links, password-reset tokens, staff invitation emails, analytics events. `program_enrollments.program_id`, class `curriculum_id`, and class `category_id` are nulled so the load does not depend on tables outside the allowlist.

## Residual risk

Event and class **descriptions** are copied as written. A description that names a child will still name them. Review a masked database before sharing it. The script replaces the structured identity columns; it does not redact free text inside lesson HTML.

`TRUNCATE ... CASCADE` on the target deletes dependent dev rows (payments, notifications) that reference the copied tables. Run it only against a dev database you can refill.
