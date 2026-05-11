# Autopay production readiness — parallel worktrees + merge order

This layout lets **multiple people or Cursor windows** work in parallel with **no working-tree collisions**. Git may still show **merge conflicts** if two branches edit the same lines; the **directory ownership** below keeps that rare.

**Paths (this clone):** under repo root, `homeschool_co-op/.worktree-autopay-scheduler`, `.worktree-autopay-tests`, `.worktree-autopay-client` (each is its own checkout; ignored by status via `.gitignore`).

## Copy-paste agent charters (one per Cursor window)

Open the matching folder, start a new agent chat, paste the block.

**Scheduler worktree** (`feat/autopay-prod-scheduler`)

```
You are on branch feat/autopay-prod-scheduler in the autopay scheduler worktree.
Goal: production-ready autopay driving (due dates → PaymentIntents → metadata aligned with server/webhook-handler.ts scheduled_payment).
Edit primarily under server/services/scheduled-payment-reminders.ts, server/services/autopay-reconciliation.ts, and related server/api charge paths.
Do not edit shared/schema.ts, server/storage.ts, or server/dbStorage.ts unless blocked—call that out for a follow-up merge.
Follow docs/AUTOPAY_PRODUCTION_CHECKLIST.md (sections 3–4 on jobs and data integrity) and this file’s merge order.
```

**Tests worktree** (`feat/autopay-prod-tests`)

```
You are on branch feat/autopay-prod-tests in the autopay tests worktree.
Goal: Jest/integration coverage for scheduled_payment webhooks, failures, credits/holds paths, and reconciliation invariants.
Edit under server/tests/ and jest config only unless a one-line export is required for testability.
Do not change production UI or broad refactors.
```

**Client worktree** (`feat/autopay-prod-client`)

```
You are on branch feat/autopay-prod-client in the autopay client worktree.
Goal: billing/payments UI wired to /api/credits and stable autopay parent flows; match existing design patterns.
Edit under client/src/ only for feature work.
Do not edit server/ storage or schema in this branch—coordinate if API gaps appear.
```

## Limitation (Cursor agents from one project)

Subagents launched inside a single chat that points at the **main** repo folder do not automatically run in another worktree. **Open each worktree as its own folder** (or run terminal `git -C .worktree-autopay-scheduler status`) so edits land on the correct branch.

## Worktrees (created from `feat/port-credits-autopay-c27d976` @ port commit)

| Directory | Branch | Owns (edit here first) | Avoid unless coordinating |
|-----------|--------|------------------------|----------------------------|
| `.worktree-autopay-scheduler/` | `feat/autopay-prod-scheduler` | `server/services/scheduled-payment-reminders.ts`, `server/services/autopay-reconciliation.ts`, autopay charge / PI creation under `server/api/` or `server/services/` that drives `scheduled_payment` metadata | `shared/schema.ts`, `server/storage.ts`, `server/dbStorage.ts` — coordinate or merge after scheduler |
| `.worktree-autopay-tests/` | `feat/autopay-prod-tests` | `server/tests/**`, `jest*.config.*` only if needed for new suites | Production feature code except tiny test hooks (prefer mocking) |
| `.worktree-autopay-client/` | `feat/autopay-prod-client` | `client/src/**` billing/payments/credits UI, client tests under `client/**/__tests__` | Server storage schema |

**Also on disk:** `remotes/origin/hardening/payments-autopay-production-readiness` — compare or cherry-pick if that branch already solved pieces you need.

## How to use with Cursor (recommended)

1. **Three Cursor windows** (or one at a time): **File → Open Folder** on each worktree path (full path to `.worktree-autopay-*`).
2. In each chat, paste the **Owns** column for that window so the agent does not drift into other tracks.
3. **Commit only inside that worktree**; push that branch only.

Using **one** Cursor project pointed at the main repo while an agent “pretends” to use another path is error-prone; prefer opening the worktree folder.

## Serialized merges (integration order)

Merge into the integration branch **`feat/port-credits-autopay-c27d976`** (or into `main` via stacked PRs — same idea):

1. **`feat/autopay-prod-scheduler`** first — behavior and APIs tests will assert against should exist.
2. **`feat/autopay-prod-tests`** second — expand coverage; small shared fixes only with agreement.
3. **`feat/autopay-prod-client`** last — UI depends on stable API and webhook behavior.

Commands (run from **main repo**, not inside a worktree, for clarity):

```bash
cd "/path/to/homeschool_co-op"
git checkout feat/port-credits-autopay-c27d976
git pull origin feat/port-credits-autopay-c27d976  # if collaborative

git merge --no-ff feat/autopay-prod-scheduler -m "merge: autopay scheduler production track"
# resolve conflicts; run tests

git merge --no-ff feat/autopay-prod-tests -m "merge: autopay/credits test track"
git merge --no-ff feat/autopay-prod-client -m "merge: billing/credits client track"
```

Alternatively open **three PRs** into the same base in that order and merge on GitHub.

## Cleanup when idle

```bash
cd "/path/to/homeschool_co-op"
git worktree remove .worktree-autopay-scheduler
git worktree remove .worktree-autopay-tests
git worktree remove .worktree-autopay-client
# optional: delete local branches after merge
git branch -d feat/autopay-prod-scheduler feat/autopay-prod-tests feat/autopay-prod-client
```

See [docs/GIT_WORKFLOW.md](../GIT_WORKFLOW.md) for worktree conventions (sibling dirs are fine too; this repo uses `.worktree-*/` per `.gitignore`).

## Production checklist pointer

After merges, run through [docs/AUTOPAY_PRODUCTION_CHECKLIST.md](../AUTOPAY_PRODUCTION_CHECKLIST.md) (Stripe, singleton `ENABLE_BACKGROUND_JOBS`, smoke tests).
