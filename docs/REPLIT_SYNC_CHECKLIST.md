# Replit sync before the next pull or manual publish

Use this checklist so the Repl matches **GitHub `origin/main`** (single contract).

## 1. Fetch and compare

```bash
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```

`HEAD` and `origin/main` should match **before** you rely on the Repl for production parity.

## 2. Align working tree

**Preferred (clean mirror):**

```bash
git checkout main
git reset --hard origin/main
```

Use only if the Repl has **no** uncommitted work you need. Otherwise:

```bash
git checkout main
git merge origin/main
```

Resolve conflicts, commit, push from a machine that can push to `main` if needed.

## 3. Install and smoke

```bash
npm ci
npm run check
npm run test:payments
```

If `npm run check` fails on the full repo, run `npm run check:payments` when available, or rely on GitHub Actions on `main` for full TypeScript coverage.

## 4. Before manual Publish

- Confirm `git rev-parse HEAD` equals GitHub’s latest `main` SHA.
- Run a short smoke from [AUTOPAY_PRODUCTION_CHECKLIST.md](AUTOPAY_PRODUCTION_CHECKLIST.md) (webhook, pay flow, scheduled payment visibility).
- Restart the dev server if port **5000** is stale (common Replit `EADDRINUSE` after merges).

## 5. After publish

Note the deployed SHA in your ops log so production matches an auditable commit.
