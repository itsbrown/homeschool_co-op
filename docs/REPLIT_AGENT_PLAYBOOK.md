# Replit Agent Playbook — Engineering Contract

Non-negotiable rules for ANY agent (Replit task agent, main agent, human contributor) working on this repo. Read this before starting any task. Reviewers cite section numbers when blocking.

---

## 0. Task execution preamble (must follow on EVERY task)

Before writing any code on any task in this repo:

1. **Read `docs/REPLIT_AGENT_PLAYBOOK.md` and `docs/audit/README.md`** (if present). These are the contract. If you skip them you will be blocked at review.
2. **Confirm scope.** List the allowed files / areas you intend to touch (paste the list in your first response). If anything is unclear, ASK before coding — do not guess.
3. **If this task is audit-gated** (any payment or schema task per §3): plan the `docs/audit/<task>-<slug>-report.md` path FIRST. Collect raw evidence (command output, SQL results, webhook bodies, ISO-8601 timestamps, SHA pin) AS YOU GO. Do not retrofit evidence at the end — retrofitted evidence is invalid.
4. **Keep changes minimal.** No unrelated formatting, no drive-by refactors, no "while I was in there" edits. Every line of the diff must trace back to the task brief.
5. **If you discover a second bug class:** finish the current scope, then PROPOSE a new task for the discovery (per §2). Do not expand scope inline. Document the discovery in your task's "Out of scope" section.

This preamble is ALWAYS in force, even if a task brief omits it. The preamble overrides any task-level shortcut.

---

## 1. Source of truth

- **GitHub `main` is the only canonical source.** Replit pulls from GitHub before publish.
- **Never** treat a Replit-only commit as canonical unless it has been explicitly mirrored to GitHub `main`.
- If you discover a Replit commit that isn't on GitHub, stop work and surface the divergence before continuing.
- Production deployments build from the GitHub-mirrored SHA; if your evidence is pinned to a Replit-only SHA, your audit is invalid.

## 2. Scope discipline

- **One task = one concern.** If the task title says "tests only", you do NOT modify production code or operational scripts. File a follow-up task for anything you discover.
- If a code reviewer's feedback contradicts the task brief, **STOP**. Do not alternate between implementations across review cycles. Ask for a single written scope decision from the task owner and resume only after you have it in writing.
- Out-of-scope discoveries (schema bugs, broken tests, perf issues) become NEW tasks. Document them in your task's "Out of scope" section and propose them; do not silently fix.
- "While I was in there" edits are forbidden unless the task brief explicitly authorizes them.

## 3. Audit / proof artifacts (mandatory for payment + schema tasks)

- **All proof MUST live under `docs/audit/`.** Never rely on `.local/` for merge-surviving evidence — `.local/` paths are agent-private and have been lost on merge multiple times in this repo.
- **Standard report path:** `docs/audit/<task-number>-<short-slug>-report.md`
- **Optional bulky artifacts:** `docs/audit/<task-number>-evidence/` (raw JSON dumps, multi-file logs, schema dumps).
- **Must-pass close clause** (every payment/schema task report):
  - No closure without raw command output, raw SQL/query results, raw HTTP/webhook responses as applicable.
  - ISO-8601 timestamps required for any section involving replay or event ordering.
  - Code SHA pin at the top: `git rev-parse HEAD` + `git --no-optional-locks log -1 --format='%H %ci %s' HEAD`.
  - Dirty tree must be shown (`git --no-optional-locks status -s`) and cleaned before final evidence run.
  - Paraphrased summaries, "test passed" without captured output, or omitted evidence in any required section all block closure.
- See `docs/audit/README.md` for the full convention, header template, and backfill backlog.

## 4. Testing / CI realism

- **Prefer GitHub CI** for the full `npm run test:server` run when the suite is too long for the Replit shell budget (~110s).
- If Replit must prove tests:
  - **Sharded jest runs are allowed ONLY IF** you also paste `jest --listTests` output AND prove the shards partition the full set exactly — no omissions, no overlap.
  - All shards must run against the same git SHA. Different SHAs across shards = invalid evidence.
  - Pre-existing-broken tests must be cited with the commit SHA + task that introduced them, and must be flagged as out-of-scope follow-ups.
