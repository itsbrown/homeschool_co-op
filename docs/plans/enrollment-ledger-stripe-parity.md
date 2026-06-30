# Enrollment ledger ↔ Stripe parity (system fix plan)

**Status:** Plan — Kendra Crofoot prod correction applied via `fix-kendra-crofoot-session-phantom-paid-production.ts`.  
**Last updated:** 2026-06-25 (Phase 5 test matrix expanded)  
**Related:** [`post-payment-verification-pipeline.md`](./post-payment-verification-pipeline.md), [`payments-and-billing.md`](../APP_KNOWLEDGE/domains/payments-and-billing.md)

## Incident summary (Kendra Crofoot)

Six v2 session enrollments (#522–531) showed **`total_paid = $441`** each while:

- Stripe checkout PI `pi_3ThDZRGhVuNOnUs71KzilfhU` remained **`requires_payment_method`**
- **No** row in `payments` for that PI or those enrollments
- `payment_status` stayed **`pending`** (normal fulfillment sets `partial_payment` / `stripe_managed`)

Admin UI and cart treated `total_paid` as real money; parent Payments tab correctly showed nothing.

## Root cause (architecture)

Two ledgers without a hard invariant:

| Source | Used by |
|--------|---------|
| `program_enrollments.total_paid` | Admin grid, cart owed, checkout canonical amounts |
| `payments` + succeeded Stripe PIs | Parent Payments tab, receipts, audits |

Post-payment verification runs **only after** `payment_intent.succeeded`. Abandoned or partial writes to `total_paid` are invisible to that pipeline.

**Invalid state:** `total_paid > 0` AND `payment_status = 'pending'` AND no corroborating `payments` row / succeeded PI for that enrollment since last reset.

## Goals

1. **Detect** orphan / phantom `total_paid` on enrollments (including abandoned checkouts).
2. **Prevent** new writes to `total_paid` without a succeeded PI or explicit admin correction.
3. **Display** admin/parent UI from verified balances, not raw `total_paid` alone.
4. **Reconcile** periodically (batch job), not only post-webhook.

## Phase 1 — Detection (read-only, low risk)

### 1a. Enrollment ledger invariant checker

New module: `server/lib/enrollment-ledger-invariants.ts`

Flags per enrollment:

- **`phantom_paid`:** `total_paid > 0`, `payment_status = 'pending'`, no `payments` row referencing enrollment with `status IN ('completed','succeeded')` and amount allocated to that enrollment.
- **`pi_metadata_stale`:** `metadata.initialPaymentIntentId` set but Stripe PI status ≠ `succeeded`.
- **`paid_exceeds_stripe`:** sum of allocated payments + credits for enrollment < `total_paid` (reuse patterns from `inspect-parent-stripe-by-email.ts`).

### 1b. Admin report endpoint

`GET /api/school-admin/ledger-anomalies?schoolId=` — school admin only; returns rows matching above.

### 1c. Nightly cron / existing monitor

Extend `payment-flow-monitor` (or new `enrollment-ledger-monitor.ts`) to:

- Query enrollments with `total_paid > 0` AND `payment_status = 'pending'` AND `status = 'pending_payment'`
- Email admin digest if count > 0

**Acceptance:** Kendra-like state would appear in monitor within 24h if it recurred.

## Phase 2 — Prevent writes (medium risk)

### 2a. Single write path for `total_paid`

Audit all `updateProgramEnrollment` / SQL `SET total_paid` call sites. Require one of:

- `finalizeSucceededPaymentIntent` / `applyClassPoolToEnrollments`
- `PaymentReallocationService` (with allocation rows)
- `completeCartCreditsOnlyCheckout` (with credit usage logs)
- Admin **`correct-balance`** / reallocate with audit log

Any other path → refactor to call shared `applyEnrollmentPaymentLedger()` that asserts preconditions.

### 2b. Never set `total_paid` at PI creation

Confirm `StripePaymentPlanService.createEducationalPaymentPlan` and `updateEnrollmentsWithPaymentIntent` only touch metadata (already true); add regression test.

### 2c. Block invalid states at DB or app layer

**Option A (app):** After any enrollment financial update, run `assertEnrollmentLedgerConsistent(enrollmentId)` in dev/test; log + metric in prod.

**Option B (DB, stricter):** CHECK constraint or trigger — harder because legitimate `partial_payment` with async PI exists. Prefer app assertion first.

### 2d. Admin UI guard

School admin enrollments grid:

- Green “paid” column = **`verifiedPaidCents`** from API (payments + credit usage + allocations), not raw `total_paid`.
- Show warning badge when `total_paid !== verifiedPaidCents`.

## Phase 3 — Checkout / cart UX (medium risk)

### 3a. Cart line eligibility

When building cart from DB, if `total_paid > 0` but no verified payment for that enrollment, treat **`total_paid` as 0** for checkout amount (with server log). Prevents inflated “already paid” reducing checkout incorrectly.

### 3b. Per-line remove (Kendra follow-up product fix)

Wire `CartDrawer` remove → single-enrollment cancel for `pending_payment` lines so parents are not forced to pay or clear entire multi-session cart.

## Phase 4 — Reconciliation tooling

### 4a. Script: `detect-phantom-enrollment-paid.ts`

- Input: `--school-id` or `--parent-email`
- Output: JSON list of anomalies + suggested reset (like Kendra fix script)

### 4b. Safe auto-fix (optional, behind flag)

Only when **all** of:

- `payment_status = 'pending'`
- `status = 'pending_payment'`
- `metadata.initialPaymentIntentId` PI status ≠ `succeeded`
- No `payments` row for that PI
- No `payment_allocations` for enrollment

→ Reset `total_paid` to 0, `remaining_balance` to `total_cost - comp`, audit log entry.

**Do not** auto-fix `enrolled` rows or rows with any succeeded payment history.

## Phase 5 — Tests and acceptance gates

Phase 5 is **required before shipping medium-risk phases (2a, 3a, 4b)**. Tests below are **acceptance criteria**, not optional follow-ups. Most files are **planned** (not yet in repo) unless noted as existing.

### Gate summary (ship blockers)

| Phase | May ship when |
|-------|----------------|
| **1** | Detector unit tests + admin anomaly integration + monitor smoke test pass |
| **2b–2d** | Abandoned-checkout integration + verified-paid DTO tests pass; **no change** to existing payment integration suite |
| **2a** | All Phase 5 “write path” + “regression suite” rows green |
| **3a** | Full cart phantom matrix green (including must-not-ignore cases) |
| **4b** | Auto-fix allow/deny matrix green; idempotent second run |

### Kendra fixture (shared test seed)

Use a frozen in-memory or `testDb` fixture mirroring prod incident **before** correction:

| Field | Value |
|-------|--------|
| Enrollments | 6× v2 session, `pending_payment`, half-day $1,050 |
| `total_paid` | 44100 each ($441) |
| `payment_status` | `pending` |
| `metadata.initialPaymentIntentId` | fake PI id |
| Stripe PI status | `requires_payment_method` |
| `payments` rows | none for that PI |
| `payment_allocations` | none |

After auto-fix tests, assert reset matches `fix-kendra-crofoot-session-phantom-paid-production.ts` output.

---

### A. Detection (Phase 1) — low risk

| ID | Scenario | Type | File (planned unless noted) |
|----|----------|------|----------------------------|
| A1 | `detectPhantomPaid()` true on Kendra fixture | unit | `server/tests/enrollment-ledger-invariants.test.ts` |
| A2 | `detectPhantomPaid()` false when `payment_status = partial_payment` + succeeded PI | unit | same |
| A3 | `detectPhantomPaid()` false when `total_paid = 0` | unit | same |
| A4 | `pi_metadata_stale` when `initialPaymentIntentId` set and PI ≠ succeeded | unit | same |
| A5 | `paid_exceeds_stripe` when `total_paid` > sum(payments + credits) | unit | same |
| A6 | `GET /api/school-admin/ledger-anomalies` returns Kendra fixture rows; school-scoped auth | integration | `server/tests/integration/school-admin-ledger-anomalies.test.ts` |
| A7 | Monitor query finds `pending_payment` + `total_paid > 0` + `payment_status pending` | unit/smoke | `server/tests/enrollment-ledger-monitor.test.ts` |

**Phase 1 ship gate:** A1–A7 pass.

---

### B. Abandoned checkout / PI creation (Phase 2b) — medium risk (preventive)

| ID | Scenario | Type | File |
|----|----------|------|------|
| B1 | `createEducationalPaymentPlan` returns PI; enrollments **`total_paid` unchanged** | integration | `server/tests/integration/checkout-abandoned-ledger.test.ts` |
| B2 | `updateEnrollmentsWithPaymentIntent` sets metadata only (`initialPaymentIntentId`); **`total_paid` unchanged** | unit/integration | same |
| B3 | Parent abandons checkout (PI `requires_payment_method`); re-fetch enrollments — ledger unchanged | integration | same |
| B4 | Second checkout creates new PI; still no ledger mutation until success | integration | same |

**Covers:** Kendra root symptom if cause was pre-success ledger write.

---

### C. Write-path consolidation (Phase 2a) — medium risk

**Before refactor:** capture baseline — all existing tests green.

**Regression suite (must stay green after 2a):**

| Existing file | Why |
|---------------|-----|
| `server/tests/integration/checkout-pi-webhook-idempotency.test.ts` | Webhook double-delivery |
| `server/tests/integration/fulfill-payment-intent.integration.test.ts` | Client + server finalize |
| `server/tests/integration/cart-credits-only-checkout-route.test.ts` | Credits-only path |
| `server/tests/integration/payment-flow/cart-pi-success.test.ts` | Cart PI success |
| `server/tests/integration/payment-flow/balance-split.test.ts` | Multi-enrollment split |
| `server/tests/integration/payment-flow/scheduled-payment-success.test.ts` | Scheduled installments |
| `server/tests/allocator-reallocation.test.ts` | Admin reallocate validation |
| `server/tests/reconciliation-ledger-equivalence.test.ts` | Missed webhook reconcile |

**New tests after shared `applyEnrollmentPaymentLedger()` (or equivalent):**

| ID | Scenario | Type | File |
|----|----------|------|------|
| C1 | `finalizeSucceededPaymentIntent` updates `total_paid` + creates `payments` row | integration | `server/tests/integration/enrollment-ledger-write-path.test.ts` |
| C2 | `completeCartCreditsOnlyCheckout` updates `total_paid` + credit usage logs | integration | same |
| C3 | `PaymentReallocationService.reallocateMany` updates both sides + `payment_allocations` | integration | same (or extend `allocator-reallocation.test.ts`) |
| C4 | Admin `correct-balance` updates `total_paid` + audit log | integration | same |
| C5 | Direct `updateProgramEnrollment({ totalPaid })` outside allowlist — **test documents forbidden** or routes through helper | unit | same |
| C6 | `assertEnrollmentLedgerConsistent` logs in prod mode, throws in test mode on phantom state | unit | `server/tests/enrollment-ledger-assert.test.ts` |

**Phase 2a ship gate:** full regression suite + C1–C6 pass.

---

### D. Admin verified paid (Phase 2d) — low/medium risk

| ID | Scenario | Type | File |
|----|----------|------|------|
| D1 | School-admin enrollment DTO: `verifiedPaidCents` from payments + allocations + credits | unit/integration | `server/tests/school-admin-verified-paid.test.ts` |
| D2 | Kendra fixture: `total_paid = 44100`, `verifiedPaidCents = 0`, anomaly flag set | unit | same |
| D3 | Legitimate partial: `total_paid` matches verified sources; no anomaly flag | unit | same |
| D4 | `total_paid !== verifiedPaidCents` → response includes `ledgerMismatch: true` | unit | same |

---

### E. Cart / checkout phantom handling (Phase 3a) — medium risk

**Critical:** tests must cover both **must ignore** (phantom) and **must not ignore** (legitimate) cases.

| ID | Scenario | Expected cart owed | Type | File |
|----|----------|-------------------|------|------|
| E1 | Kendra fixture (phantom) | Full `total_cost` per line (ignore `total_paid`) | unit/integration | `server/tests/cart-unverified-paid.test.ts` |
| E2 | After succeeded PI + finalize | Reduced by actual `total_paid` | integration | same |
| E3 | Credits-only checkout applied | Reduced by credits; not treated as phantom | integration | same |
| E4 | Succeeded PI, finalize **not yet run** (webhook delay simulation) | **Do not** zero `total_paid`; use Stripe PI status or pending `payments` row | integration | same |
| E5 | `partial_payment` + `enrolled` + payments row | Use `total_paid` normally | integration | same |
| E6 | Mixed cart: 2 phantom + 2 clean lines | Owed = sum(clean remaining + full cost on phantom) | integration | same |
| E7 | `/api/cart/calculate` and checkout canonical amount agree on E1–E6 | Same numbers | integration | extend `server/tests/checkout-enrollment-outstanding.test.ts` |

**Phase 3a ship gate:** E1–E7 pass; E4 and E5 are **release blockers** (prevent double-charge / false phantom).

---

### F. Auto-fix (Phase 4b) — medium risk

| ID | Scenario | Auto-fix runs? | Type | File |
|----|----------|----------------|------|------|
| F1 | Kendra fixture (all gates true) | Yes → `total_paid = 0`, full balance restored | integration | `server/tests/integration/phantom-ledger-auto-fix.test.ts` |
| F2 | `status = enrolled` | **No** | integration | same |
| F3 | `payment_status = partial_payment` | **No** | integration | same |
| F4 | Succeeded PI for `initialPaymentIntentId` | **No** | integration | same |
| F5 | Existing `payments` row for PI | **No** | integration | same |
| F6 | Existing `payment_allocations` for enrollment | **No** | integration | same |
| F7 | Second auto-fix run on same rows | Idempotent (no-op) | integration | same |
| F8 | Flag `PHANTOM_LEDGER_AUTO_FIX=false` | No-op | unit | same |

**Phase 4b ship gate:** F1–F8 pass; enable flag in prod only after 2 weeks clean Phase 1 monitor.

---

### G. CLI / scripts (Phase 4a)

| ID | Scenario | Type | File |
|----|----------|------|------|
| G1 | `detect-phantom-enrollment-paid.ts --email` prints Kendra-shaped JSON | script smoke | manual or `server/tests/scripts/detect-phantom-enrollment-paid.test.ts` |
| G2 | Dry-run fix script matches F1 outcome | script smoke | extend Kendra fix script test |

---

### H. E2E (optional, post-3b)

Not required for medium-risk gates; add when per-line cart remove ships.

| ID | Scenario | File |
|----|----------|------|
| H1 | Parent enrolls 2 sessions, removes one line before pay, checkout total excludes removed session | `e2e/session-cart-line-remove.spec.ts` (catalog in `docs/E2E_COMMANDS.md`) |

---

### CI commands (developer reference)

```bash
# Phase 1 + detector unit tests
npm test -- server/tests/enrollment-ledger-invariants.test.ts server/tests/enrollment-ledger-monitor.test.ts

# Abandoned checkout + cart phantom (Phase 2b, 3a)
npm test -- server/tests/integration/checkout-abandoned-ledger.test.ts server/tests/cart-unverified-paid.test.ts

# Write-path + auto-fix integration
npm test -- server/tests/integration/enrollment-ledger-write-path.test.ts server/tests/integration/phantom-ledger-auto-fix.test.ts

# Phase 2a regression (full payment lane — run before/after refactor)
npm test -- server/tests/integration/checkout-pi-webhook-idempotency.test.ts \
  server/tests/integration/fulfill-payment-intent.integration.test.ts \
  server/tests/integration/cart-credits-only-checkout-route.test.ts \
  server/tests/integration/payment-flow/
```

---

### Coverage map: medium-risk phases → tests

| Phase | Risk | Primary test IDs |
|-------|------|------------------|
| 2a Write-path refactor | Medium | C1–C6 + regression suite |
| 2b PI creation | Medium | B1–B4 |
| 2c Assertions | Medium | C6, A1 |
| 2d Verified paid UI | Low/med | D1–D4 |
| 3a Cart phantom ignore | Medium | E1–E7 (**E4, E5 blockers**) |
| 4b Auto-fix | Medium | F1–F8 |

**Verdict:** Prior Phase 5 table (4 rows) was a stub. This matrix is the **minimum** bar for production-safe rollout of medium-risk work.

## Rollout order

1. **Phase 5A** — implement tests **A1–A7, B1–B4** (detection + abandoned checkout); ship **Phase 1**
2. **Kendra-style prod fixes** — manual script per incident until **F1–F8** exist
3. **Phase 5D + 5E** — **D1–D4, E1–E7** before shipping **2d** and **3a**
4. **Phase 2b–2d** — prevent + admin display (3–5 days)
5. **Phase 5C** — regression suite green, then **2a** write-path refactor
6. **Phase 3** — cart/checkout + optional **H1** E2E
7. **Phase 5F** — **F1–F8**, then **4b** auto-fix after 2 weeks clean monitor

## Out of scope

- Re-allocating legitimate partial payments on `enrolled` rows
- Changing how Greece legacy (#389) payments display (separate from session phantom)

## Key files to touch

- `server/lib/apply-class-pool-to-enrollments.ts` — canonical apply path
- `server/lib/finalize-succeeded-payment-intent.ts` — only path after Stripe success
- `server/api/school-admin.ts` — enrollments list DTO
- `client/src/components/admin/*` — paid column
- `server/services/payment-flow-monitor.ts` — nightly anomalies
- `docs/APP_KNOWLEDGE/domains/payments-and-billing.md` — invariants section
