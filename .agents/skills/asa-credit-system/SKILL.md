---
name: asa-credit-system
description: Unified credit system covering volunteer, referral, achievement, marketing, manual, and fundraiser credits with admin approval, FIFO consumption, credit holds, and usage logging for the ASA Learning Platform. Use when working with credit creation, approval workflows, credit application to payments, balance calculations, or the fundraiser credit integration.
---

# ASA Credit System

## Core Rules

- **Unified ledger** — single `credits` table handles all credit types (volunteer, referral, achievement, marketing, manual, fundraiser)
- **All amounts in cents** — `creditAmountCents`, `usedAmountCents` are integers
- **Admin approval required** — credits start as `pending` and must be approved before use
- **FIFO consumption** — oldest approved credits are consumed first when applied to payments
- **Reserve-then-finalize pattern** — credits are held during checkout, finalized on success, released on failure
- **Payment integration** — credit consumption ties to Stripe payments; see `asa-payment-patterns` for checkout flow details

## Credit Types

| Type | Source | Typical Amount | Auto/Manual |
|------|--------|---------------|-------------|
| `volunteer` | Session volunteering | Hourly rate × minutes | Auto-created, admin-approved |
| `referral` | Referring new families | Fixed amount per signup | Auto-created on referral |
| `achievement` | Course completion, milestones | Varies | System-generated |
| `marketing` | Promotional campaigns | Fixed or percentage | Admin-created |
| `manual` | Admin discretionary | Any amount | Admin-created |
| `fundraiser` | Fundraiser product sales | Based on fundraiser rules | Auto-calculated |

## Credit Schema

```
credits:
  userId              → users.id (credit owner)
  schoolId            → schools.id (school context)
  creditType          → volunteer | referral | achievement | marketing | manual | fundraiser
  sourceType          → origin description (e.g., 'session_volunteer', 'referral_signup')
  sourceId            → FK to source record (polymorphic)
  creditAmountCents   → total credit value
  usedAmountCents     → how much has been consumed (0 initially)
  status              → pending | approved | rejected | partially_used | used | expired | revoked
  approvedBy          → admin who approved
  approvedAt          → approval timestamp
  rejectionReason     → why it was rejected
  expiresAt           → expiration date (set on approval, typically 1 year)
  title               → human-readable label
  description         → detailed description
  metadata            → JSONB for type-specific data
  notes               → admin notes
```

### Type-Specific Metadata
```json
// Volunteer credit
{ "minutesWorked": 120, "hourlyRateCents": 1500, "sessionId": 42, "sessionVolunteerId": 7 }

// Referral credit
{ "referredUserId": 123, "referralCode": "ABC123" }

// Achievement credit
{ "achievementType": "course_completion", "courseId": 5, "studentId": 88 }
```

## Credit Status Lifecycle

```
pending → approved → partially_used → used
                   → expired (past expiresAt)
       → rejected (admin denies)
approved → revoked (admin revokes)
```

### Status Definitions
| Status | Meaning |
|--------|---------|
| `pending` | Created, awaiting admin approval |
| `approved` | Approved, available for use |
| `rejected` | Admin denied the credit |
| `partially_used` | Some amount consumed, remainder available |
| `used` | Fully consumed |
| `expired` | Past expiration date, no longer usable |
| `revoked` | Admin revoked after approval |

## FIFO Consumption

When applying credits to a payment:
1. Query all `approved` or `partially_used` credits for the user at the school
2. Sort by `createdAt` ascending (oldest first)
3. Consume from each credit until payment is covered or credits exhausted
4. Update `usedAmountCents` on each consumed credit
5. Transition status: `approved` → `partially_used` or `used`
6. Log each consumption in `unified_credit_usage_logs`

### Available Balance Calculation
```typescript
availableBalance = SUM(creditAmountCents - usedAmountCents)
  WHERE status IN ('approved', 'partially_used')
  AND (expiresAt IS NULL OR expiresAt > NOW())
  AND userId = ? AND schoolId = ?
```

