---
name: asa-enrollment-classes
description: Enrollment workflows, class management, variant pricing, enrollment status transitions, duplicate prevention, and admin approval flows for the ASA Learning Platform. Use when working with enrollment creation, class creation, waitlists, enrollment cancellation, unenrollment logic, or class variant pricing.
---

# ASA Enrollment & Class Management

## Core Rules

- **Two enrollment tables**: `program_enrollments` for payment-tracked enrollments (marketplace + school), `school_class_enrollments` for school-managed enrollments without payment tracking
- **`classType` discriminator**: `"school_class"` uses `classId` → `school_classes.id`; `"marketplace"` uses `marketplaceClassId` → `classes.id`
- **Financial fields on enrollment are source of truth**: `totalCost`, `totalPaid`, `remainingBalance` — never recalculate from Stripe
- **Denormalized fields** (`childName`, `parentEmail`) must stay in sync with source records
- **All amounts in cents** — see `asa-payment-patterns` for financial rules and Stripe integration
- **Authentication** — all enrollment endpoints require auth; see `asa-auth-patterns` for middleware details

## Enrollment Status Lifecycle

```
pending_payment → enrolled           (after Stripe payment confirmed)
pending_payment → cancelled          (user cancels before paying)
pending_payment → failed             (payment fails)
pending_payment → pending_admin_approval → enrolled  (admin-gated enrollment)
enrolled        → completed          (class ends normally)
enrolled        → withdrawn          (mid-session withdrawal)
enrolled        → cancelled          (admin cancellation with refund)
waitlist        → enrolled           (spot opens up)
```

### Status Definitions
| Status | Meaning |
|--------|---------|
| `pending_payment` | Enrollment created, awaiting Stripe payment |
| `pending_admin_approval` | Payment received, admin must approve |
| `enrolled` | Active enrollment — student is in the class |
| `waitlist` | Class is full, student is queued |
| `cancelled` | Enrollment cancelled (pre-payment or admin) |
| `completed` | Class finished normally |
| `withdrawn` | Student left mid-session |
| `failed` | Payment failed or enrollment creation failed |

## Enrollment Creation Flow

1. Parent adds class to cart (creates `pending_payment` enrollment)
2. Server calculates pricing (see `asa-payment-patterns`)
3. Stripe PaymentIntent created and confirmed
4. Client calls `/api/enrollments/confirm` with `paymentIntentId` and `enrollmentIds`
5. Server verifies payment with Stripe
6. Status updated to `enrolled`
7. Scheduled payments created (if biweekly/custom plan)

### Duplicate Prevention
- Check `getEnrollmentsByChildId(childId)` before creating new enrollments
- Prevent same child from enrolling in same class+variant twice
- Bulk cancel endpoint validates ownership via parent's children list

## Unenrollment Flows

### User-Initiated (Pre-Payment)
- Endpoint: `DELETE /api/enrollments/:id/unenroll`
- Only allowed for `pending_payment` status
- Directly deletes the enrollment record
- Used when removing items from cart

### Admin-Initiated
- Endpoint: `DELETE /api/enrollments/:id`
- Can remove any enrollment regardless of status
- Deletes the enrollment record after verification

### Bulk Cancel (Cart Clear)
- Endpoint: `POST /api/enrollments/cancel-multiple`
- Validates all enrollment IDs belong to the authenticated parent's children
- Only cancels `pending_payment` enrollments
- Atomic transaction — all succeed or all fail

## Class Structure

### School Classes (`school_classes`)
```
school_classes:
  schoolId        → schools.id
  name            → class name
  description     → class description
  schedule        → JSON with variants structure
  startDate       → class start date
  endDate         → class end date
  maxStudents     → enrollment cap per variant
  instructorId    → users.id (assigned educator)
```

### Variant Pricing
Classes use a JSON `schedule` field with a **variants** structure supporting multi-variant pricing:
```json
{
  "variants": [{
    "name": "Morning Session",
    "startTime": "09:00",
    "endTime": "12:00",
    "days": ["Monday", "Wednesday", "Friday"],
    "price": 30000,
    "maxStudents": 15
  }]
}
```
- Each variant can have its own price (in cents) and enrollment cap
- `variantId` on `program_enrollments` tracks which variant the student enrolled in
- Display schedule with `formatClassSchedule()` from `@/lib/utils`

### Unified Classes Table (`classes`)
A separate `classes` table consolidates marketplace and school admin classes with a `type` discriminator (`"marketplace"` | `"school_admin"`).

## Comp & Prorate on Enrollments

### Comp (Admin Discount)
Admins can apply a comp percentage to reduce enrollment cost:
```
compPercentage → 0-100
compAmountCents → calculated discount in cents
compReason → admin's justification
compBy → admin user ID
compAt → timestamp
```

### Prorate (Mid-Session)
Mid-session enrollments are prorated based on remaining class days:
```
proratedFromCents → original full price
proratePercentage → 0-100 (% of class remaining)
prorateDate → when proration was calculated
prorateBy → admin or system
prorateReason → explanation
```
Calculator: `server/lib/prorate-calculator.ts` — see `asa-payment-patterns` for details.

## Common Pitfalls

- **Wrong enrollment table** → used `school_class_enrollments` for a payment-tracked enrollment → use `program_enrollments` (it has financial fields)
- **Stale denormalized fields** → `childName` or `parentEmail` on enrollment doesn't match source → update denormalized fields when parent/child records change
- **Cancelling paid enrollments via user endpoint** → user unenroll only works for `pending_payment` → use admin endpoint for paid enrollments with proper refund flow
- **Missing variant context** → enrollment created without `variantId` when class has multiple variants → always capture variant selection from cart
- **Orphaned scheduled payments** → enrollment deleted but `scheduled_payments` remain → filter orphaned records from admin views (see `asa-database-patterns`)

## Best Practices

### Do
- Always verify enrollment ownership before allowing unenrollment — check parent's children list
- Always use `program_enrollments` for any enrollment that involves payment tracking
- Always check for duplicate enrollments (same child + class + variant) before creating new ones
- Always use atomic transactions for bulk enrollment operations (cancel-multiple)
- Always capture `variantId` when enrolling in a multi-variant class
- Always update `totalPaid` and `remainingBalance` through the payment flow, never directly

### Don't
- Don't allow user-initiated unenrollment for any status other than `pending_payment`
- Don't delete paid enrollments without processing refunds first
- Don't recalculate financial fields from Stripe — enrollment fields are authoritative
- Don't create enrollments without a valid `schoolId` — multi-tenant isolation requires it
- Don't skip the Stripe payment verification step in the confirm endpoint
- Don't assume `classId` is always set — marketplace enrollments use `marketplaceClassId` instead

## Key Files
- `server/api/enrollments.ts` — enrollment CRUD, confirm, unenroll, bulk cancel
- `server/api/admin-enrollment-payment.ts` — admin payment management for enrollments
- `server/api/classes.ts` — class creation and management
- `server/api/admin-classes.ts` — admin class management endpoints
- `server/lib/prorate-calculator.ts` — proration date math
- `server/utils/cart-pricing.ts` — pricing calculations for enrollments
- `shared/schema.ts` — `programEnrollments`, `schoolClassEnrollments`, `schoolClasses`, `classes` tables
- `client/src/contexts/CartContext.tsx` — cart state with enrollment creation
