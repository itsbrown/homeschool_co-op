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
- **Membership fee priority disbursement**: When included in biweekly payments, membership amount is allocated FIRST from the total payment before enrollment amounts
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
`scheduled_payments` is a subset of reality — many enrollments have remaining balances with **no scheduled_payment records at all** (pre-scheduling-era enrollments, comped enrollments without sync). Always aggregate from `program_enrollments` directly:

**Wrong:**
```sql
SELECT SUM(amount) FROM scheduled_payments WHERE status = 'pending' AND school_id = $1
```

**Correct:**
```sql
SELECT COALESCE(SUM(COALESCE(remaining_balance, total_cost - total_paid)), 0)
FROM program_enrollments
WHERE school_id = $1
  AND status NOT IN ('cancelled', 'waitlist', 'withdrawn', 'failed', 'completed')
  AND COALESCE(remaining_balance, total_cost - total_paid) > 0
```

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

## Frontend Money Display Rules

### The Golden Rule
Any component that **displays a money amount must receive it from a server response** — never derive it by combining primitive fields (e.g. `price + membership.amount`, `subtotal - discount`, `amount - amountPaid`). Add this comment above every total display line:
```typescript
// SERVER-AUTHORITATIVE - never recalculate
```

### CartSnapshot — Authoritative Source During Checkout
`POST /api/cart/snapshot` returns `CartSnapshot` from `server/utils/cart-pricing.ts`. Once loaded, these are the only values that should appear in any checkout display:

| Field | Use for |
|-------|---------|
| `snapshot.totals.grandTotal` | Full order total before credits |
| `snapshot.totals.payableAmount` | Amount user actually pays (after credits) |
| `snapshot.credits.applied` | Credits deducted from this order |
| `snapshot.paymentPlans[n].amount` | First payment for a given plan |
| `snapshot.paymentPlans[n].numberOfPayments` | Payment count for a given plan |

In `CartCheckout.tsx`, the snapshot is fetched into `authoritativeData`. After that loads, **all totals must read from `authoritativeData`**, not from `cart.total`, `cart.membership?.amount`, or any local arithmetic.

### Pre-Snapshot Estimates (CartDrawer, CartContext)
`cart.total` in `CartContext` is intentionally client-side — it powers the cart badge count and drawer preview **before the server snapshot exists**. This is acceptable but must be clearly labelled:

```typescript
// CLIENT-SIDE ESTIMATE ONLY — for cart badge & drawer preview.
// Final authoritative totals come from CartSnapshot after checkout initiation.
const total = Math.max(0, subtotal - totalDiscountAmount);
```

In the cart drawer total display, always use "Estimated Total" (not "Total") and include a small disclaimer:
```tsx
<p className="text-xs text-muted-foreground">Estimated Total (before final review)</p>
<span className="font-bold">{formatCurrency(cart.total + (cart.membership?.amount || 0))}</span>
<small className="text-muted-foreground block">Final amount confirmed at checkout. Credits and discounts applied server-side.</small>
```

### `effectiveBalance` — Always Prefer Over Client Subtraction
Never compute a balance by subtracting fields:
```typescript
// WRONG — client-side arithmetic
const balance = Math.max(0, enrollment.amount - (enrollment.amountPaid ?? 0));

// CORRECT — server-computed field
const balance = enrollment.effectiveBalance ?? enrollment.remainingBalance ?? 0;
```
`effectiveBalance` is computed server-side as `totalCost - totalPaid - compAmountCents` and is always preferred. If it's absent (legacy records), fall back to `remainingBalance`. Never fall back to client subtraction.

### Credit Cap Display — Informational Only
Do not compute `Math.min(availableCredits, payment.amount)` for display and present it as the amount that will be charged. Instead:
- Show `payment.amount` as "Amount due" (server value)
- Show `availableCredits` as "Available credits" info text
- Let the server compute and validate the actual credit deduction on submit
- After a payment response, add a divergence check:
```typescript
if (response.creditsApplied !== localCreditPreview) {
  console.warn('[SERVER-AUTH] credit divergence:', { server: response.creditsApplied, local: localCreditPreview });
}
```

### Divergence Detection Pattern
Whenever a CartSnapshot loads, check whether the server total matches what was previously displayed locally:
```typescript
if (authoritativeData?.payableAmount !== undefined) {
  const clientCalc = cart.total + (cart.membership?.amount || 0);
  if (Math.abs(authoritativeData.payableAmount - clientCalc) > 1) {
    console.warn('[SERVER-AUTH] payableAmount divergence:', {
      server: authoritativeData.payableAmount,
      clientCalc,
      diff: authoritativeData.payableAmount - clientCalc,
    });
  }
}
```

### 409 Conflict Auto-Retry
When `POST /api/stripe/create-payment-intent` returns 409, the server provides authoritative values in `conflictData.authoritative`. The client auto-retries once using those values. After `MAX_RETRIES` (1), a conflict guard prevents infinite loops and shows a "Prices Updated — refresh your cart" error. See `client/src/pages/CartCheckout.tsx`.

## Common Pitfalls

- **Financial report shows balance owed for a fully-paid family** → stale `scheduled_payments` records remain `pending` after enrollment balance reaches zero (sync is non-fatal and can silently fail) → use the auto-heal-at-read-time pattern from `asa-database-patterns`; always verify `effectiveBalance` using the `??` fallback before treating a record as outstanding
- **Auto-pay double-charges a fully-paid enrollment** → scheduler processes any `pending` scheduled payment without checking enrollment balance first → always call `storage.getProgramEnrollmentById()` and verify `effectiveBalance <= 0` before the Stripe call; skip rather than charge on any lookup error (see `server/services/auto-pay-scheduler.ts`)
- **Comp leaves overdue installments on the books** → cancellation logic filters only `status = 'pending'`, missing `overdue` records → always filter `p.status === 'pending' || p.status === 'overdue'` when cancelling or reducing scheduled payments after a comp
- **Outstanding Balance card doesn't update after a credit-only payment** → payment success handler invalidated `/api/payment-history` and `/api/scheduled-payments` but missed `/api/parent/enrollments` → the Outstanding Balance card reads from the enrollment query; always include `["/api/parent/enrollments"]` in post-payment cache invalidation alongside the other payment query keys
- **Frontend shows wrong total after discount or credit applied** → component displays `cart.total + membership.amount` arithmetic after a CartSnapshot was already fetched → once `authoritativeData` exists, all totals must read from `authoritativeData.payableAmount`; the old client calculation should only serve as a pre-snapshot fallback
- **Balance display shows stale amount** → component uses `Math.max(0, enrollment.amount - enrollment.amountPaid)` fallback instead of `enrollment.effectiveBalance` → always prefer `effectiveBalance ?? remainingBalance ?? 0`; the client subtraction fallback silently ignores `compAmountCents` and other server-side adjustments

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
- Don't compute any money total on the frontend — display only values from server API responses or CartSnapshot; never add, subtract, or `Math.min`/`Math.max` raw price fields together for display
- Don't trust client-side pricing or discount calculations
- Don't create PaymentIntents with amounts below $0.50 (50 cents)
- Don't modify `totalPaid` or `remainingBalance` on enrollments directly — let the payment flow update them
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
