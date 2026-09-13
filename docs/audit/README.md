# Audit artifacts (`docs/audit/`)

Payment- and schema-sensitive work should leave **durable** evidence here (not only under `.local/`, which may not survive merges).

## Conventions

- **Report:** `docs/audit/<task>-<short-slug>-report.md`
- **Bulky evidence:** optional `docs/audit/<task>-evidence/` (JSON, SQL dumps, logs)
- **Reusable SQL:** [sql/](sql/) — production triage queries (B1–B5) aligned with `shared/schema.ts`

Each report should include:

- **Section 0:** `git rev-parse HEAD` and one-line `git log -1` (SHA pin).
- **Must-pass:** raw commands, raw SQL/results, raw HTTP/webhook bodies where applicable — no paraphrase-only closure.

## Related docs

- **Live daily Fall 2026 roster (use this):** [CSV on `docs/fall-2026-class-rosters`](https://github.com/itsbrown/homeschool_co-op/blob/docs/fall-2026-class-rosters/docs/audit/fall-2026-class-rosters.csv) + [counts summary](https://github.com/itsbrown/homeschool_co-op/blob/docs/fall-2026-class-rosters/docs/audit/fall-2026-class-rosters-summary.md). Workflow `.github/workflows/fall-2026-roster-snapshot.yml` overwrites that branch at 08:00 ET through 2026-09-21. **The copy on `main` lags** (branch protection blocks the bot) — do not count enrolled kids from `main`. Monday morning unique children = Macaronis + Yankee + Tycoons + Seekers + Pioneers (Lions is afternoon and does not add unique Monday kids). Local: `node scripts/with-prod-env.mjs -- npx tsx server/scripts/export-fall-2026-class-rosters.ts`.
- [fall-2026-class-rosters-transitions.csv](https://github.com/itsbrown/homeschool_co-op/blob/docs/fall-2026-class-rosters/docs/audit/fall-2026-class-rosters-transitions.csv) — append-only `pending_to_enrolled` / `pending_added` / `pending_removed` log (same snapshot branch).
- [BALANCE_TRIAGE_PRODUCTION.md](BALANCE_TRIAGE_PRODUCTION.md) — production balance dashboard triage (orphans, cache, schedules).
