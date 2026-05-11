# Credits + auto-pay port — progress (Replit @ c27d976)

## Done on this branch

| Step | Status |
|------|--------|
| Tarball SHA-256 verified | `45a6b28ad23c686513c8de4d08301d6b80f861a04b77f4e96218fd6f2f7505fa` for `docs/port/credits-autopay-bundle-c27d976a.tar.gz` |
| Extracted bundle | `scratch/credits-port-c27d976a/` (gitignored) |
| Git branch | `feat/port-credits-autopay-c27d976` |
| Pure credit math | `server/utils/manualPayCredits.ts` + `server/tests/manualPayCredits.test.ts` |
| Cursor skills | `.agents/skills/asa-credit-system/SKILL.md`, `.agents/skills/asa-payment-patterns/SKILL.md` |
| Manifest | `docs/port/credits-autopay-MANIFEST.md` |

## Not merged yet (requires careful integration)

These files exist in `scratch/credits-port-c27d976a/` but were **not** copied over the receiving tree wholesale — they would overwrite large surfaces (`shared/schema.ts`, `server/storage.ts`, `server/dbStorage.ts`, `server/webhook-handler.ts`, `client/.../BillingPage.tsx`, etc.).

Follow `docs/port/credits-autopay-MANIFEST.md` **§0 port order** and merge manually.

### Schema blocker (must resolve before volunteer-credits DDL)

Replit’s `volunteerCredits` / relations reference **`classSessions`** and **`sessionVolunteers`**. This repo’s `shared/schema.ts` has **no** `classSessions` / `sessionVolunteers` tables (as of this port).

**Options:**

1. Add the missing session/volunteer tables from Replit if this product will use them, **or**
2. Port **unified** `credits` + `credit_holds` + `unified_credit_usage_logs` first and make `volunteer_credits` optional / nullable FKs / strip session FKs until the session model exists.

Until resolved, do **not** paste Replit `shared/schema.ts` lines 3004–3049 verbatim without edits.

## Next commands (local)

```bash
# Unit tests for ported math (integration Jest config picks server/tests/**/*.test.ts)
npm run test:server -- --testPathPatterns=manualPayCredits --runInBand
```

(If your script name differs, use `npx jest --config jest.integration.config.cjs server/tests/manualPayCredits.test.ts`.)

## Remaining bundle paths (reference)

See tarball listing: `tar -tzf docs/port/credits-autopay-bundle-c27d976a.tar.gz`
