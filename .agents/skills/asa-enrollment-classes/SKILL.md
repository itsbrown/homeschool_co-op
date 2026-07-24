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
- Only allowed for `pending_payment` status; verifies enrollment belongs to authenticated parent's children
- Deletes pending `scheduled_payments` for the enrollment, then deletes `program_enrollments` (FK-safe)
- `CombinedStorage.deleteProgramEnrollment` must not fall back to mem-only delete when Postgres fails (would show success but list still reads from DB)
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

## QR Clock-In & Teacher Attendance

School admins generate a one-time QR code for a session; the educator scans it on `QrScanPage` to clock in and start the session.

### Token Generation
- **Endpoint**: `POST /api/school-admin/sessions/:sessionId/generate-qr`
- Auth: `supabaseAuth` — caller must have `schoolAdmin` or `superAdmin` role with a `schoolId`
- Generates a 32-byte hex token stored in `class_sessions.qrToken` and `class_sessions.qrTokenExpiresAt`
- Expiry is set to 15 minutes after the session's scheduled end time
- File: `server/api/school-admin.ts`

### QR Scan Page Flow (`client/src/pages/QrScanPage.tsx`)
1. Page mounts at `/qr-scan/:token` (unauthenticated route)
2. Queries `GET /api/public/session-by-qr/:token` to load session metadata (`SessionInfo`)
3. If educator is not logged in, shows a login prompt with a `returnTo` redirect
4. Once authenticated, the educator clicks "Clock In & Start Session"
5. Calls `POST /api/educator/sessions/:sessionId/teacher-checkin` with `{ qrToken, latitude?, longitude? }`
6. On success, session status transitions to `in_progress`, `actualStartTime` is recorded, and the `AttendanceTracker` component becomes active

### Teacher Check-In Endpoint (`POST /api/educator/sessions/:id/teacher-checkin`)
- Located in `server/api/educator.ts`
- Validates that `qrToken` matches `class_sessions.qrToken` for the given session
- Validates token is not expired (`qrTokenExpiresAt`)
- Only the `educatorId` or `substituteEducatorId` on the session may clock in
- Session must be in `scheduled` status — already `in_progress` or `completed` sessions are rejected
- **Geofence check**: if school has `latitude`, `longitude`, and `geofenceRadiusMeters` configured, the Haversine distance from the educator's reported coordinates is compared against `geofenceRadiusMeters` (default `150` meters). Result stored in `checkInLocationVerified` (true/false/null)
- **One-time token consumption**: after successful check-in, `qrToken` and `qrTokenExpiresAt` are set to `null` so the token cannot be reused
- Updates recorded on `class_sessions`: `status = 'in_progress'`, `actualStartTime`, `checkInLatitude`, `checkInLongitude`, `checkInLocationVerified`
- Creates an audit log entry with action type `teacher_qr_clockin`

### `class_sessions` Schema Fields (QR & Check-In)
```
qrToken              → text — one-time token, cleared after use
qrTokenExpiresAt     → timestamp — when the token expires
actualStartTime      → timestamp — when educator clicked clock-in
checkInLatitude      → double precision — educator GPS latitude at check-in
checkInLongitude     → double precision — educator GPS longitude at check-in
checkInLocationVerified → boolean — whether location was within geofence radius
```

### Key Files
- `server/api/school-admin.ts` — QR token generation endpoint
- `server/api/educator.ts` — teacher check-in endpoint and `qr-checkin` endpoint
- `client/src/pages/QrScanPage.tsx` — educator-facing QR scan and clock-in UI
- `client/src/components/educator/AttendanceTracker.tsx` — attendance roster shown after clock-in
- `shared/schema.ts` — `classSessions` table with QR and check-in fields

## Active Enrollment Status Rule for Educator Views

When building any educator-facing student list (e.g., "My Students"), always filter `program_enrollments` to statuses that represent an active relationship.

### Rule
```typescript
const activeEnrollmentStatuses = ['enrolled', 'pending_admin_approval'];
```
- **Include**: `enrolled`, `pending_admin_approval`
- **Exclude**: `completed`, `cancelled`, `withdrawn`, `failed`, `pending_payment`
- `completed`, `cancelled`, and `withdrawn` mean the student is **no longer active** in the class
- `pending_payment` and `failed` mean the enrollment has not been confirmed

