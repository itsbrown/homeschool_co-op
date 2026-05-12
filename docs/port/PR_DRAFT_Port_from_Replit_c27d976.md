## Port from Replit @ c27d976

### Summary

Ports the **school credit ledger + auto-pay** stack from Replit commit `c27d976a77be565d6adf76b4fd778caca57c4083` (Task #248 merge context). This PR is **incremental**: it lands shared **manual pay / partial-credit math** (`manualPayCredits`) + **Cursor skills** first; full schema, storage, scheduler, webhooks, and UI merges are tracked in `docs/port/PORT_PROGRESS_c27d976.md`.

### Source

- **Bundle:** `docs/port/credits-autopay-bundle-c27d976a.tar.gz` (SHA-256: `45a6b28ad23c686513c8de4d08301d6b80f861a04b77f4e96218fd6f2f7505fa`)
- **Manifest:** `docs/port/credits-autopay-MANIFEST.md`

### What changed

- `server/utils/manualPayCredits.ts` — server-authoritative credit vs card split (incl. $0.50 Stripe floor / squeeze).
- `server/tests/manualPayCredits.test.ts` — pins the contract (incl. regression cases from the bundle).
- `.agents/skills/asa-credit-system/SKILL.md` — FIFO / hold lifecycle reference for Cursor.
- `.agents/skills/asa-payment-patterns/SKILL.md` — Stripe + credits patterns.
- `.gitignore` — ignore `scratch/` (extract dir for the tarball).
- `docs/port/*` — manifest + progress + this PR draft.

### Follow-ups (separate commits / PRs)

1. Resolve **schema FK gap** (`classSessions` / `sessionVolunteers` vs this repo).
2. Merge Drizzle tables: `credits`, `credit_holds`, `unified_credit_usage_logs`, legacy volunteer tables per manifest.
3. Port `dbStorage` / `storage` credit methods + `auto-pay-scheduler` + webhook extract + `app-init` wiring.
4. Port client credit UI per manifest; wire billing / Pay Now to `computeManualPayCredits`.

### Checklist

- [ ] `npm run test:server -- --testPathPatterns=manualPayCredits --runInBand`
- [ ] No secrets in `docs/port` bundle (tarball is binary; confirm not required in CI if too large)
