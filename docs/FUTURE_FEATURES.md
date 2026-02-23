# Future Features

This document contains fully designed features ready for implementation. Each feature includes architecture decisions, implementation plans, edge cases, and safeguards identified during the design phase.

---

## Table of Contents

- [F001: Session-Based Enrollment Transition](#f001-session-based-enrollment-transition)

---

## F001: Session-Based Enrollment Transition

**Status:** Designed, not yet implemented
**Priority:** Major architectural shift
**Estimated Scope:** 10 phases, 20 tasks
**Design Date:** February 2026

### Overview

Transition from class-level pricing/enrollment to session-based enrollment with half-day/full-day options. Sessions (e.g., "Fall 2026", "Spring 2027") become the primary unit of enrollment and pricing. Children are enrolled in a session with a day type (half-day or full-day), and auto-assigned to classes after first payment.

### Motivation

- Parents think in terms of sessions, not individual classes
- Half-day vs full-day is the primary pricing decision
- Families need bundled payment plans across multiple children and sessions
- Mid-session upgrades/downgrades (half-day to full-day) are a common real-world need
- Current class-level pricing doesn't naturally support these workflows

### Backward Compatibility

The system uses a version flag to support both enrollment paths simultaneously:
- `enrollmentVersion: 'v1'` — existing class-based enrollment (unchanged)
- `enrollmentVersion: 'v2'` — new session-based enrollment

Schools opt in via a `sessionModeEnabled` toggle. When disabled, everything works exactly as it does today. Standalone class enrollment (camps, workshops, one-off classes) continues to work via v1 regardless of the toggle.

---

### Current System Summary

#### How Pricing Works Today
- Each class has a `price` field (in cents)
- Cart items reference a `classId` and optionally a `variantId`
- Server looks up the price from the database — the client never sends a price
- `calculateCartPricing()` in `server/utils/cart-pricing.ts` handles all pricing logic
- `calculateCartSnapshot()` produces an HMAC-signed snapshot (server-authoritative)
- At checkout, the server verifies the HMAC checksum before creating a Stripe PaymentIntent

#### How Enrollment Works Today
- `programEnrollments` table tracks all enrollments
- Each enrollment links to a class via `classId` or `marketplaceClassId`
- Financial fields: `totalCost`, `totalPaid`, `remainingBalance`
- Payment plans: full, deposit, biweekly (per-enrollment)
- Scheduled payments tied to individual enrollments

#### How Membership Works Today
- Schools set `membershipRequired` and `membershipFeeAmount` on the school record
- At checkout, `calculateCartSnapshot()` checks if the parent has an active membership for the year
- If not paid, membership fee is added to the cart total automatically
- In biweekly plans, membership is allocated first from payments (priority disbursement)
- Membership is school-level and checkout-level — not class-level. It works with session enrollment as-is with minimal changes.

#### How Discounts Work Today
- 19+ discount types in the `discounts` table
- Filters: `applicableToClasses`, `applicableToCategories`, `applicableToGradeLevels`
- Types: percentage, fixed_amount, bundle rules
- Automatic, manual, and promo code application methods
- Sibling discounts, "free after X children" threshold, role-based eligibility

#### Key Files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | All database schemas (programEnrollments, sessions, classes, discounts, etc.) |
| `server/utils/cart-pricing.ts` | Cart pricing calculation, discount application, snapshot generation |
| `server/lib/calculateCartSnapshot.ts` | HMAC-signed canonical snapshot for server-authoritative pricing |
| `server/lib/payment-calculator.ts` | Date-based payment schedule calculation |
| `server/lib/splitIntegerEvenly.ts` | Distributes cents across installments without rounding errors |
| `server/services/stripe-payment-plans.ts` | Stripe PaymentIntent creation and scheduled payment management |
| `server/api/session-enrollments.ts` | Existing session enrollment endpoint (basic, needs extension) |
| `server/api/stripe.ts` | Checkout and payment processing |
| `server/services/PaymentProcessorService.ts` | Payment processing service |
| `client/src/pages/CartCheckout.tsx` | Frontend checkout page |
| `client/src/contexts/CartContext.tsx` | Frontend cart state management |

---

### Architecture Decisions

#### 1. Extend Existing CartItem (Not a Separate Type)
Session items use the same `CartItem` interface with optional `sessionId` and `dayType` fields. This means the entire discount, pricing, and checkout pipeline works for both class and session items without forking.

#### 2. Price Pair Locking
When a parent enrolls in a session, BOTH the half-day and full-day prices at that moment are stored on the enrollment record (`enrolledHalfDayPrice`, `enrolledFullDayPrice`). If the parent later upgrades from half-day to full-day, the cost difference uses the locked prices — not whatever the school has since changed the session price to. This is fair and predictable for both parties.

#### 3. Family Payment Plans as a New Entity
Bundled family plans need their own table (`familyPaymentPlans`) rather than trying to stretch per-enrollment payment plans. A family plan aggregates multiple enrollments into one combined payment schedule. Each enrollment links to the plan via `familyPlanId`.

#### 4. Credits Separate from Enrollment Cost
`totalCost` on an enrollment always equals the full session price. Credits reduce the `payableAmount` at checkout but don't change the enrollment's cost. This means upgrade/downgrade math always uses the real prices, and credits don't create phantom discounts.

#### 5. Server-Authoritative Pricing Preserved
The same HMAC-signed snapshot flow applies to session items. The client sends `{ sessionId, childId, dayType }` — the server looks up the price, calculates everything, signs it. No price information comes from the client.

---

### Preventive Safeguards

Six safeguards identified during design to prevent financial errors:

#### Safeguard 1: Price Pair Lock on Enrollment
**Problem:** If a school changes session prices after a parent enrolls, upgrades/downgrades could use the wrong price.
**Solution:** Store both `enrolledHalfDayPrice` and `enrolledFullDayPrice` on the enrollment at checkout time. All subsequent price calculations (upgrades, downgrades, refunds) use these locked values.
**Implemented in:** T001 (schema), T012 (enrollment API), T015 (checkout)

#### Safeguard 2: Plan-Level Locking for Family Plans
**Problem:** Two simultaneous changes to a family plan (e.g., Mom upgrades Child A while Dad downgrades Child B) could corrupt the payment schedule.
**Solution:** `lockedAt`/`lockedBy` fields on `familyPaymentPlans`. `acquireFamilyPlanLock()` prevents concurrent recalculations. Lock auto-expires after 5 minutes as a deadlock safety net.
**Implemented in:** T002 (schema), T005 (storage), T010 (family plan service), T011 (upgrade service)

#### Safeguard 3: Recalculate from Total Minus Already Paid
**Problem:** Adjusting remaining installments by just the price difference can accumulate rounding errors or miss payments.
**Solution:** Always recalculate as `newRemainingBalance = newTotal - totalAlreadyPaid`. Then redistribute remaining balance across remaining dates using `splitIntegerEvenly()`.
**Implemented in:** T006 (storage method), T010 (family plan recalculation)

#### Safeguard 4: Snapshot TTL and Regeneration
**Problem:** A parent opens their cart, a school admin changes prices, and the parent checks out with stale prices.
**Solution:** Cart snapshots include an `expiresAt` field (5-minute TTL). At checkout, the server rejects expired snapshots and forces regeneration with current prices before the client confirms.
**Implemented in:** T007 (cart pricing), T008 (canonical snapshot), T015 (checkout validation)

#### Safeguard 5: Price History Audit Trail
**Problem:** After multiple upgrades/downgrades, refund calculations become impossible without knowing the full history.
**Solution:** `enrollmentPriceHistory` table logs every price change with old/new prices, day types, proration details, who made the change, and when. Refund calculator uses total amount paid to date minus prorated value consumed.
**Implemented in:** T003 (schema), T006 (storage), T011 (upgrade service), T015 (initial entry at checkout)

#### Safeguard 6: Credits Separate from Cost
**Problem:** If credits reduce `totalCost`, upgrade math gives the parent a double benefit from the credit.
**Solution:** `totalCost` on enrollment = full session price, always. Credits tracked separately in `payment_allocations`. Upgrade/downgrade math uses `totalCost` values, not payment amounts.
**Implemented in:** T011 (upgrade service), T015 (checkout)

---

### Edge Cases and Scenarios

#### Scenario 1: Price Race Condition on Upgrades
Parent enrolled in Fall half-day at $300. Admin changes full-day from $500 to $600. Parent upgrades.
**Resolution:** Upgrade uses locked `enrolledFullDayPrice` ($500), not current price ($600). Prorated difference = ($500 - $300) * (remaining days / total days).

#### Scenario 2: Concurrent Family Plan Changes
Mom requests upgrade for Child A, Dad requests downgrade for Child B simultaneously.
**Resolution:** First request acquires lock, processes, releases. Second request either waits or gets a "plan is being recalculated, try again shortly" response.

#### Scenario 3: Partial Payment + Upgrade
Family is $200 into an $800 biweekly plan. Child A upgrades from half-day ($300) to full-day ($500). New total = $1,000.
**Resolution:** `newRemainingBalance = $1,000 - $200 = $800`. Redistributed evenly across remaining installment dates.

#### Scenario 4: Stale Cart Snapshot
Parent opens cart, snapshot generated. 10 minutes later, they click checkout.
**Resolution:** Server sees snapshot `createdAt` is >5 minutes old. Regenerates snapshot with current prices. Returns new snapshot for client to display and confirm before charging.

#### Scenario 5: Refund After Multiple Changes
Child starts half-day ($300), upgrades to full-day ($500, paid $200 difference), then cancels mid-session.
**Resolution:** Price history shows all changes. Refund = total paid to date - prorated value of time consumed. All entries in `enrollmentPriceHistory` are used for accurate calculation.

#### Scenario 6: Credits Applied Before Upgrade
Parent used $50 in credits toward initial half-day enrollment ($300). Upgrades to full-day ($500).
**Resolution:** Upgrade cost = $500 - $300 = $200 (full prices, not credited prices). The $50 credit is already tracked separately in payment allocations and doesn't affect upgrade math.

#### Scenario 7: Session Mode Toggle During Active Enrollments
Admin enables session mode mid-year. Existing class enrollments are already in progress.
**Resolution:** Existing enrollments stay as `enrollmentVersion: 'v1'` and continue working unchanged. New session enrollments are `v2`. Both coexist. Admin dashboard shows both types.

#### Scenario 8: Membership Check on Session Enrollment
Parent enrolls in a session for the first time. Haven't paid membership.
**Resolution:** Same checkout flow — `calculateCartSnapshot()` checks membership status at the school level. Session items go through the same cart, so membership is auto-included. No changes needed to membership logic.

---

### Implementation Plan

#### Phase 1: Schema Foundation

##### T001: Extend `programEnrollments` Schema for Session Enrollment
- **Blocked By:** None
- **Details:**
  - Add to `programEnrollments` in `shared/schema.ts`:
    - `enrollmentVersion`: text enum `'v1' | 'v2'` (default `'v1'`)
    - `dayType`: text enum `'half_day' | 'full_day'` (nullable, for v2 only)
    - `enrolledHalfDayPrice`: integer (nullable) — SAFEGUARD 1
    - `enrolledFullDayPrice`: integer (nullable) — SAFEGUARD 1
    - `familyPlanId`: integer (nullable, FK to `familyPaymentPlans`)
  - Update insert/update schemas and types
  - Files: `shared/schema.ts`
  - Acceptance: `npm run db:push` succeeds; existing enrollments unaffected (new fields nullable)

##### T002: Create `familyPaymentPlans` Table
- **Blocked By:** None
- **Details:**
  - New table in `shared/schema.ts`:
    - `id`: serial PK
    - `schoolId`: integer FK to schools
    - `parentId`: integer FK to users
    - `totalAmountCents`: integer
    - `totalPaidCents`: integer (default 0)
    - `remainingBalanceCents`: integer
    - `paymentFrequency`: text enum (weekly/biweekly/monthly/one_time)
    - `status`: text enum (active/completed/cancelled/recalculating)
    - `lockedAt`: timestamp (nullable) — SAFEGUARD 2
    - `lockedBy`: text (nullable) — SAFEGUARD 2
    - `stripeSubscriptionId`: text (nullable)
    - `metadata`: jsonb
    - `createdAt`, `updatedAt`: timestamps
  - Add insert schema, types, and relation to `programEnrollments`
  - Files: `shared/schema.ts`
  - Acceptance: `npm run db:push` succeeds; new table created

##### T003: Create `enrollmentPriceHistory` Audit Table
- **Blocked By:** None
- **Details:**
  - SAFEGUARD 5 — tracks every price change on an enrollment
  - New table in `shared/schema.ts`:
    - `id`: serial PK
    - `enrollmentId`: integer FK to programEnrollments
    - `changeType`: text enum ('initial' | 'upgrade' | 'downgrade' | 'proration' | 'admin_adjustment')
    - `previousDayType`: text (nullable)
    - `newDayType`: text (nullable)
    - `previousPriceCents`: integer
    - `newPriceCents`: integer
    - `differenceCents`: integer (positive = parent owes more, negative = refund due)
    - `proratedDays`: integer (nullable)
    - `totalDaysInSession`: integer (nullable)
    - `effectiveDate`: date
    - `changedBy`: integer FK to users
    - `reason`: text (nullable)
    - `metadata`: jsonb
    - `createdAt`: timestamp
  - Files: `shared/schema.ts`
  - Acceptance: `npm run db:push` succeeds; table created

##### T004: Add `sessionModeEnabled` to Schools Table
- **Blocked By:** None
- **Details:**
  - Add `sessionModeEnabled` boolean (default `false`) to `schools` table
  - Controls whether school uses session-based enrollment vs class-based
  - Files: `shared/schema.ts`
  - Acceptance: `npm run db:push` succeeds; existing schools default to `false`

---

#### Phase 2: Storage Layer

##### T005: Add Storage Methods for Family Payment Plans
- **Blocked By:** T002
- **Details:**
  - Add to `IStorage` interface and `dbStorage.ts`:
    - `createFamilyPaymentPlan(data)` — create new plan
    - `getFamilyPaymentPlan(id)` — fetch by ID
    - `getFamilyPaymentPlansByParent(parentId, schoolId)` — fetch active plans
    - `updateFamilyPaymentPlan(id, data)` — update fields
    - `acquireFamilyPlanLock(planId, operationId)` — SAFEGUARD 2: sets lock if not already locked (5-min auto-expire)
    - `releaseFamilyPlanLock(planId, operationId)` — clears lock if `lockedBy` matches
  - Files: `server/storage.ts`, `server/dbStorage.ts`
  - Acceptance: Methods compile; locking prevents concurrent recalculations

##### T006: Add Storage Methods for Price History
- **Blocked By:** T003
- **Details:**
  - Add to `IStorage` interface and `dbStorage.ts`:
    - `createPriceHistoryEntry(data)` — insert audit record
    - `getPriceHistory(enrollmentId)` — fetch all changes, ordered by date
    - `getTotalPaidForEnrollment(enrollmentId)` — SAFEGUARD 3: sums all completed payments
  - Files: `server/storage.ts`, `server/dbStorage.ts`
  - Acceptance: Methods compile and return correct types

---

#### Phase 3: Cart System Extension

##### T007: Extend CartItem and Cart Pricing for Session Items
- **Blocked By:** T001, T004
- **Details:**
  - Extend `CartItem` interface in `server/utils/cart-pricing.ts`:
    - Add `sessionId?: number` and `dayType?: 'half_day' | 'full_day'`
  - Update `calculateCartPricing()`:
    - If `sessionId` present, look up price from `sessions` table using `dayType`
    - If `classId` present (no sessionId), use existing class price logic
    - Both paths feed into the same discount/total calculation
  - SAFEGUARD 4: Add `expiresAt` field to `CartSnapshot` (5-minute TTL)
  - Files: `server/utils/cart-pricing.ts`
  - Acceptance: Cart prices both class and session items; snapshot includes expiry

##### T008: Extend Canonical Snapshot for Session Items
- **Blocked By:** T007
- **Details:**
  - Update `CanonicalCartItem` in `server/lib/calculateCartSnapshot.ts`:
    - Add optional `sessionId` and `dayType` fields
  - Update `CanonicalSnapshot` version to `'2'` (keep `'1'` for backward compat)
  - Checksum includes session fields when present
  - SAFEGUARD 4: Add expiry validation in `verifyChecksum()` — reject if >5 minutes old
  - Files: `server/lib/calculateCartSnapshot.ts`
  - Acceptance: HMAC works for both v1 and v2 snapshots; expired snapshots rejected

---

#### Phase 4: Payment System Extension

##### T009: Extend Payment Calculator for Session Dates
- **Blocked By:** T001
- **Details:**
  - Update `calculatePaymentSchedule()` in `server/lib/payment-calculator.ts`:
    - Accept optional `sessionStartDate`/`sessionEndDate`
    - Use session dates for payment schedule when provided
  - Update `calculatePaymentPlans()` in `server/utils/cart-pricing.ts`:
    - For session items, pull dates from session record instead of class
  - Files: `server/lib/payment-calculator.ts`, `server/utils/cart-pricing.ts`
  - Acceptance: Biweekly schedules correctly calculated from session date ranges

##### T010: Create Family Plan Payment Service
- **Blocked By:** T002, T005, T009
- **Details:**
  - New service `server/services/family-payment-plans.ts`:
    - `createFamilyPlan(parentId, schoolId, enrollmentIds, frequency)`:
      - Sums `totalCost` across all enrollments
      - Creates `familyPaymentPlans` record
      - Generates combined payment schedule
      - Links enrollments via `familyPlanId`
    - `recalculateFamilyPlan(planId, triggerEnrollmentId, changeType)`:
      - SAFEGUARD 2: Acquires plan lock first; rejects if locked
      - SAFEGUARD 3: `newRemainingBalance = newTotal - totalAlreadyPaid`
      - Redistributes using `splitIntegerEvenly()`
      - Updates Stripe subscription if applicable
      - Releases lock when done
    - `allocatePaymentToEnrollments(paymentAmount, planId)`:
      - Proportional distribution across enrollments
      - Records in `payment_allocations` table
  - Files: `server/services/family-payment-plans.ts`
  - Acceptance: Creation and recalculation work; concurrent recalculations blocked

---

#### Phase 5: Upgrade/Downgrade System

##### T011: Create Session Upgrade/Downgrade Service
- **Blocked By:** T001, T003, T005, T006, T010
- **Details:**
  - New service `server/services/session-upgrade-service.ts`:
    - `calculateUpgradeDowngrade(enrollmentId, newDayType)`:
      - SAFEGUARD 1: Reads `enrolledHalfDayPrice`/`enrolledFullDayPrice` from enrollment (NOT current session prices)
      - Calculates prorated difference based on remaining days
      - Returns `{ priceDifference, proratedAmount, remainingDays, totalDays }`
    - `executeUpgradeDowngrade(enrollmentId, newDayType, userId)`:
      - Validates change (can't upgrade to same type)
      - SAFEGUARD 5: Creates `enrollmentPriceHistory` entry
      - Updates enrollment `dayType`, `totalCost`, `remainingBalance`
      - SAFEGUARD 6: Math uses `totalCost` (full price), not credited amount
      - If family plan: triggers `recalculateFamilyPlan()`
      - If standalone: creates Stripe PaymentIntent (upgrade) or refund (downgrade)
  - Files: `server/services/session-upgrade-service.ts`
  - Acceptance: Uses locked prices; history recorded; family plan recalculated

---

#### Phase 6: API Routes

##### T012: Update Session Enrollment API
- **Blocked By:** T001, T007
- **Details:**
  - Update `server/api/session-enrollments.ts`:
    - Set `enrollmentVersion: 'v2'` on created enrollments
    - Set `dayType` from the variant field
    - SAFEGUARD 1: Store both `enrolledHalfDayPrice` and `enrolledFullDayPrice` from session at enrollment time
  - Files: `server/api/session-enrollments.ts`
  - Acceptance: New session enrollments have v2 flag, dayType, and both locked prices

##### T013: Create Upgrade/Downgrade API Routes
- **Blocked By:** T011
- **Details:**
  - Add to `server/api/session-enrollments.ts`:
    - `POST /api/session-enrollments/:id/upgrade-preview` — preview price difference
    - `POST /api/session-enrollments/:id/change-day-type` — execute the change
    - Both require authentication (parent of enrollment or school admin)
  - Files: `server/api/session-enrollments.ts`
  - Acceptance: Preview returns accurate prorated amount; execution updates enrollment

##### T014: Create Family Payment Plan API Routes
- **Blocked By:** T010
- **Details:**
  - New file `server/api/family-plans.ts`:
    - `POST /api/family-plans` — create bundled plan
    - `GET /api/family-plans/:id` — plan details with linked enrollments
    - `GET /api/family-plans` — list parent's active plans
    - `POST /api/family-plans/:id/recalculate` — admin-triggered recalculation
  - Register routes in `server/routes.ts`
  - Files: `server/api/family-plans.ts`, `server/routes.ts`
  - Acceptance: CRUD works; plan creation links enrollments

---

#### Phase 7: Checkout Flow Integration

##### T015: Update Checkout to Support Session Items and Family Plans
- **Blocked By:** T008, T010, T012
- **Details:**
  - Update checkout handler:
    - SAFEGUARD 4: Verify snapshot within 5 minutes; regenerate if expired
    - For session items, create enrollments with v2 fields
    - If multiple session enrollments with biweekly, offer family plan option
    - When family plan selected, route through `createFamilyPlan()`
    - SAFEGUARD 1: Capture both prices on enrollment
    - SAFEGUARD 5: Create initial `enrollmentPriceHistory` entry (`changeType: 'initial'`)
    - SAFEGUARD 6: Credits reduce `payableAmount`, `totalCost` stays at full price
  - Files: `server/api/stripe.ts`, `server/api/enrollments.ts`
  - Acceptance: Checkout creates correct enrollments with all safeguards; family plans created when bundled

---

#### Phase 8: Discount System Compatibility

##### T016: Extend Discount System for Session Items
- **Blocked By:** T007
- **Details:**
  - Update `discounts` schema:
    - Add `applicableToSessions`: integer array (nullable)
    - Add `applicableToDayTypes`: text array (nullable)
  - Update discount application in `server/utils/cart-pricing.ts`:
    - Check `applicableToSessions` and `applicableToDayTypes` for session items
    - Sibling discount: works naturally (multiple children = sibling)
    - "Free after X" threshold: counts session enrollments toward threshold
    - Bundle discounts: session items as eligible bundle targets
  - Files: `shared/schema.ts`, `server/utils/cart-pricing.ts`
  - Acceptance: All 19+ discount types work with session items

---

#### Phase 9: Frontend

##### T017: Session Enrollment Page for Parents
- **Blocked By:** T012, T014
- **Details:**
  - Parent-facing session enrollment page:
    - Available sessions with half-day/full-day prices
    - Multi-child selection
    - Day type selection per child (or bulk)
    - "Add to Cart" flow for session cart items
    - Family plan option when 2+ session items in cart
  - Files: `client/src/pages/SessionEnrollment.tsx`, `client/src/App.tsx`
  - Acceptance: Parents can browse sessions, select children/day types, add to cart

##### T018: Upgrade/Downgrade UI for Parents
- **Blocked By:** T013
- **Details:**
  - Add to enrollment detail view:
    - Current day type and price
    - "Change to [full_day/half_day]" button
    - Preview dialog with prorated cost difference
    - Shows locked prices so parent sees original rate
  - Files: `client/src/pages/children/ChildEnrollmentsPage.tsx` or new component
  - Acceptance: Parents preview and execute day type changes accurately

##### T019: Family Payment Plan Management UI
- **Blocked By:** T014
- **Details:**
  - Payment plan dashboard:
    - Combined plan with linked enrollments
    - Payment schedule with dates and amounts
    - Payment history per enrollment
    - Status indicators
  - Files: `client/src/pages/PaymentPlanPage.tsx` (extend) or new component
  - Acceptance: Parents see bundled plan with clear breakdown

---

#### Phase 10: Admin Tools

##### T020: School Admin Session Mode Toggle and Management
- **Blocked By:** T004, T016
- **Details:**
  - Session mode toggle in school settings
  - Session management alongside class management
  - View v1 vs v2 enrollments
  - Price history viewer for any enrollment
  - Family plan overview
  - Files: `client/src/pages/SchoolSettings.tsx`, admin dashboard components
  - Acceptance: Admin can toggle session mode, view mixed types, see price history

---

### Safeguard Summary

| # | Safeguard | Tasks | How It Works |
|---|-----------|-------|--------------|
| 1 | Price pair lock | T001, T012, T015 | Both `enrolledHalfDayPrice` and `enrolledFullDayPrice` stored at checkout; upgrade/downgrade uses these, not current session prices |
| 2 | Plan-level locking | T002, T005, T010, T011 | `lockedAt`/`lockedBy` on `familyPaymentPlans`; `acquireFamilyPlanLock()` prevents concurrent recalculations; 5-min auto-expire |
| 3 | Recalculate from total | T006, T010 | `newRemainingBalance = newTotal - getTotalPaidForEnrollment()`; never adjusts by just the difference |
| 4 | Snapshot TTL | T007, T008, T015 | `expiresAt` on CartSnapshot (5-min TTL); checkout rejects expired snapshots and forces regeneration |
| 5 | Price history audit | T003, T006, T011, T015 | `enrollmentPriceHistory` logs every change with old/new prices, proration details, who and when |
| 6 | Credits separate | T011, T015 | `totalCost` = full session price always; credits in `payment_allocations`; upgrade math uses `totalCost` |

---

### Task Dependency Graph

```
T001 ──┬──────────────── T007 ── T008 ── T015
       │                   │       │
       ├── T009 ──┐        │       │
       │          ├── T010 ┘       │
T002 ──┤          │                │
       └── T005 ──┤                │
                  └── T011 ── T013 ── T018
T003 ── T006 ──────────┘
T004 ──────────────────── T016 ── T020

T012 ── T017
T014 ── T019
T010 ── T014
```

Independent starting tasks (no blockers): T001, T002, T003, T004
