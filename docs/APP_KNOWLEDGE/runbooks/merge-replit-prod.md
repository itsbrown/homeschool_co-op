# Runbook: merge → Replit → production SQL

Checklist after registration/locations (or any schema-touching) work.

## 1. Merge to `main`

- PR checks green: **Tests**, **Payments CI**, **E2E** (as applicable).
- Merge via GitHub; follow [GIT_WORKFLOW.md](../../GIT_WORKFLOW.md).

## 2. Replit dev

```bash
git pull origin main
# Restart the Repl application (Stop → Run)
```

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
