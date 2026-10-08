# Git workflow

This project works best when **`main` matches `origin/main` and stays clean**, and all product work happens on **short-lived branches** that merge via pull request.

## Daily routine

1. **Start from current `main`:**
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Create a branch** for the task (one clear purpose per branch):
   ```bash
   git checkout -b fix/short-description
   # or: feature/..., chore/..., docs/...
   ```
3. **Commit in small steps** with messages that stand alone (what changed and why).
4. **Push and open a PR**; after GitHub merge:
   ```bash
   git checkout main
   git pull origin main
   git branch -d fix/short-description
   ```

## Rules that prevent friction

- **Do not accumulate uncommitted work on `main`.** If you need to park something for more than a few hours, put it on a branch (`wip/...`) with a WIP commit, or use stash briefly.
- **Do not do long-running work on a branch that is already merged** (e.g. old PR branch). After merge, switch back to `main`, pull, and delete the local branch.
- **Keep `git stash list` small.** Stash is for quick context switches, not archival storage.

## Local JSON under `data/`

`data/*.json` is gitignored. Those files held child birthdates, parent emails, and staff contact data. The API starts with an empty file store when a JSON file is missing (`server/file-storage.ts`). Do not `git add -f` them, and do not commit roster CSVs, backup JSON, or `db_push_output.txt`.

Local copies are fine for development. Keep them out of commits. If a branch switch needs to preserve a local file, stash it (`git stash push -u -m "local data"`).

## Parallel work: worktrees (recommended use)

**Use worktrees when** you need two real branches checked out at once (e.g. urgent hotfix while a feature branch is mid-flight). **Do not** use worktrees only because `main` is too dirty to checkout—clean or branch that work first.

**Prefer worktrees outside the repo directory** (simpler mental model, no extra noise in `git status`):

```bash
cd /path/to/homeschool_co-op
git fetch origin
git worktree add ../homeschool_co-op-hotfix main
git -C ../homeschool_co-op-hotfix pull origin main
# work in ../homeschool_co-op-hotfix
```

When finished:

```bash
git worktree remove ../homeschool_co-op-hotfix
```

If you already use **`.worktree-*` directories inside the clone**, they are listed in `.gitignore` so they do not clutter status; remove them when idle:

```bash
git worktree remove .worktree-pr4
```

## Environment: Git must be able to write `.git`

Your user and tools need permission to update **`.git/config`** and other Git metadata. If you see errors like “could not write config file `.git/config`”, fix permissions or run Git from a normal terminal (not a sandbox that blocks writes to `.git`).

## Cursor / IDE warnings

Messages such as “many uncommitted changes on an old branch” mean: **wrong branch for the work**, or **branch is merged but still checked out**, or **`main` is far behind `origin/main`**. Following the daily routine above clears that up.
