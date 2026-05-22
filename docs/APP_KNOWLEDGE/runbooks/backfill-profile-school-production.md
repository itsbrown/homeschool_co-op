# Runbook: profile + school scope backfill (Replit / production)

Use after deploying fixes for:

- Registration `first_name` / `last_name`
- User search / credit parent lookup school scope
- Parent profile admin school scope (`getAdminPermittedSchoolAccess`)

## Deploy code first

1. Merge to `main` and push.
2. **Replit dev:** `git fetch origin && git reset --hard origin/main` (if no local Repl commits to keep), then **Stop → Run**.
3. **Production:** same pull + restart on your host; do **not** run `db:push` on shared DBs.

Schema changes are **not** required for this work — only data backfill if legacy rows are misaligned.

## When to backfill

| Symptom | Backfill needed? |
|--------|------------------|
| Settings first/last name empty but `name` filled | Optional — profile API now parses `name`; backfill persists columns |
| Admin sees parent on **Users** but **Access Denied** on profile / credits | **Yes** — align admin + parent `school_id` and `user_roles` |
| Parent `school_id` wrong vs enrollments/children | **Yes** — sections 3–5 in SQL script |

If everything works after deploy, backfill is optional hygiene.

## Run the backfill (Postgres)

Script: [`server/scripts/backfill-profile-and-school-scope.sql`](../../../server/scripts/backfill-profile-and-school-scope.sql)

```bash
# Replit / prod — use your DATABASE_URL
psql "$DATABASE_URL" -f server/scripts/backfill-profile-and-school-scope.sql
```

Or paste sections in Supabase SQL editor inside a transaction.

### Before you run

1. **Backup** or ensure you can restore (snapshot / pg_dump).
2. Run **preview** `SELECT` versions of each `UPDATE` with `ROLLBACK` first if unsure.
3. Replace spot-check emails at the bottom of the script with real accounts.

### What each section does

1. **`name` → `first_name` / `last_name`** — Settings and exports.
2. **School admins** — `users.school_id` and primary `user_roles.school_id` → `schools.admin_id` school.
3. **Parents** — `users.school_id` from latest `membership_enrollments`.
4. **Parents** — `users.school_id` from `children.parent_email` when still null.
5. **Children** — `children.school_id` from parent when null.
6. **Parent `user_roles`** — `school_id` aligned with parent user row.

All statements are idempotent-ish (only update mismatched/null fields).

## After backfill

- [ ] School admin: open **Users** → click parent → profile loads (no Access Denied).
- [ ] **Credits → Add Manual Credit** — search finds parent by name/email.
- [ ] Parent **Settings** — first/last name visible (or save once).
- [ ] Registration smoke test for a **new** parent (names stored on create).

## Production checklist (no schema push)

| Step | Action |
|------|--------|
| 1 | Deploy app from `main` |
| 2 | Restart app process |
| 3 | `node scripts/post-merge-replit-check.mjs` — only run additive SQL if verify fails |
| 4 | Run profile/school backfill script if legacy misalignment |
| 5 | Smoke tests above |

## Do not

- Run `drizzle-kit push` / `db:push` on production with real users.
- Assume `git pull` restarts the app — always **Stop → Run** (or your host equivalent).
