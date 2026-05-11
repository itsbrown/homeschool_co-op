## Summary

What changed and why (one short paragraph).

## Lane / scope (avoid parallel collisions)

- [ ] **Lane tag:** e.g. `lane-a` (webhook/billing), `lane-b` (client payments UI), `lane-d` (CI/types), `lane-p1b` (backlog — not reserved lane prefixes)
- [ ] **Autopay / reconciliation:** I did **not** touch hot paths unless this PR is explicitly for that (list files if yes)

## Required checks

- [ ] **Payments CI** is green (`check:payments`, `test:payments`)
- [ ] No unrelated `data/*.json` or local-only files in this PR

## Backlog / follow-ups (optional)

- Widen `tsconfig.payments.json` toward `server/webhook-handler.ts` / `server/api/billing.ts` incrementally
- Full `npm run check` (client + server) remains separate from Payments CI