### Implementation Reference
`server/api/educator.ts` — the `my-students` endpoint filters `allProgramEnrollments` with:
```typescript
const activeEnrollmentStatuses = ['enrolled', 'pending_admin_approval'];
const allEnrollments = allProgramEnrollments.filter((enrollment: any) =>
  enrollment.classType === 'marketplace' &&
  enrollment.marketplaceClassId &&
  assignedClassIds.includes(enrollment.marketplaceClassId) &&
  activeEnrollmentStatuses.includes(enrollment.status)
);
```

## Grade Placement (auto-place by grade)

- Class fields: `sessionId`, `autoPlaceByGrade`, `gradeLevels`, `locationId` (all required to enable Auto-place)
- Sync creates free `program_enrollments` with `placementSource: 'grade'` — never cancel paid/manual rows
- Eligibility: campus match (`school_students` → `children` → **parent** `location_id`) + `hasPaidTowardSession` (session tuition ledger) + normalized grade (`shared/grade-levels.ts`)
- Preview/sync: `GET/POST .../classes/:id/grade-placement-preview|sync-grade-placements`
- Exclude placement seats from cart; block parent unenroll for `placementSource === 'grade'`
- Parent **Class:** / enrollments UI: current class seats only (`shared/current-class-enrollment.ts`)
- School-admin Students list (`GET /api/school-admin/students`): `classes[]` via `loadClassEnrollmentRowsForChildren` + `buildCurrentClassesByChildId` (not `getEnrollmentsByChildIds` — mem fallback on schema drift)
- Domain doc: `docs/APP_KNOWLEDGE/domains/grade-placement.md`

## Common Pitfalls

- **Wrong enrollment table** → used `school_class_enrollments` for a payment-tracked enrollment → use `program_enrollments` (it has financial fields)
- **Stale denormalized fields** → `childName` or `parentEmail` on enrollment doesn't match source → update denormalized fields when parent/child records change
- **Cancelling paid enrollments via user endpoint** → user unenroll only works for `pending_payment` → use admin endpoint for paid enrollments with proper refund flow
- **Missing variant context** → enrollment created without `variantId` when class has multiple variants → always capture variant selection from cart
- **Orphaned scheduled payments** → enrollment deleted but `scheduled_payments` remain → filter orphaned records from admin views (see `asa-database-patterns`)
- **Using `classData?.price` instead of `enrollment.totalCost` for balance updates** → `enrollment.programId` is not a reliable class ID (legacy field, not always populated), so `storage.getClassById(enrollment.programId)` often returns `null`, making `totalCost = 0` → `remainingBalance = 0` (wrong, understates balance). Always use `enrollment.totalCost` directly — it is the authoritative financial field set at enrollment creation.
- **Educator student list shows graduated/cancelled students** → enrollment query missing status filter → always restrict to `status IN ('enrolled', 'pending_admin_approval')`; never include `completed`, `cancelled`, or `withdrawn`

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
- Don't look up class price via `programId` when computing `remainingBalance` — use `enrollment.totalCost` directly (see Common Pitfalls above)

## Key Files
- `server/api/enrollments.ts` — enrollment CRUD, confirm, unenroll, bulk cancel
- `server/api/admin-enrollment-payment.ts` — admin payment management for enrollments
- `server/api/classes.ts` — class creation and management
- `server/api/admin-classes.ts` — admin class management endpoints
- `server/services/grade-placement-sync.ts` — Grade Placement preview/sync
- `shared/grade-levels.ts` / `shared/session-payment-eligibility.ts` — placement helpers
- `server/lib/prorate-calculator.ts` — proration date math
- `server/utils/cart-pricing.ts` — pricing calculations for enrollments
- `shared/schema.ts` — `programEnrollments`, `schoolClassEnrollments`, `schoolClasses`, `classes` tables
- `client/src/contexts/CartContext.tsx` — cart state with enrollment creation
