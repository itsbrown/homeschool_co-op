# P1-A-13 — Post-payment client cache convergence (staging verification)

**Goal:** After a successful payment, parent-facing UI (billing, enrollments, cart, membership, payment history) must reflect **authoritative server state** without a full page reload or stale “Pay now” CTAs.

**Implementation reference**

- Shared invalidation + refetch: `client/src/lib/postPaymentRefresh.ts` (`refreshPostPaymentState`).
- Call sites: `client/src/pages/PaymentSuccess.tsx`, `CartSuccess.tsx`, `MembershipSuccess.tsx` (cart path: confirm enrollments → clear storage/context → then refresh).
- Billing pay flows may additionally invalidate keys from `client/src/pages/BillingPage.tsx`.

---

## Environment

- Staging (or local with production-like API), Stripe **test mode**, real auth session.
- Browser devtools open: **Network** + **Application** (localStorage) as needed.

---

## Checklist (record Pass/Fail + date + notes)

### A. Cart checkout success (`/cart/success`)

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Complete a multi-item cart checkout through Stripe redirect (`redirect_status=succeeded`). | Success page loads; enrollments confirmed server-side. | |
| A2 | Before navigating away, check cart: localStorage keys `asa_cart*`, `cart`, `selectedPaymentPlan` cleared; cart context empty. | No stale cart items. | |
| A3 | Open **Billing** (or parent dashboard) without hard refresh. | Owed totals and enrollment status match server (no duplicate “pay” for just-paid items). | |
| A4 | Optional: React Query devtools — queries for `/api/parent/enrollments`, `/api/enrollments`, `billing-summary`, `/api/billing/summary` refetched or fresh after success. | Data updated after `refreshPostPaymentState`. | |

### B. Single enrollment payment success (`/payment/success` or equivalent)

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Complete pay flow that lands on payment success with `payment_intent` (and related query params). | Success UI loads. | |
| B2 | Navigate to billing/enrollments without full reload. | Balances and statuses converged; no stale amount. | |

### C. Membership success

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Complete membership purchase; land on membership success after confirm API succeeds. | Toast + details OK. | |
| C2 | Open areas that show membership (`/api/parent/memberships`, member id). | Active membership visible without reload. | |

### D. Regression guards

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | After success, use **back** button then forward — no duplicate confirm that corrupts state (note behavior). | Document if safe or if follow-up needed. | |
| D2 | Failed/cancelled redirect — should **not** clear cart or show success; no false cache refresh. | | |

---

## Automated tests (CI)

- Server billing/summary and amount enforcement suites exercise authoritative totals; they do **not** replace browser cache verification above.
- Client: `client/src/contexts/__tests__/CartContext.test.tsx` covers cart clear behavior (not the full Stripe redirect).

---

## Closure criteria (P1-A-13)

- [ ] Rows A1–A4, B1–B2, C1–C2 completed on staging with **Pass** or documented exceptions.
- [ ] D1–D2 noted; any defect filed with repro + enrollment/payment IDs.
- [ ] Evidence stored (short note + dates in this file or team incident doc).

---

## Parallel track — Epic P1-C-01 kickoff (allocator / comp-aware owed)

**Roadmap:** Single canonical owed formula: `total_cost - total_paid - comp_amount_cents` (when comp exists).

**Current server anchors**

- `server/services/cents-utils.ts` — `calculateEnrollmentOwedCents` (uses `remainingBalance` or `totalCost` / `totalPaid` only).
- `server/services/billing-summary-service.ts` — aggregates owed via that helper.
- `server/api/billing.ts` — `getAuthoritativeRemainingBalanceCents` and summary assembly (parallel path to keep aligned).

**Schema note:** `program_enrollments` has no dedicated `comp_amount_cents` column today; comp may live in `metadata` or future migration — **P1-C-01** should define the source of truth and thread it into `calculateEnrollmentOwedCents` + all writers.

**Suggested first PR (P1-C-01):** introduce a single exported helper (e.g. `getCanonicalEnrollmentOwedCents(enrollment)`) that centralizes comp handling once the data model is chosen; migrate `billing-summary-service` and billing routes to call it only.
