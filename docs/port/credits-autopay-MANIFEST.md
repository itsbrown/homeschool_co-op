# Port bundle — credits + auto-pay stack

**Source SHA:** `c27d976a77be565d6adf76b4fd778caca57c4083` (2026-05-10 16:45:16 UTC)
**Source commit subject:** `Task #248: Backfill payment_allocations.membership_enrollment_id`
**PR title for receiving repo:** `Port from Replit @ c27d976`
**Bundle file:** `docs/port/credits-autopay-bundle-c27d976.tar.gz` (sibling of this manifest)

This manifest documents everything needed to port the school credit ledger + auto-pay (with partial-credit support, FIFO consumption, $0.50 Stripe-minimum squeeze, hold/finalize/release lifecycle) to a clone of this app that does not currently have it.

---

## 0. Port order

Apply in this order to avoid FK / dependency errors:

1. **Migrations** — apply DDL:
   1. `volunteer_credits` table (legacy ledger — keep for back-compat)
   2. `credit_usage_logs` table (legacy log)
   3. `credits` table (unified ledger)
   4. `unified_credit_usage_logs` table
   5. `credit_holds` table
   6. (Optional) data-copy block that mirrors `volunteer_credits` rows into `credits` for back-compat
2. **Drizzle schema** — paste the table definitions + relations into `shared/schema.ts` (lines 3004–3199 in this repo). All columns: snake_case in DB, camelCase in Drizzle.
3. **Storage layer** — port the `IStorage` interface methods + their `dbStorage` implementations.
4. **Services** — port `auto-pay-scheduler.ts`, `auto-pay-webhook-helpers.ts`, `creditExpirationService.ts`, `credit-integrity-check.ts`.
5. **Pure utility** — port `server/utils/manualPayCredits.ts` (decision function shared by autopay and manual Pay-Now flows).
6. **API routes** — port `server/api/credits.ts` and `server/api/auto-pay.ts`; wire in your `routes.ts` (`app.use("/api/credits", creditsRouter)` etc.).
7. **Webhook handler** — extract the credit-finalization branches inside `payment_intent.succeeded` and the release branches inside `payment_intent.payment_failed`. Stripe metadata keys: `creditsAppliedCents`, `holdSessionId`.
8. **Bootstrap** — call `startAutoPayScheduler(...)` and `startCreditExpirationService(...)` from your app initializer (in this repo: `server/app-init.ts`). The scheduler ticks via `setInterval` (line 889 of `auto-pay-scheduler.ts`).
9. **Tests** — port the test helpers + integration suite; ensure your test runner picks them up.
10. **Frontend** — port the credit-aware utilities + admin pages.
11. **Cursor skill** — copy `.agents/skills/asa-credit-system/SKILL.md` so Cursor agents understand the contract.

### Env vars / Stripe Dashboard assumptions

| Var | Required? | Used by | Purpose |
|---|---|---|---|
| `DATABASE_URL` | required | everywhere | Postgres connection |
| `STRIPE_SECRET_KEY` | required | scheduler, webhook | server-side Stripe SDK |
| `STRIPE_WEBHOOK_SECRET` | required | webhook | signature verification |
| `AUTO_PAY_SINGLE_INSTANCE` | optional (`'true'` to enable) | `auto-pay-scheduler.ts:880` | single-instance guard for multi-replica deploys |
| `BREVO_API_KEY` / `SENDGRID_API_KEY` | optional | scheduler email notifications | pre-charge reminder + credits-success email |

**Stripe Dashboard:** enable `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` webhooks pointing at `/api/stripe/webhook`. Stripe API version `2024-06-20`. PaymentIntent metadata keys: `scheduledPaymentId`, `creditsAppliedCents`, `holdSessionId`, `parentId`, `enrollmentId`, `schoolId`, `paymentType`, `completionSource`.

