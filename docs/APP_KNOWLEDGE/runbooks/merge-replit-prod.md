# Runbook: merge → Replit → production SQL

Checklist after registration/locations (or any schema-touching) work.

## 1. Merge to `main`

- PR checks green: **Tests**, **Payments CI**, **E2E** (as applicable).
- Merge via GitHub; follow [GIT_WORKFLOW.md](../../GIT_WORKFLOW.md).

## 2. Replit dev

```bash
git fetch origin
git pull origin main
# Restart the Repl application (Stop → Run) — required even when pull says "Already up to date"
node scripts/post-merge-replit-check.mjs
```

### "Already up to date" but app feels old?

`git pull` only updates files. It does **not** restart Node.

| Step | Action |
|------|--------|
| 1 | `git fetch origin && git rev-parse HEAD && git rev-parse origin/main` — should match (main includes merge `27839229`, PR #16) |
| 2 | If SHAs differ: `git checkout main && git reset --hard origin/main` (only if no local work to keep) |
| 3 | **Stop → Run** workflow; `npm ci` if dependencies changed |
| 4 | `node scripts/post-merge-replit-check.mjs` — read-only schema check |

### Additive SQL on Replit dev?

**Only if** `post-merge-replit-check` (or verify scripts) fail, or you see Postgres `42703` / missing-table errors.

| Verify result | SQL needed? |
|---------------|-------------|
| Core + F001 pass | **No** — smoke-test registration/locations only |
| Core fail | [locations-schema-align.sql](../../server/migrations/locations-schema-align.sql) |
| F001 fail | [f001-phase1-schema.sql](../../server/migrations/f001-phase1-schema.sql) only if you use session/F001 features |

Both SQL files are idempotent (`IF NOT EXISTS`). **Never** `db:push` on shared/prod DBs.

**Smoke test**

- [ ] School-code registration (valid code → school + user)
- [ ] Public registration locations load before login
- [ ] School admin: Location Management — list/create campus on **registration school**
- [ ] Associate existing parent to school (no 500)
- [ ] Admin `users.school_id` misaligned still lists/creates locations on admin school

**Data fixes (if legacy misalignment)**

- Align admin `users.school_id` with `schools.admin_id` school when needed.
- Move stray locations off wrong `school_id`.
- Clean orphan Supabase users (auth without app `users` row) per support process.

## 3. Production database

**Do not** run `db:push` or `drizzle-kit push` on production.

Apply **additive** SQL only when columns/tables are missing:

| File | When |
|------|------|
| `server/migrations/locations-schema-align.sql` | Location table/column errors (42703) |
| `server/migrations/f001-phase1-schema.sql` | F001 session / `family_payment_plans` / enrollment columns |

Verify with read-only checks or `scripts/verify-f001-schema.mjs` against a **non-prod** mirror when possible.

## 4. Post-deploy

- [ ] Repeat smoke test on prod (registration + one location create)
- [ ] Monitor admin error notifications for 401/500 on `/api/locations` or register paths
- [ ] Note changes in [CHANGELOG.md](../CHANGELOG.md)

## Related

- [domains/registration-and-locations.md](../domains/registration-and-locations.md)
- [domains/ci-and-testing.md](../domains/ci-and-testing.md)
- [REPLIT_SYNC_CHECKLIST.md](../../REPLIT_SYNC_CHECKLIST.md)