## Credit Holds (Checkout Reservation)

During checkout, credits are **reserved** (held) rather than immediately consumed:

```
credit_holds:
  userId              → users.id
  creditId            → credits.id
  amountCents         → held amount
  checkoutSessionId   → ties to the checkout flow
  status              → pending | finalized | released | expired
  expiresAt           → hold expiration (short TTL, e.g., 30 min)
```

### Hold Lifecycle
```
pending → finalized  (payment succeeds → hold becomes usage)
        → released   (payment fails/cancelled → hold released back to credit)
        → expired    (hold TTL exceeded → auto-released)
```

This prevents double-spending when a user has multiple checkout sessions.

## Credit Usage Logging

Every credit consumption is logged for audit:
```
unified_credit_usage_logs:
  creditId          → credits.id
  paymentHistoryId  → stripe_payment_history.id (which payment it was applied to)
  amountCents       → how much was consumed from this credit
  description       → human-readable description
```

## Volunteer Credit Integration

### Session Volunteering → Credit Creation
```
session_volunteers → tracks who volunteered at which class session
  volunteerId      → users.id
  sessionId        → class_sessions.id
  role             → aide | volunteer | substitute
  startTime/endTime → time tracking for hour calculation
  signedWaiverId   → waiver must be signed before volunteering
```

### Volunteer Credits Table (Legacy)
The older `volunteer_credits` table exists alongside the unified `credits` system:
```
volunteer_credits:
  userId, schoolId, sessionId, sessionVolunteerId
  hoursWorked, hourlyRateCents, creditAmountCents
  status → pending | approved | rejected | applied | expired
```
- Legacy `credit_usage_logs` table tracks usage from this system
- New code should use the unified `credits` table with `creditType: 'volunteer'`

## Common Pitfalls

- **Double-spending** → credits consumed without hold during checkout → always use the reserve-then-finalize pattern for checkout credit application
- **Expired credits still counted** → available balance includes expired credits → always filter by `expiresAt > NOW()` in balance queries
- **Wrong credit consumed** → newest credit used instead of oldest → always sort by `createdAt ASC` for FIFO ordering
- **Orphaned holds** → checkout abandoned but hold not released → implement hold expiration cleanup (check `expiresAt` on pending holds)
- **Legacy vs unified table confusion** → used `volunteer_credits` for new code → use `credits` table with `creditType: 'volunteer'` for all new development
- **Missing approval** → credit used while still `pending` → only query `approved` or `partially_used` credits for consumption

## Best Practices

### Do
- Always use the unified `credits` table for new credit creation — not the legacy `volunteer_credits`
- Always require admin approval before credits become usable — enforce `pending` → `approved` workflow
- Always use FIFO ordering (`createdAt ASC`) when consuming credits
- Always use the credit hold pattern during checkout to prevent double-spending
- Always log every credit consumption in `unified_credit_usage_logs` with the associated payment
- Always check `expiresAt` when calculating available balance
- Always set an expiration date when approving credits (typically 1 year from approval)

### Don't
- Don't consume credits that are still in `pending` status — only `approved` and `partially_used` are usable
- Don't skip the hold/reservation step during checkout — it prevents concurrent double-spending
- Don't use the legacy `volunteer_credits` table for new features — use the unified system
- Don't forget to release credit holds when payments fail or are cancelled
- Don't calculate credit balance without filtering expired credits
- Don't modify `usedAmountCents` directly — use the consumption logic that also creates usage logs

## Key Files
- `server/api/credits.ts` — credit CRUD, approval, balance, usage endpoints
- `shared/schema.ts` — `credits`, `creditHolds`, `unifiedCreditUsageLogs`, `volunteerCredits` (legacy), `creditUsageLogs` (legacy)
- `server/api/fundraisers.ts` — fundraiser credit integration
- `server/storage.ts` — credit-related storage methods