The `AUTO_APPLY_CREDITS` flag has been **removed** in this repo — credits are always applied. Do not re-introduce it in the receiving repo.

**Note:** This stack does NOT use Postgres RLS. Access control is enforced at the API layer (school-scoped via `req.user.schoolId`). If your receiving repo uses RLS (e.g. via Supabase), add policies separately.

---

## 1. File manifest

### Required (CORE)

| Path | Lines | Purpose |
|---|---:|---|
| `shared/schema.ts` (extract lines 3004–3199) | ~195 | Drizzle defs: `volunteerCredits`, `creditUsageLogs`, `credits`, `unifiedCreditUsageLogs`, `creditHolds` + relations |
| `server/init-db.ts` (extract credit blocks 1339–1620, plus `credit_holds` at 1589) | ~280 | Idempotent `CREATE TABLE IF NOT EXISTS` for all 5 credit tables + indexes + back-compat copy |
| `migrations/0000_gray_excalibur.sql` + `migrations/meta/{_journal.json,0000_snapshot.json}` | ~32k | Drizzle baseline migration + meta — needed only if you adopt drizzle-kit migrations rather than the runtime DDL in `init-db.ts` |
| `server/storage.ts` (extract IStorage decls 685–710 + delegation 7910–7955) | ~70 | `getAvailableCredits`, `useCredits`, `createCreditHolds`, `finalizeCreditHolds`, `releaseCreditHolds` |
| `server/dbStorage.ts` (extract credit methods 4508–5160) | ~650 | Storage implementations: FIFO logic, hold lifecycle, expiration filtering, `unified_credit_usage_logs` writes |
| `server/services/auto-pay-scheduler.ts` | 895 | Tick loop, `getDueScheduledPayments` consumer, balance-aware credit application, $0.50 squeeze guard, hold creation, Stripe charge, retry cap (3), staleness cutoff (14d), pre-charge reminder, credits-success notification |
| `server/services/auto-pay-webhook-helpers.ts` | 98 | Webhook-side: finalize holds, write usage logs, mark scheduled_payment paid |
| `server/utils/manualPayCredits.ts` | 123 | Pure decision function: full-coverage / partial-safe / squeeze / too-small. Reuse — don't re-implement |
| `server/api/credits.ts` | 631 | Read endpoints (`/api/credits/balance`, `/api/parent/credits`), admin approve/reject, manual create, usage logs |
| `server/api/auto-pay.ts` | 373 | Per-enrollment auto-pay enable/disable + payment-method-on-file management |
| `server/webhook-handler.ts` (extract credit branches) | ~80 | `payment_intent.succeeded` finalization + `payment_intent.payment_failed` release. Extract — don't replace your whole handler |
| `server/services/creditExpirationService.ts` | 97 | Background job that expires credits past `expiresAt` and emits notifications |
| `server/services/credit-integrity-check.ts` | 227 | Periodic invariant check: `usedAmountCents <= creditAmountCents`, no orphaned holds, etc. |

### Required: tests

