# Contributing

## Git

We keep **`main` clean and aligned with `origin/main`** and do feature/fix work on **short-lived branches** merged via pull request.

**Full conventions, commands, worktrees, and notes on tracked `data/*.json` fixtures:** [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md).

Quick start:

```bash
git checkout main && git pull origin main
git checkout -b fix-or-feature/short-name
# … commit, push, open PR …
# after merge:
git checkout main && git pull origin main && git branch -d fix-or-feature/short-name
```

## Code and tests

- Match existing patterns in the files you touch (naming, imports, error handling).
- Run the test or lint commands your change depends on before pushing (see `package.json` scripts and project testing docs as applicable).
