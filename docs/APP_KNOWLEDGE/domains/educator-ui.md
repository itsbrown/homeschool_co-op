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

## Staff invite → first login

School-admin **Staff → Invite** (`/schools/staff/invite`) writes **`staff_invitations`** (not `role_invitations`). The email and copy-link URL are `/accept-educator-invitation?token=…`, which validates/accepts that table.

On accept, **new** emails get a Supabase Auth user with the password they chose. **Existing** Auth accounts must enter their current password — accept must not `updateUserById` a new password. Then `school_staff` activates and the page **signs them in** to `/educator/dashboard` (no second `/login` hop). `user_roles.role` keeps the Staff Positions title (`Mentor`); `staff_invitations.role` is the mapped enum (`teacher`). Do not move `users.schoolId` when it already belongs to another school.

Invite `classId` is stored on the invitation and applied **on accept** (`educator_class_assignments`). `classes.instructorId` is set only when empty or already this mentor. Campus filters the class list. Directors get `invitePath` to copy when email fails.

Staff edit **Save Changes** only persists name/email/phone/role/campus. Status is derived from pending invite / `isActive`. Class assignment is a separate control. Staff list and staff-edit class lookups use `getClassesBySchoolId` (not `getAllClasses`).

E2E: `e2e/educator-invite-login.spec.ts` — seed `POST /api/test/setup-educator-invite-scenario`.

**Deploy:** additive [`server/migrations/259-staff-invitations.sql`](../../../server/migrations/259-staff-invitations.sql) before or with the release (never `db:push`). Boot `ensureStaffInvitationsSchema` applies the same file; treat a non-fatal ensure log as “run 259 by hand.” See [merge-replit-prod.md](../runbooks/merge-replit-prod.md).

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
- **Half day vs full day** is not on the class seat. It lives on the child’s v2 session-tuition enrollment (`sessionId` set, no class link). Roster APIs join via `shared/roster-day-type.ts` using `classes.sessionId`. Surfaces: class Students tab, My Students, attendance tracker, school-admin class roster. Summary: `1 Full Day · 1 Half Day`. Custom Mon/Fri names fall back from `className` only when `dayType` / `variantId` are empty.
- **Birthday** on those same roster surfaces comes from `children.birthdate`. Display via `shared/student-birthday.ts` (`Jun 1, 2015` + age) so YYYY-MM-DD is not shifted by UTC. Attendance roster must return `birthdate` (class/my-students already did).
- **Safety on roster:** session roster, class students, and My Students include allergies / medical / special needs plus emergency contact. Priority: parent user emergency fields → `emergency_contacts` → `children.emergencyContact`. Blank and “none” / “n/a” do not show Allergy/Medical badges. Helper: `shared/educator-student-safety.ts`. Day-of UI: `StudentSafetySheet` (Info does not mark attendance).

## Cache

TanStack `staleTime: Infinity`. `queryClient.invalidateQueries({ queryKey: ['/api/educator'] })` does **not** prefix-match `['/api/educator/dashboard']`. After start / end / mark, call `invalidateEducatorSessionQueries()` in `client/src/lib/educator-queries.ts`. Start from the dashboard uses `createAndStartEducatorSession()` (same helper as Start Session).

## Day-of honesty

- Dashboard `todayClasses` is **assigned** classes whose `class.schedule` includes **today’s weekday** (`classMeetsOnWeekday`). Empty/unknown days are **not** treated as today. Full assignment list stays on My Classes. E2E seed assigns Seekers (Mon/Wed) and Yankee (Tue/Thu).
- Attendance saves on tap (`POST /api/educator/attendance/bulk`). There is no Attendance tab. Staff Guide must not claim auto-save-from-a-tab, volunteer add, or QR as the default start.
- End Session stays on the session page with present/absent counts. Unmarked kids are highlighted; optional “mark remaining absent”.

## Tests

| File | Covers |
|------|--------|
| `server/tests/enrollments-by-class-id.test.ts` | Marketplace-only seats via `getEnrollmentsByClassId` |
| `e2e/educator-landing-nav.spec.ts` | `/dashboard` → live dashboard, sidebar, redirects |
| `e2e/educator-today-honesty.spec.ts` | Today weekday filter + one-tap Start + honest Staff Guide |
| `e2e/educator-mentor-loop.spec.ts` | Classes, students, hours, notifications, settings |
| `e2e/educator-roster-day-type.spec.ts` | Class roster + My Students + attendance show Half Day / Full Day and birthday |
| `e2e/attendance-educator-mark.spec.ts` | Start → roster → allergy/medical Info sheet → mark present → end |
| `e2e/educator-assessments-record.spec.ts` | Record tab `my-students` + save score |
| `e2e/educator-invite-login.spec.ts` | Staff invite → accept password → auto `/educator/dashboard` |
| `e2e/educator-weekly-schedule-plans.spec.ts` | Published plan overlay |
| `e2e/quarterly-progress-report-wizard.spec.ts` | NY IHIP wizard |

Seeds: `POST /api/test/setup-schedule-builder-scenario` and `setup-progress-scenario` with `linkSupabaseAuth: true`. Day-type roster: `setup-session-day-type-admin-scenario` (`linkSupabaseAuthEducator`). Skip when `educatorSupabaseLinked` is false. Commands: [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md).

## Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty live roster / bulk attendance | `getEnrollmentsByClassId` mem-only or `classId` only | Postgres `or(classId, marketplaceClassId)` |
| Roster shows names but no Half/Full Day | Class seat has no `dayType`; join missed session tuition or `classes.sessionId` is null | Join session-tuition rows via `shared/roster-day-type.ts`; set `classes.sessionId` for the academic session |
| Roster birthday is a day early | `new Date("2015-06-01")` is UTC midnight | `formatBirthdayDisplay` / `RosterBirthday` (`shared/student-birthday.ts`) |
| Roster has names but no allergy flag | `GET .../roster` was name-only; “none” allergies are not alerts | `loadEducatorStudentSafetyByChildId`; `isSafetyAlertText` |
| Record assessment empty | `GET /api/educator/students` (needs `?email=`) | `GET /api/educator/my-students` → `{ students }` |
| Start session 403 with instructor named on class | Assignment-only gate | `resolveSessionStartAccess` instructor fallback |
| Dashboard / hours stale after session | Invalidated `['/api/educator']` | `invalidateEducatorSessionQueries()` |
| My Hours “0 assigned classes” | Hours loop required `schedule.variants` | Use `extractFamilyScheduleTiming` (`days` + `startTime`/`endTime`) |
| Record assessment types empty | `/api/assessments` only on unused `app-init.ts` | Mount on `server/index.ts` |
| Edit Class “Add” lead mentor toast is HTML `Cannot POST /api/admin/educators/class-assignments` | Handlers lived in `server/api/admin-educators.ts` but the router was never mounted; `GET /:educatorId` also swallowed `/class-assignments/:classId` | Mount `app.use("/api/admin/educators", …)` in `server/routes.ts` **before** `app.use("/api/admin", adminRouter)`; keep assignment routes before `GET /:educatorId(\\d+)` |
| `/educator/attendance` 403 | Mounted school-admin attendance | Redirect to My Classes; mark on `/educator/session/:id` |
| Dashboard “today” lists every assignment | `todayClasses` was unfiltered | `classMeetsOnWeekday`; empty days ≠ today |
| Invite email “invalid token” | Invite wrote `role_invitations`; accept reads `staff_invitations` | `POST /staff/invite` → `createStaffInvitation`; accept page stays on staff-invitations |
| Invite E2E `socket hang up` on seed | Vite failed to parse Staff pending menu (two items in one `{cond && (}` ) and/or Playwright reused a server on disabled Neon | Separate menu items (or a fragment); worktree `.env` symlink; do not reuse a Neon-booted `:5000` |
| Parent locked out after staff invite | Accept used `updateUserById` to set a new password | Existing Auth: verify current password; never reset it |
| Accept: “existing user but the account could not be found” | `createUser` said email exists; `listUsers` pagination missed them | Sign in with the current password to get the Auth user id; do not scan `listUsers` |
| Staff **Save Changes** does nothing | `form.reset(GET payload)` put `classIds` as strings into `z.array(z.number())`; that field has no `FormMessage` | Reset only name/email/phone/role/location; toast on invalid; `apiRequest` needs `.json()`. Status is derived (invite pending / active), not a PUT field. Staff class lookups must use `getClassesBySchoolId`, not `getAllClasses`. |
| Staff save 500 “Error updating staff member” | First `user_roles` row is often `parent`; PUT renamed it to Mentor | `pickStaffRoleRecord` — update the staff row, leave parent |
| Staff remove 500 `users_active_role_id_fkey` | DELETE deleted the Mentor `user_roles` row while `users.active_role_id` still pointed at it | Re-point/null `active_role_id`, then delete |

## Out of scope (still leftover)

Volunteer check-in on Start Session (assigned aides are read-only). Email blast send. Settings email-notifications toggle (removed; was UI-only). Mock `/lessons`. Admin leftover dashboard on `AppShell`.

## Key files

| Area | Path |
|------|------|
| Routes | `client/src/App.tsx` |
| Shell / nav | `EducatorAppShell.tsx` |
| API | `server/api/educator.ts` |
| School-admin assignments | `server/api/admin-educators.ts` (mounted at `/api/admin/educators` in `server/routes.ts`) |
| Storage | `server/dbStorage.ts` `getEnrollmentsByClassId` |
| Query helper | `client/src/lib/educator-queries.ts` |
| Safety | `shared/educator-student-safety.ts`, `server/lib/educator-student-safety.ts`, `StudentSafetySheet.tsx` |
| Day type | `shared/roster-day-type.ts`, `DayTypeBadge.tsx` |
| Birthday | `shared/student-birthday.ts`, `RosterBirthday.tsx` |
| Staff invite | `server/lib/staff-invitations.ts`, `shared/staff-invitations.ts`, `StaffInvitePage.tsx`, `AcceptEducatorInvitationPage.tsx` |
| Staff edit | `client/src/pages/schools/StaffEditPage.tsx`, `PUT /api/school-admin/staff/:id` |
| Attendance UI | `AttendanceTracker.tsx`, `ActiveSession.tsx`, `StartSession.tsx` |