- Smoke / integration tests that touch live services (Stripe, Brevo, Twilio, Anthropic) must use test keys and be tagged so they can be excluded from the default CI run.

## 5. Payments / Stripe webhooks

- **Idempotency is enforced at the DB layer.** Add a UNIQUE constraint on `stripe_event_id` (or equivalent) — application-level "if exists" checks are race-prone and not sufficient on their own.
- **Persistence failure must NOT return 200.** Webhook handlers must return 5xx on any persistence error so Stripe retries. Swallowing errors via `try/catch` and returning 2xx is a correctness bug.
- **Every intentional skip path must emit a structured WARN log** including:
  - `event_id`, `event_type`, `skip_reason`, and the triggering metadata key/value.
  - Tagged with the originating task number (e.g. `[Task#222][Webhook][skip]`).
- A skip branch that exists in source but is neither logged nor explicitly marked `UNREACHABLE IN TEST` (with a follow-up task id) BLOCKS report closure.
- Refund-side handlers (`charge.refunded`, `refund.updated`, `refund.failed`) follow the same persistence-first + 5xx-on-failure rules as `payment_intent.succeeded`.

## 6. Schema / Drizzle

- **Verify DB vs `shared/schema.ts`** with `psql \d <table>` and/or drizzle-kit introspection logs in the audit report. Drift between schema source and live DB is a silent-data hazard.
- **DDL and data backfill are separate tasks** unless the task brief explicitly combines them. Adding a column ≠ populating it.
- **`db:push` friction gets its own task.** Do NOT paper over a broken `db:push` with manual one-off DB edits without documenting the workaround in the audit report and filing the follow-up.
- **Manual SQL migrations** (when `db:push` is broken) MUST be committed under `server/migrations/<task>-<slug>.sql` as idempotent files (`ADD COLUMN IF NOT EXISTS`, `pg_constraint`-guarded FKs) so dev/staging/prod can converge from the same artifact.
- Foreign keys must point at the table actually being written. Mismatched FKs (constraint on table A while writes target table B) are silent corruption — fix immediately, don't defer.

## 7. Dependency graph hygiene

- **Respect `dependsOn`.** Do not start a task whose dependencies haven't merged.
- **Do not parallelize** two tasks that both touch `shared/schema.ts` or the same migration surface — schema merge conflicts are not auto-resolvable and produce subtle data drift.
- Tasks that touch the SAME service file (`PaymentReallocationService.ts`, `webhook-handler.ts`, etc.) should serialize unless their edits are surgically isolated and explicitly documented in the brief.
- When wiring a new task into a chain: PROPOSED tasks cannot depend on other PROPOSED tasks. Wait for the predecessor to leave PROPOSED before wiring the successor.

## 8. Merge checklist (short)

Before requesting merge, the agent (and the reviewer) verify:

- [ ] **Diff scope:** every changed file is justified by the task brief. No unrelated edits.
- [ ] **Audit report present:** for payment/schema tasks, `docs/audit/<task>-<slug>-report.md` exists and satisfies Section 3.
- [ ] **Tests:** new behavior has regression coverage; pre-existing tests still pass (or pre-existing failures are cited per Section 4).
- [ ] **No unrelated files:** generated artifacts, scratch fixtures, and `.local/` debris are not committed.
- [ ] **Secrets:** no API keys, tokens, or `.env` values in the diff. Confirm via `git diff` review and ripgrep for known token prefixes.
- [ ] **Schema sync:** if `shared/schema.ts` changed, the corresponding migration is committed AND the dev DB has been converged.
- [ ] **Dependent tasks updated:** if this task surfaces follow-ups, they are filed and dependsOn-wired before merge.

---

## How to use this doc

Pin this file's path (`docs/REPLIT_AGENT_PLAYBOOK.md`) in your Replit project instructions / system prompt. Reviewers cite section numbers (e.g. "blocked on §3 — no SHA pin in report header") instead of restating the rule. New tasks reference this doc by URL or path in their brief; updates to the playbook itself follow the same audit-gated workflow as any payment/schema task. When in doubt, the playbook overrides task-level conventions.
