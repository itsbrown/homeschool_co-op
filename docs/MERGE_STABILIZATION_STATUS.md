# Merge and CI status (canonical `main`)

Last verified: workspace aligned with `origin/main` (same SHA).

## Merge

The large `origin/main` vs Replit-line merge is **integrated on GitHub** (e.g. merge via PR). Local clone should use:

```bash
git fetch origin && git checkout main && git reset --hard origin/main
```

when a clean mirror is required.

## Checks

| Command | Result |
|---------|--------|
| `git push origin main` | No-op when `HEAD` equals `origin/main` |
| `npm run test:payments` | **Pass** (16 suites, 78 tests in current run) |
| `npm run check` (full `tsc`) | **Fails** — many errors in `server/tests/**` and some server files (pre-existing / incremental strictness). Use `npm run check:payments` for payment-scoped TS when available, or GitHub Actions on `main` as the gate. |

## Next engineering steps

1. Replit: follow [REPLIT_SYNC_CHECKLIST.md](../REPLIT_SYNC_CHECKLIST.md) before publish.
2. Task board: [TASK_BOARD_HYGIENE.md](../TASK_BOARD_HYGIENE.md) (#242 vs #249).
3. Production balance alerts: [audit/BALANCE_TRIAGE_PRODUCTION.md](audit/BALANCE_TRIAGE_PRODUCTION.md).
