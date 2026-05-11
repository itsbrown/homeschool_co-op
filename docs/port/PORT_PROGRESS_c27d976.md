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
| **Option B — unified ledger** | Landed: `credits`, `credit_holds`, `unified_credit_usage_logs` in `shared/schema.ts` + `server/init-db.ts`; **no** `volunteer_credits` / `class_sessions` / `session_volunteers` in this slice. |
| **Scheduled payment audit** | `scheduled_payments.completion_source`, `charged_by` (schema + init-db `ALTER … IF NOT EXISTS`). |
| **Storage + API** | `IStorage` / `DatabaseStorage` / `MemStorage` / `CombinedStorage`: credits, holds, FIFO `useCredits`, `finalizeCreditHolds`, `completeCreditsOnlyPayment`, stripe history helpers, `updateScheduledPayment`. `server/api/credits.ts` mounted at `/api/credits`. |
| **Services** | `auto-pay-webhook-helpers` (failed installment + retries), `creditExpirationService`, `credit-integrity-check`. |
| **Wiring** | `server/routes.ts`, `server/webhook-handler.ts` (scheduled_payment success: credits finalize/consume, enrollment by `enrollmentId`, `InsertPayment` fields; failure path); `server/index.ts` starts/stops credit expiration job with other jobs. |
| **Client** | `AdminClassesPage.tsx` parse fix (nested ternary / table) so the tree builds. |

`npm run test:server -- --testPathPatterns=manualPayCredits --runInBand` passes. Full `npm run check` still reports unrelated pre-existing errors elsewhere in the repo.

## Not merged yet (requires careful integration)

**Update:** The **unified-ledger (option B)** server slice above is implemented on `feat/port-credits-autopay-c27d976`. The bullets below still apply to **remaining** bundle paths (client billing UI, full auto-pay scheduler port, volunteer/session model if product needs it).

These files exist in `scratch/credits-port-c27d976a/` but were **not** copied over the receiving tree wholesale — they would overwrite large surfaces (`shared/schema.ts`, `server/storage.ts`, `server/dbStorage.ts`, `server/webhook-handler.ts`, `client/.../BillingPage.tsx`, etc.).

Follow `docs/port/credits-autopay-MANIFEST.md` **§0 port order** and merge manually.

### Schema blocker (must resolve before volunteer-credits DDL)

Replit’s `volunteerCredits` / relations reference **`classSessions`** and **`sessionVolunteers`**. This repo’s `shared/schema.ts` has **no** `classSessions` / `sessionVolunteers` tables (as of this port).

**Options:**

1. Add the missing session/volunteer tables from Replit if this product will use them, **or**
2. Port **unified** `credits` + `credit_holds` + `unified_credit_usage_logs` first and make `volunteer_credits` optional / nullable FKs / strip session FKs until the session model exists. **(Option 2 / unified-only path is what landed in the slice above.)**

Until resolved, do **not** paste Replit `shared/schema.ts` lines 3004–3049 verbatim without edits.

## Next commands (local)

```bash
# Unit tests for ported math (integration Jest config picks server/tests/**/*.test.ts)
npm run test:server -- --testPathPatterns=manualPayCredits --runInBand
```

(If your script name differs, use `npx jest --config jest.integration.config.cjs server/tests/manualPayCredits.test.ts`.)

## Remaining bundle paths (reference)

See tarball listing: `tar -tzf docs/port/credits-autopay-bundle-c27d976a.tar.gz`
