---
name: asa-payment-patterns
description: Stripe payment integration, payment plan types, scheduled payment lifecycle, cart pricing, discount system, refund processing, and billing patterns for the ASA Learning Platform. Use when working with checkout flows, payment plans, Stripe webhooks, scheduled payments, discounts, refunds, or any financial logic.
---

# ASA Payment & Billing Patterns

## Core Financial Rules

- **All amounts in cents** (integer) — never dollars. Display: `(amountCents / 100).toFixed(2)`
- **Stripe-only** payment processing — no other gateways
- **Server-authoritative pricing** — server is the single source of truth for all cart pricing
- **Stripe minimum**: $0.50 (50 cents) per transaction — all payment plans must enforce this

## Money-Path Safety Rules

These four rules are derived from the Task #203 sweep (May 2026). They apply to every change that touches Stripe, payment intents, scheduled payments, refunds, credits, or balance computation. See `ARCHITECTURAL_PATTERNS.md` §9–§16 for the wrong/right code blocks and the post-mortem index that maps each rule to its regression test.

### 1. Webhook handler success means a DB row, not a 200 response
A handler that returns `200 {handled:true}` without persisting anything is a silent failure — Stripe will not redeliver. Every payment-bearing webhook (`payment_intent.succeeded`, `charge.refunded`, `invoice.payment_succeeded`) must end with a row in `stripe_payment_history` (or `refunds`, `payment_allocations`) that can be SELECTed by `(stripe_event_id, payment_intent_id)`. **Real bug (#1, #2, #18)**: cart-originated `payment_intent.succeeded` events returned `200 {handled:true}` but wrote nothing — payment history, receipts, refunds, scheduled payments, and balance updates all silently broke.

### 2. Stripe-creating endpoints must be idempotent on `(userId, snapshotId)`
Every endpoint that creates a PaymentIntent, SetupIntent, Refund, or scheduled payment must return the same Stripe ID (and the same `enrollmentIds`) when called twice with identical body within a short window. Stripe's `Idempotency-Key` header is necessary but not sufficient — it protects Stripe-side state, not the application rows we create alongside the PI. Use a per-`(userId, snapshotId)` advisory lock or a row-level dedup check. **Real bug (#6b)**: two parallel `/api/stripe/create-payment-intent` calls with identical body produced two different PIs and two different enrollment rows (`11` and `12`); either could have been confirmed and double-charged.

### 3. Snapshot DTO and commit endpoint must agree on `isFreeEnrollment` and `availableCredits`
`/api/cart/snapshot` and `/api/stripe/create-payment-intent` (and `/api/cart/calculate`, `/api/cart/validate`) must compute every shared flag from the same code path. A paired test must take the snapshot output and feed it into the commit endpoint without modification. If snapshot says `payable=0, isFreeEnrollment=true`, commit must accept `total=0` — never reject with `409 UNIFIED_TOTAL_MISMATCH`. **Real bug (#9, #10)**: snapshot returned `payable=0, isFreeEnrollment=true` for a 100%-credit cart; commit rejected with `409 UNIFIED_TOTAL_MISMATCH`. Snapshot also failed to surface `availableCredits` (returned `undefined`), confirming the two endpoints used independent pricing paths.

### 4. Env-flag-gated code paths must throw in dev when the flag is missing
Any production-required env flag (`PAYMENT_PROCESSOR_ENABLED`, `STRIPE_WEBHOOK_SECRET`, `AUTO_PAY_SINGLE_INSTANCE`) gating money-path code must throw at first use in dev when missing — never silently skip. If a flag legitimately needs to be off in dev, the missing branch must log at WARN with the feature being skipped and the env-flag name to set. **Real bug (#1, root cause)**: `PAYMENT_PROCESSOR_ENABLED` was unset in dev; the webhook persistence branch silently returned with no log line; six downstream Task #203 scenarios failed without a single error in any log.

## Payment Plan Types

### Full Payment (`full`)
- Single payment for the entire amount, due immediately
- Simplest plan — one installment, one `scheduled_payment` record

### Biweekly (`biweekly`)
- **With class dates** (preferred): Date-based calculator divides total evenly across biweekly intervals from program start to end date. Number of payments varies by class duration.
- **Without class dates** (fallback): 4 equal payments every 14 days
- Final payment absorbs rounding remainder
- Automatic fallback to full payment if:
  - Total is under $2.00 (4 × $0.50 minimum)
  - Any installment would be below $0.50

### Custom (`custom`)
- Admin-defined payment schedule with arbitrary amounts and dates

## Scheduled Payment Lifecycle

### 1. Creation (Post-Confirmation Only)
Scheduled payments are **NOT created at checkout**. They are created only after the first payment is confirmed:
```
Checkout → Stripe PaymentIntent → Payment Confirmed → createScheduledPaymentsFromConfirmedPayment()
```
This prevents orphaned schedules from failed/abandoned payments.

### 2. Idempotency Protection
Before creating scheduled payments, the system checks for existing active (`pending`/`scheduled`) payments for ALL enrollments in the cart. If any exist, creation is skipped entirely. Failed payments are excluded from this check to allow legitimate retries.

### 3. Multi-Enrollment Splitting
For consolidated family payments (multiple children in one cart), future installments are split proportionally across enrollments based on cost weighting:
```
Enrollment A: $600 (60%)  →  gets 60% of each future installment
Enrollment B: $400 (40%)  →  gets 40% of each future installment
```

### 4. Status Flow
```
pending → processing → completed
                    → failed (can retry)
                    → cancelled
                    → skipped
```

### 5. Payment Reminders
Each scheduled payment tracks:
- `reminderCount` — how many reminders have been sent
- `lastReminderSentAt` — when the last reminder was sent
- Reminder logs stored in `payment_reminder_logs` table with audit trail

### 6. Unique Constraint
`(enrollmentId, scheduledDate, installmentNumber)` ensures no duplicate installments per enrollment per date.

### 7. Sync Gap Risk

Scheduled payment cancellation after a successful payment is wrapped in a non-fatal `try/catch` — it must not roll back a confirmed payment. If it silently fails, `scheduled_payments` can still show `status = 'pending'` while `program_enrollments.remainingBalance` is already $0. Consequences:
- Financial reports overstate what families owe
- Auto-pay scheduler may charge a fully-paid enrollment

When cancelling on sync, always cancel both `pending` and `overdue` records — overdue installments are the same debt, just past their due date. Use the auto-heal-at-read-time pattern (see `asa-database-patterns`) in any endpoint that reads pending scheduled payments and can cross-reference enrollment balance.

## Scheduled Payment Schema
```
scheduled_payments:
  enrollmentId    → program_enrollments.id
  parentId        → users.id
  amount          → cents (integer)
  scheduledDate   → timestamp (when payment is due)
  installmentNumber → which installment (1, 2, 3...)
  totalInstallments → total in the series
  status          → pending | processing | completed | failed | cancelled | skipped
  stripePaymentIntentId → links to Stripe
  retryCount      → number of retry attempts
  reminderCount   → number of reminders sent
```

## Membership Fee Handling

- Schools configure annual `membershipFeeAmount` (in cents)
- Membership is validated at checkout — parents must pay if not already current
- **Membership fee priority disbursement (waterfall)**: On each payment gross (PI + credits), `computeMembershipWaterfallPortion` in `server/lib/balance-payment-metadata.ts` pays down `membership_enrollments` until the annual fee is satisfied, then applies the remainder to class enrollments. Volunteer credits use the same order (`allocateVolunteerCreditsWaterfall`). Post-payment check: `membership_waterfall` in `post-payment-verification.ts`.
- Membership discounts can be applied (role-based, sibling, etc.)

## Payment Allocation Audit Trail

The `payment_allocations` table provides complete audit trail for payment disbursement:
```
payment_allocations:
  paymentHistoryId     → which payment
  enrollmentId         → class enrollment (nullable)
  membershipEnrollmentId → membership enrollment (nullable)
  allocatedAmountCents → positive for payments, negative for refunds
  allocationType       → payment | refund | reallocation_out | reallocation_in | adjustment | membership
  adminComment         → for manual adjustments
```

## Cart & Checkout Flow

### Server-Side Cart Pricing
- `server/utils/cart-pricing.ts` — calculates all pricing server-side
- Server validates promo codes at checkout (never trust client-side validation)
- Cart state managed via TanStack Query with API-first pattern

### Checkout Process
1. Client submits cart items with selected payment plan
2. Server calculates final pricing (applies discounts, membership fees, proration)
3. Server creates Stripe PaymentIntent with metadata (enrollmentIds, futurePhases, discountSnapshot)
4. Client confirms payment with Stripe
5. Client calls confirm endpoint → server verifies with Stripe → creates scheduled payments

### Immediate Payment Confirmation
After successful Stripe payment, client immediately calls the server-side confirm endpoint. Server verifies the payment with Stripe before updating enrollment status and creating scheduled payments.

## Discount System

Discounts are database-managed with comprehensive rules:
```
discounts:
  type             → percentage | fixed_amount
  value            → percentage (0-100) or fixed cents
  applicationMethod → automatic | manual | both
  code             → optional promo code
```

### Discount Conditions
- `minOrderAmount` — minimum cart total
- `maxDiscountAmount` — cap for percentage discounts
- `applicableToClasses` — specific class IDs
- `applicableToCategories` — class categories
- `applicableToGradeLevels` — grade levels
- `newStudentsOnly` — first-time students only
- `siblingDiscount` — multiple siblings enrolled
- `appliesToMembership` — applies to membership fees
- `requiredRoles` — role-based eligibility with AND/OR logic
- `bundleRule` — nth item free, buy X get Y free, buy X get Y% off
- `usageLimit` / `usageLimitPerUser` — usage caps
- `validFrom` / `validUntil` — time-bound
- `combinableWithOthers` — stacking rules
- `priority` — higher priority discounts apply first

## Comp & Prorate on Enrollments

### Comp (Admin-Applied Discounts)
```
program_enrollments:
  compPercentage    → 0-100
  compAmountCents   → calculated comp amount
  compReason        → admin's reason
  compBy            → admin user ID
  compAt            → timestamp
```

### Prorate (Mid-Session Enrollment)
```
program_enrollments:
  proratedFromCents → original full price
  proratePercentage → 0-100 (% of class remaining)
  prorateDate       → when proration was calculated
  prorateBy         → admin or system
  prorateReason     → explanation
```
Proration calculator: `server/lib/prorate-calculator.ts`

### Comp Sync Must Handle Both `pending` AND `overdue` Status
When cancelling or reducing scheduled payments after applying a comp, **always filter for both statuses**:
```typescript
if (p.status === 'pending' || p.status === 'overdue') { ... }
```
Overdue payments are the same debt as pending — just past their due date. Filtering only `pending` silently leaves overdue installments on the books, causing stale data in financial reports.

### Never Use `scheduled_payments` for Outstanding Balance Totals
`scheduled_payments` is a subset of reality — many enrollments have remaining balances with **no scheduled_payment records at all** (pre-scheduling-era enrollments, comped enrollments without sync). Always aggregate from `program_enrollments` directly using the `effective_balance` generated column.

**Why `effective_balance`, not `remaining_balance`:** `remaining_balance` is intentionally stored as `0` (NOT NULL) for several legitimate Stripe-managed payment paths (Stripe-subscription-driven payment plans, full-payment confirmations, Stripe-synced memberships, etc. — see `server/api/enrollments.ts`, `server/services/stripeWebhookHandlers.ts`, `server/api/stripe.ts`). For those rows, `total_cost - total_paid` is the real amount still owed even though `remaining_balance = 0`. Because the value is `0` and not `NULL`, a plain `COALESCE(remaining_balance, …)` short-circuits before reaching the fallback expression and silently zero-outs the real balance — making the parent see `$0` owed while admins see the real balance.

`effective_balance` is a DB-generated column defined in `shared/schema.ts` as `total_cost - total_paid - COALESCE(comp_amount_cents, 0)`. It is the canonical, authoritative source of truth for "what is still owed on this enrollment". Every parent-facing balance surface and admin family-detail view MUST agree on this field.

**Wrong:**
```sql
-- Bug 1: scheduled_payments is a subset of reality
SELECT SUM(amount) FROM scheduled_payments WHERE status = 'pending' AND school_id = $1

-- Bug 2: COALESCE(remaining_balance, …) silently returns 0 for Stripe-managed rows
SELECT COALESCE(SUM(COALESCE(remaining_balance, total_cost - total_paid)), 0)
FROM program_enrollments
WHERE school_id = $1
  AND COALESCE(remaining_balance, total_cost - total_paid) > 0
```

**Correct:**
```sql
SELECT COALESCE(SUM(effective_balance), 0)
FROM program_enrollments
WHERE school_id = $1
  AND status NOT IN ('cancelled', 'waitlist', 'withdrawn', 'failed', 'completed')
  AND effective_balance > 0
```

**Equivalent if `effective_balance` is unavailable (e.g. legacy migrations):**
```sql
SELECT COALESCE(SUM(GREATEST(total_cost - total_paid - COALESCE(comp_amount_cents, 0), 0)), 0)
FROM program_enrollments
WHERE school_id = $1
  AND status NOT IN ('cancelled', 'waitlist', 'withdrawn', 'failed', 'completed')
  AND (total_cost - total_paid - COALESCE(comp_amount_cents, 0)) > 0
```

**TypeScript display rule:** read `enrollment.effectiveBalance` and only fall back to `Math.max(0, totalCost - totalPaid - (compAmountCents ?? 0))` with a `??` (not `||`) check — `||` and `COALESCE(remaining_balance, …)` behave the same way and will silently zero-out Stripe-managed plans. Never display `remaining_balance` directly to a parent.

## Refund Processing

- Pro-rated refund calculator based on time remaining
- Structured reason codes for audit trail
- Refunds create negative `payment_allocations` records
- Refund status tracked on enrollment (`paymentStatus: "refunded"`)

## Consolidated Family Payments

Parents can pay multiple children's installments in a single Stripe transaction:
- Installments grouped by due date
- Single PaymentIntent created for the combined total
- `payment_allocations` track how the payment is split across enrollments
- Future scheduled payments created proportionally by enrollment cost

## iOS/Safari Compatibility

- Stripe payments must include `return_url` for iOS redirect flow
- Date inputs use `fontSize: '16px'` to prevent Safari auto-zoom

## Payment Schedule Consistency

### Single Source of Truth: `calculateCheckoutBiweeklySchedule()`
The biweekly payment schedule MUST be calculated by a single shared function: `calculateCheckoutBiweeklySchedule()` in `server/lib/payment-calculator.ts`.

**Both of these code paths MUST use this function:**
1. `server/utils/cart-pricing.ts` → `calculatePaymentPlans()` — generates the schedule shown to the user on checkout
2. `server/services/stripe-payment-plans.ts` → `buildPaymentPhases()` — generates the actual payment phases charged to Stripe

### Schedule Calculation Rules
- First payment is ALWAYS collected today (immediately at enrollment)
- If the class starts in the future: today's payment + biweekly payments from class start to end
- If the class already started: biweekly payments from today to class end
- Total is divided evenly across ALL payments (including today's first payment)
- Final payment absorbs any rounding remainder

### Date Source Fallback Chain
When resolving class dates for schedule calculation:
1. **Enrollment dates** (`programStartDate` / `programEndDate`) — preferred, set during checkout
2. **Class dates** (via `storage.getClassById()`) — fallback if enrollment dates are null
3. **Variant dates** — override class dates when a `variantId` is specified
4. **Default 4-payment fallback** — last resort if no dates are available at all

### Enrollment Date Backfill
During checkout, if an existing pending enrollment is found without `programStartDate`/`programEndDate`, the checkout code backfills these from the class data. This prevents the payment processor from falling back to a different calculation path.

### Server-Side Guard
The frontend sends `expectedSchedule` (firstPaymentAmount + numberOfPayments from the cart snapshot) to the server. Before creating the PaymentIntent, the server recalculates the schedule and compares. If the amounts diverge by more than $0.02 or the payment count differs, the server returns a `409 PRICING_CHANGED` error, which triggers the client's auto-retry with refreshed data.

### Why This Matters
Previously, the cart display and payment processor used independent calculation logic with different date sources. This caused the user to see "5 payments of $1,035" but be charged "2 payments of $2,587.50 + $810.00". The shared helper eliminates this class of bug.

## Common Pitfalls

- **Financial report shows balance owed for a fully-paid family** → stale `scheduled_payments` records remain `pending` after enrollment balance reaches zero (sync is non-fatal and can silently fail) → use the auto-heal-at-read-time pattern from `asa-database-patterns`; always verify `effectiveBalance` using the `??` fallback before treating a record as outstanding
- **Parent Payments page shows `$0` outstanding while admin family-detail shows real balance** → parent-facing aggregation summed `enrollment.remainingBalance` (or used `COALESCE(remaining_balance, …)`), but Stripe-managed payment-plan rows intentionally store `remaining_balance = 0` (NOT NULL), so the parent silently sees `$0` while the admin view (which reads `effective_balance`) sees the real amount → **always** use the canonical helper `computeEffectiveBalance(totalCost, totalPaid, compAmountCents)` exported from `shared/schema.ts` as the fallback: `enrollment.effectiveBalance ?? computeEffectiveBalance(enrollment.totalCost ?? 0, enrollment.totalPaid ?? 0, enrollment.compAmountCents ?? 0)` (or query the `effective_balance` generated column in SQL). Never read `remainingBalance` for an outstanding-balance display, a cart line's authoritative balance, or the input to a PaymentIntent amount. Audited surfaces that must use this fallback include: `/api/cart/snapshot|calculate|validate` (`server/api/cart.ts`), the payment-intent creation path in `server/api/stripe.ts`, scheduled-payment outstanding lookups in `server/api/financial-reports.ts`, and the parent-side outstanding aggregation in `client/src/components/payments/PaymentManagement.tsx`. The same anti-pattern (`x ?? totalCost` or `COALESCE(remaining_balance, …)`) is what to grep for when adding new surfaces
- **Auto-pay double-charges a fully-paid enrollment** → scheduler processes any `pending` scheduled payment without checking enrollment balance first → always call `storage.getProgramEnrollmentById()` and verify `effectiveBalance <= 0` before the Stripe call; skip rather than charge on any lookup error (see `server/services/auto-pay-scheduler.ts`)
- **Comp leaves overdue installments on the books** → cancellation logic filters only `status = 'pending'`, missing `overdue` records → always filter `p.status === 'pending' || p.status === 'overdue'` when cancelling or reducing scheduled payments after a comp
- **Outstanding Balance card doesn't update after a credit-only payment** → payment success handler invalidated `/api/payment-history` and `/api/scheduled-payments` but missed `/api/parent/enrollments` → the Outstanding Balance card reads from the enrollment query; always include `["/api/parent/enrollments"]` in post-payment cache invalidation alongside the other payment query keys

## Best Practices

### Do
- Always store and calculate in cents — convert to dollars only for display
- Always validate against Stripe's $0.50 minimum before creating any payment plan
- Always create scheduled payments AFTER payment confirmation, never upfront
- Always include idempotency checks before creating scheduled payments
- Always allocate membership fee FIRST in combined biweekly payments
- Always use server-side pricing as the source of truth for cart totals
- Always validate promo codes server-side at checkout
- Always record comp/prorate audit fields (who, when, reason, original amount) on enrollment
- Always use `payment_allocations` for disbursement audit trail
- Always check for orphaned `scheduled_payments` when displaying admin views (filter out those with deleted enrollments)
- Always verify enrollment balance (using the `??` fallback from `asa-database-patterns`) before any off-session Stripe charge
- Always skip (never charge) when an enrollment balance lookup fails — a missed charge is recoverable, a double-charge is not

### Don't
- Don't trust client-side pricing or discount calculations
- Don't create PaymentIntents with amounts below $0.50 (50 cents)
- Don't modify `totalPaid` or `remainingBalance` on enrollments directly — let the payment flow update them.
  **Exception**: The `PATCH /api/admin/enrollments/:id/correct-balance` endpoint in `server/api/admin-enrollment-payment.ts`
  is the ONLY sanctioned code path that directly modifies `totalPaid`. It exists exclusively for admin-initiated
  data corrections (e.g., fixing webhook double-processing). Any other code path that writes `totalPaid` directly
  is a bug. Do not treat this endpoint as a general pattern for payment updates.
- Don't skip the Stripe payment confirmation step — always verify server-side
- Don't delete scheduled payments — use `cancelled` status instead
- Don't assume enrollment financial fields match Stripe — enrollment fields are the source of truth for display
- Don't use raw dollar values in any calculation or storage

### Stripe Integration Rules
- Use Replit's Stripe integration for API key management
- Stripe customer IDs stored on user records (`stripeCustomerId`)
- PaymentIntent metadata carries enrollment IDs, future phases, and discount snapshots
- Webhook handling for async payment events
- Always include `return_url` for iOS/Safari compatibility

## Key Files
- `server/lib/payment-calculator.ts` — shared payment schedule calculator (`calculateCheckoutBiweeklySchedule` is the single source of truth)
- `server/services/stripe-payment-plans.ts` — payment plan creation, phase building, scheduled payment creation
- `server/utils/cart-pricing.ts` — server-side cart pricing, discount calculation, membership fees
- `server/lib/prorate-calculator.ts` — proration date math
- `server/api/scheduled-payments.ts` — scheduled payment management endpoints
- `server/api/billing.ts` — billing and payment endpoints
- `server/api/enrollments.ts` — enrollment creation with payment confirmation
- `server/services/enrollmentReminderScheduler.ts` — payment reminder scheduling
- `shared/schema.ts` — `programEnrollments`, `scheduledPayments`, `payments`, `paymentAllocations`, `discounts`, `refunds` tables
