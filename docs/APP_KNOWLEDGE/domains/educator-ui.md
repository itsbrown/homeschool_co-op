# Educator / mentor UI

Canonical day-of mentor app is **`/educator/*`** inside `EducatorAppShell`. Login for `educator` / `mentor` / `teacher` redirects `/dashboard` → `/educator/dashboard`.

Legacy `client/src/components/dashboards/EducatorDashboard.tsx` (`GET /api/educator/classes?email=`, instructorId/name) is **admin/superAdmin `DashboardRouter` only**. Do not extend it for mentors.

## Live surfaces

| Route | Purpose |
|-------|---------|
| `/educator/dashboard` | Classes that **meet today** + one-tap Start (`GET /api/educator/dashboard`) |
| `/educator/my-classes` | Assigned classes; start session |
| `/educator/classes/:id` | Class details + Start Session CTA |
| `/educator/classes/:id/start-session` | Create + start `class_sessions` |
| `/educator/session/:id` | Active session + `AttendanceTracker` |
| `/educator/students` | Assigned students (`GET /api/educator/my-students`) |
| `/educator/assessments` | Record scores, progress log, Lexile |
| `/educator/weekly-calendar` | Schedule overlay |
| `/educator/my-hours` | Hours + assigned classes |
| `/educator/notifications` | In-app parent notices |
| `/educator/settings` | Profile (first/last/phone) |

## Redirects (dead URLs)

| From | To |
|------|----|
| `/educator/classes` | `/educator/my-classes` |
| `/educator/attendance` | `/educator/my-classes` (day-of mark is Active Session, not school-admin Attendance) |
| `/educator/templates` | `/schools/schedule-builder` |
| `/educator/schedule` | `/educator/weekly-calendar` |

Director Academics (when `showAcademics`): **Weekly Templates** → `/schools/schedule-builder`, **Attendance** → `/school-admin/attendance`. Mentors without school-admin permission who follow `/educator/templates` land on schedule-builder and may see `ForbiddenPage`.

## Roster invariants

- Marketplace seats: `program_enrollments.marketplaceClassId` → `classes.id`. Some rows only set `classId`.
- `getEnrollmentsByClassId` must `or(classId, marketplaceClassId)` on Postgres (`dbStorage`). CombinedStorage must not succeed on mem-only when DB is up.
- Active roster statuses: `enrolled` + `pending_admin_approval` (`isEducatorRosterStatus` in `server/api/educator.ts`). Same rule as supply lists.
- Session start: assignment `canStartSession`, else instructorId/name fallback (`resolveSessionStartAccess`).
- **Two (or more) assigned classes:** day-of attendance is **per session/class** and does not merge. My Students / assessments / notification targeting **union** enrollments across assignments (one row per enrollment; same child in two classes appears twice on My Students). Notification parent counts unique emails. `canManageStudents` staff see a location list instead of assignment rosters.
- **Safety on roster:** session roster, class students, and My Students include allergies / medical / special needs plus emergency contact. Priority: parent user emergency fields → `emergency_contacts` → `children.emergencyContact`. Blank and “none” / “n/a” do not show Allergy/Medical badges. Helper: `shared/educator-student-safety.ts`. Day-of UI: `StudentSafetySheet` (Info does not mark attendance).

## Cache

TanStack `staleTime: Infinity`. `queryClient.invalidateQueries({ queryKey: ['/api/educator'] })` does **not** prefix-match `['/api/educator/dashboard']`. After start / end / mark, call `invalidateEducatorSessionQueries()` in `client/src/lib/educator-queries.ts`. Start from the dashboard uses `createAndStartEducatorSession()` (same helper as Start Session).

## Day-of honesty

- Dashboard `todayClasses` is assignments whose `class.schedule` includes **today’s weekday** (`classMeetsOnWeekday` in `server/utils/family-schedule.ts`). Empty/unknown days are **not** treated as today. Full assignment list stays on My Classes.
- Attendance saves on tap (`POST /api/educator/attendance/bulk`). There is no Attendance tab. Staff Guide must not claim auto-save-from-a-tab, volunteer add, or QR as the default start.
- End Session stays on the session page with present/absent counts. Unmarked kids are highlighted; optional “mark remaining absent”.

## Tests

| File | Covers |
|------|--------|
| `server/tests/enrollments-by-class-id.test.ts` | Marketplace-only seats via `getEnrollmentsByClassId` |
| `e2e/educator-landing-nav.spec.ts` | `/dashboard` → live dashboard, sidebar, redirects |
| `e2e/educator-today-honesty.spec.ts` | Today weekday filter + one-tap Start + honest Staff Guide |
| `e2e/educator-mentor-loop.spec.ts` | Classes, students, hours, notifications, settings |
| `e2e/attendance-educator-mark.spec.ts` | Start → roster → allergy/medical Info sheet → mark present → end |
| `e2e/educator-assessments-record.spec.ts` | Record tab `my-students` + save score |
| `e2e/educator-weekly-schedule-plans.spec.ts` | Published plan overlay |
| `e2e/quarterly-progress-report-wizard.spec.ts` | NY IHIP wizard |

Seeds: `POST /api/test/setup-schedule-builder-scenario` and `setup-progress-scenario` with `linkSupabaseAuth: true`. Skip when `educatorSupabaseLinked` is false. Commands: [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md).

## Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty live roster / bulk attendance | `getEnrollmentsByClassId` mem-only or `classId` only | Postgres `or(classId, marketplaceClassId)` |
| Roster has names but no allergy flag | `GET .../roster` was name-only; “none” allergies are not alerts | `loadEducatorStudentSafetyByChildId`; `isSafetyAlertText` |
| Record assessment empty | `GET /api/educator/students` (needs `?email=`) | `GET /api/educator/my-students` → `{ students }` |
| Start session 403 with instructor named on class | Assignment-only gate | `resolveSessionStartAccess` instructor fallback |
| Dashboard / hours stale after session | Invalidated `['/api/educator']` | `invalidateEducatorSessionQueries()` |
| My Hours “0 assigned classes” | Hours loop required `schedule.variants` | Use `extractFamilyScheduleTiming` (`days` + `startTime`/`endTime`) |
| Record assessment types empty | `/api/assessments` only on unused `app-init.ts` | Mount on `server/index.ts` |
| `/educator/attendance` 403 | Mounted school-admin attendance | Redirect to My Classes; mark on `/educator/session/:id` |
| Dashboard “today” lists every assignment | `todayClasses` was unfiltered | `classMeetsOnWeekday`; empty days ≠ today |

## Out of scope (still leftover)

Volunteer check-in on Start Session (assigned aides are read-only). Email blast send. Settings email-notifications toggle (removed; was UI-only). Mock `/lessons`. Admin leftover dashboard on `AppShell`.

## Key files

| Area | Path |
|------|------|
| Routes | `client/src/App.tsx` |
| Shell / nav | `EducatorAppShell.tsx` |
| API | `server/api/educator.ts` |
| Storage | `server/dbStorage.ts` `getEnrollmentsByClassId` |
| Query helper | `client/src/lib/educator-queries.ts` |
| Safety | `shared/educator-student-safety.ts`, `server/lib/educator-student-safety.ts`, `StudentSafetySheet.tsx` |
| Attendance UI | `AttendanceTracker.tsx`, `ActiveSession.tsx`, `StartSession.tsx` |
