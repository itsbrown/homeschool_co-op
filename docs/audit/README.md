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

- [BALANCE_TRIAGE_PRODUCTION.md](BALANCE_TRIAGE_PRODUCTION.md) — production balance dashboard triage (orphans, cache, schedules).