| Path | Purpose |
|---|---|
| `server/tests/manualPayCredits.test.ts` | Unit tests for the decision function (all 5 branches) |
| `server/tests/integration/auto-pay-guards.test.ts` | G1–G8 + 2 security tests for hardened auto-pay scheduler |
| `server/tests/integration/payment-flow/scheduled-payment-success.test.ts` | E2E happy path: scheduler → Stripe webhook → finalize |
| `server/tests/integration/payment-flow/payment-intent-failed-retry-cap.test.ts` | Retry cap + hold release on payment failure |
| `server/tests/integration/payment-flow/effective-balance-drift.test.ts` | Post-payment balance-sync invariant (Task #224) |
| `server/tests/integration/payment-flow/helpers/autoPayHelpers.ts` | Test seed/setup helpers |
| `server/tests/integration/payment-flow/helpers/seedCartScenario.ts` | Cart/seed helpers |
| `server/tests/helpers/testDatabase.ts` | DB test fixture |

### Required: Cursor skills

| Path | Purpose |
|---|---|
| `.agents/skills/asa-credit-system/SKILL.md` | Authoritative ledger / FIFO / hold-lifecycle reference. Receiving Cursor repo MUST have this |
| `.agents/skills/asa-payment-patterns/SKILL.md` | Stripe payment patterns — credits live inside this story |

### Required: frontend

| Path | Purpose |
|---|---|
| `client/src/utils/parentBalance.ts` | Pure client-side balance breakdown logic mirroring server math |
| `client/src/utils/__tests__/parentBalance.test.ts` | Unit tests for above |
| `client/src/pages/schooladmin/CreditManagementPage.tsx` | School admin: approve/reject/create credits |
| `client/src/pages/admin/VolunteerCreditsPage.tsx` | Legacy volunteer-credits admin page (optional — keep for back-compat) |
| `client/src/pages/BillingPage.tsx` | Parent: shows credit balance + usage history |
| `client/src/pages/PaymentHistoryPage.tsx` | Parent: shows credits applied per payment |
| `client/src/components/payments/PaymentManagement.tsx` | Manual Pay Now dialog with credits toggle |
| `client/src/components/payments/handleChargeAmountDivergence.ts` | Reconciles client/server amount mismatch when credits change between dialog open + submit |
| `client/src/components/payments/__tests__/handleChargeAmountDivergence.test.ts` | Unit test |
| `client/src/components/__tests__/PaymentManagementCreditsContract.test.tsx` | Contract test: client UI ↔ server math agreement |
| `client/src/components/__tests__/PaymentManagementPayNowDialog.test.tsx` | UI test for Pay Now dialog |
| `client/src/hooks/useUnpaidEnrollments.ts` + `__tests__/useUnpaidEnrollments.test.tsx` | Used by Pay Now flow to enumerate eligible enrollments |

### Likely needed (wiring / extract specific lines)

| Path | Purpose |
|---|---|
| `server/routes.ts` (lines 52, 2170) | Where `creditsRouter` is imported + mounted at `/api/credits` |
| `server/app-init.ts` | Where to call `startAutoPayScheduler(...)` / `startCreditExpirationService(...)` |
| `server/api/test.ts` (lines 1396–2010) | DEV-ONLY test endpoints for autopay/credits scenarios — port if you want the same harness |
| `server/services/PaymentProcessorService.ts` | Used by webhook for payment allocation; touches credit context |
| `server/services/stripeWebhookHandlers.ts` | Sub-handlers for various Stripe event types |
| `server/services/stripe-payment-plans.ts` | Subscription schedule helpers used by autopay scheduler |

### Probably skip (tangential `credits` references)

These touch credits but will likely conflict with the receiving repo's own logic — port only the credit-touching helpers if you really need them:
- `server/api/enrollments.ts`, `server/api/financial-reports.ts`, `server/api/payment-history.ts`, `server/api/scheduled-payments.ts`, `server/api/stripe.ts`
- `server/utils/cart-pricing.ts`
- `docs/grace-mulcahy-backfill.md` (incident-specific, not generally useful)

---

## 2. Schema definition line ranges (`shared/schema.ts`)

| Symbol | Lines |
|---|---|
| `volunteerCredits` (legacy ledger) | 3004–3041 |
| `volunteerCreditsRelations` | 3043–3050 |
| `creditUsageLogs` (legacy log) | 3052–3066 |
| `creditUsageLogsRelations` | 3068–3081 |
| **`credits`** (unified ledger — primary) | 3083–3130 |
| `creditsRelations` | 3132–3137 |
| **`unifiedCreditUsageLogs`** (primary log) | 3139–3153 |
| `unifiedCreditUsageLogsRelations` | 3155–3165 |
| **`creditHolds`** (reservation table) | 3167–3190 |
| `creditHoldsRelations` | 3192–3199 |

When porting, also export the inferred types: `Credit`, `InsertCredit`, `CreditHold`, `InsertCreditHold`, `UnifiedCreditUsageLog`, `InsertUnifiedCreditUsageLog`.

---

## 3. Webhook extraction guide (`server/webhook-handler.ts`, 2174 lines total)

Don't port the whole file. Extract these specific blocks into your existing webhook:

| Branch | Lines (approx) | Purpose |
|---|---|---|
| `payment_intent.succeeded` — `creditsAppliedCents` parse | 929 | Read credits metadata from PI |
| `payment_intent.succeeded` — finalize holds via `holdSessionId` | 1023–1027 | Call `finalizeCreditHolds(...)` |
| `payment_intent.succeeded` — fallback `useCredits(...)` if no hold session | 1092–1148 | Direct consumption when not coming from a hold flow (legacy paths) |
| `payment_intent.payment_failed` — release holds | search `releaseCreditHolds` | Release reserved credits on failure |

`completionSource` enum used: `stripe_autopay`, `stripe_autopay_partial_credits`, `stripe_autopay_credits_only`, `parent_manual_credits_only`, `credits_only`. Preserve labels for audit-report correlation.

---

## 4. Re-creating this bundle

From repo root:

```bash
SHA=$(git --no-optional-locks rev-parse --short HEAD)
mkdir -p docs/port
tar -czvf "docs/port/credits-autopay-bundle-${SHA}.tar.gz" \
  docs/port/credits-autopay-MANIFEST.md \
  shared/schema.ts \
  server/init-db.ts \
  migrations/0000_gray_excalibur.sql \
  migrations/meta/_journal.json \
  migrations/meta/0000_snapshot.json \
  server/storage.ts \
  server/dbStorage.ts \
  server/services/auto-pay-scheduler.ts \
  server/services/auto-pay-webhook-helpers.ts \
  server/services/creditExpirationService.ts \
  server/services/credit-integrity-check.ts \
  server/services/PaymentProcessorService.ts \
  server/services/stripeWebhookHandlers.ts \
  server/services/stripe-payment-plans.ts \
  server/utils/manualPayCredits.ts \
  server/api/credits.ts \
  server/api/auto-pay.ts \
  server/webhook-handler.ts \
  server/routes.ts \
  server/app-init.ts \
  server/api/test.ts \
  server/tests/manualPayCredits.test.ts \
  server/tests/integration/auto-pay-guards.test.ts \
  server/tests/integration/payment-flow/scheduled-payment-success.test.ts \
  server/tests/integration/payment-flow/payment-intent-failed-retry-cap.test.ts \
  server/tests/integration/payment-flow/effective-balance-drift.test.ts \
  server/tests/integration/payment-flow/helpers/autoPayHelpers.ts \
  server/tests/integration/payment-flow/helpers/seedCartScenario.ts \
  server/tests/helpers/testDatabase.ts \
  .agents/skills/asa-credit-system/SKILL.md \
  .agents/skills/asa-payment-patterns/SKILL.md \
  client/src/utils/parentBalance.ts \
  client/src/utils/__tests__/parentBalance.test.ts \
  client/src/pages/schooladmin/CreditManagementPage.tsx \
  client/src/pages/admin/VolunteerCreditsPage.tsx \
  client/src/pages/BillingPage.tsx \
  client/src/pages/PaymentHistoryPage.tsx \
  client/src/components/payments/PaymentManagement.tsx \
  client/src/components/payments/handleChargeAmountDivergence.ts \
  client/src/components/payments/__tests__/handleChargeAmountDivergence.test.ts \
  client/src/components/__tests__/PaymentManagementCreditsContract.test.tsx \
  client/src/components/__tests__/PaymentManagementPayNowDialog.test.tsx \
  client/src/hooks/useUnpaidEnrollments.ts \
  client/src/hooks/__tests__/useUnpaidEnrollments.test.tsx
```
