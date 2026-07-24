# Grade Placement

Auto-place students onto class rosters by **campus + academic session payment + grade**.

## Product terms

| Term | Meaning |
|------|---------|
| Grade Placement | Feature |
| Auto-place by grade | Class toggle (`classes.auto_place_by_grade`) |
| Placement enrollment | Free `program_enrollments` with `placement_source = 'grade'` |
| Session | `sessions` row (e.g. Fall 2026), **not** `class_sessions` |

## Eligibility (all required)

1. Active `school_students` for `class.schoolId`
2. Resolved location = `class.locationId` — `school_students.location_id` → `children.location_id` → **parent `users.location_id`** (many children inherit campus only on the parent profile)
3. `hasPaidTowardSession` on a v2 / null-class session enrollment for `class.sessionId`
4. Normalized grade ∈ `class.gradeLevels`

**Not gates:** membership-only payment, unused family credits, autopay/collections late flags, `school_students.status` alone.

Helper: [`shared/session-payment-eligibility.ts`](../../../shared/session-payment-eligibility.ts)  
Grades: [`shared/grade-levels.ts`](../../../shared/grade-levels.ts)  
Sync: [`server/services/grade-placement-sync.ts`](../../../server/services/grade-placement-sync.ts)

## APIs

- `GET /api/school-admin/classes/:id/grade-placement-preview` — dry-run + reason codes
- `POST /api/school-admin/classes/:id/sync-grade-placements` — apply
- Class create/PATCH/PUT accept `sessionId`, `autoPlaceByGrade` and sync when relevant

## Parent surfaces

- Child card **Class:** line uses `placedClasses` — **current class seats only** (active status + class link + end date not past). Prefers `placement_source = grade`, else other current class enrollments. Session tuition (no class id) is not listed there.
- Parent enrollments page (`/children/:id/enrollments`) filters the same way; past-ended classes stay in the DB but are hidden from “Current Enrollments”.
- Helper: [`shared/current-class-enrollment.ts`](../../../shared/current-class-enrollment.ts) + [`server/lib/build-placed-classes.ts`](../../../server/lib/build-placed-classes.ts)

## School admin Students list

- `GET /api/school-admin/students` attaches `classes[]` via `loadClassEnrollmentRowsForChildren` + `buildCurrentClassesByChildId` — **all** current class seats (not grade-preferring / not capped at 3). UI: Classes column on `/school-admin/children` (`StudentsPage.tsx`). Session-tuition-only rows (no class id) are omitted.
- Do **not** load those rows through `storage.getEnrollmentsByChildIds` for this list: a missing `placement_source` column makes Drizzle `select *` fail and CombinedStorage falls back to empty mem enrollments.

## Money hygiene

- Placement seats are `$0`, `paymentStatus: completed`, excluded from cart (`enrollmentShouldExcludeFromCart`)
- Sync never cancels `placement_source IS NULL` enrollments
- Parents cannot unenroll `placement_source = grade` seats

## Migration

[`server/migrations/254-grade-placement.sql`](../../../server/migrations/254-grade-placement.sql)

## Tests

- Jest unit: `grade-levels`, `session-payment-eligibility`
- Jest integration: `grade-placement-sync.test.ts`
- Playwright: `grade-placement-auto-place`, `grade-placement-parent-card`
- Seed: `POST /api/test/setup-grade-placement-scenario`
