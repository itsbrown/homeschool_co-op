# Schedule builder & lesson planning

Operational truth for **class weekly templates / week plans**, educator calendars, family schedule, lessons/curriculum UI, and related AI — **not** Stripe `scheduled_payments`.

## Product loop

1. **Weekly Templates** — `/schools/schedule-builder` → skeletons + recurring time blocks (`weekly_skeletons`, `skeleton_blocks`). Bind **`classId`** to marketplace `classes.id` (not title-as-value). CSV import uses `ScheduleBlocksCsvImportDialog` (map → preview → confirm); `POST .../skeletons/:id/blocks/import-csv` accepts optional FormData `mapping` JSON. Requires `express-fileupload` on `/api/schedule-builder`.
2. **Week Planner** — `/schools/week-planner` → per-week plans + block content (`week_plans`, `week_plan_blocks`); optional `/api/schedule-ai/*`. Week-card **Print** (and Actions → Print) uses the same ASA Time × teaching-day sheet as mentor **Schedule**. Cards show the lesson description, first objectives, and materials; **Lesson** opens `WeekPlanBlockDetailSheet` (script, objectives, materials, homework, notes, links). Edit also saves materials/homework. **Actions** also includes **Build** (create `week_plan_blocks` for empty skeleton slots from template defaults), Publish/Complete, CSV, Clone, AI, Delete. CSV import reuses the same dialog in `mode="week-plan"` (map → preview → confirm); `POST .../week-plans/:id/blocks/import-csv` accepts optional `mapping`, resolves slots by day+start_time → `skeletonBlockId`, and accepts template-shaped CSVs (`default_title` → title).
3. **Publish** — parents see week lessons as **Week** mode on `/schedule` (bookmark `/parent/weekly-schedule` redirects there) via enrollment-scoped my-week; educators see published blocks on **Schedule** (`/educator/weekly-calendar` via `/api/educator/schedules/week` `planBlocks`) and can still browse/print on `/educator/week-plans`. `/educator/schedule` redirects to `/educator/weekly-calendar`.

**In-app Drive draft:** Lesson **Edit → Connect folder** saves `skeleton_blocks.drive_folder_id` (this slot only). Reindex lists that folder into `curriculum_assets`. **Generate lesson** prefers a Google Doc over a PDF, exports the Doc, and fills title / timed script / “What success looks like” / Materials. Generate again re-reads the same Doc. Never auto-Publish. Drive key: [google-drive-service-account.md](../runbooks/google-drive-service-account.md). SQL: `server/migrations/265-week-planner-drive.sql`.

Adjacent: `/schedule` is the parent Calendar hub (class days + school events + week lessons + ICS subscribe). `/schools/calendar` is the school-admin event publisher. `/lessons` + AI generators remain separate.

**Family `/api/schedule`:** `classes.schedule` is **jsonb** (usually `{ variants: [{ days, startTime, endTime }] }`). Never `.match()` it as a string — use `server/utils/family-schedule.ts` `extractFamilyScheduleTiming`. Expansion is shared via `server/lib/family-class-schedule.ts` (JSON + ICS).

**School events:** `events.school_id` + optional `location_id` (null = all campuses). Parent reads `GET /api/calendar-events/parent/events` using child campuses, not `users.schoolId` alone. Writes require schoolAdmin/admin/superAdmin/director.

**Parent dashboard Upcoming Events:** KPI + card merge enrolled class days (`GET /api/schedule`) with school events in the **next 7 days**. List shows at most 5 rows; KPI is the full 7-day count. Events after day 7 still appear on `/schedule`. Helper: `client/src/lib/parent-upcoming-events.ts`. Day sheet for school events shows type label, description, all-day or start–end, and venue (read-only).

**Family day sheet:** Month cells open `DayLessonsSheet` (`h-[90dvh]`, list is the only scroll region). Lessons come from `GET /api/schedule-builder/parent/my-week-plans` and `groupDayLessons` (skeleton Sunday = 0). Chips appear only when two or more children have lessons that day. Detail stays in the sheet via `WeekPlanBlockDetailBody`. Empty days stay closed. Playwright: `npm run test:e2e -- e2e/parent-family-schedule-day-sheet.spec.ts`.

**Family ICS:** `POST /api/calendar/feed-token` mints `users.calendar_feed_token`. `GET /api/calendar/feed/:token` is unauthenticated (calendar apps cannot send Bearer). Do not ship a public numeric school-id ICS feed. All-day `DTEND` is exclusive (next calendar day).

## Runtime mounts

| Router | Prefix | `server/index.ts` | `server/app-init.ts` |
|--------|--------|-------------------|----------------------|
| `schedule-builder.ts` | `/api/schedule-builder` | **Yes** | Yes |
| `schedule-ai.ts` | `/api/schedule-ai` | **Yes** | Yes |
| `calendar-events.ts` | `/api/calendar-events` | **Yes** | Yes |
| `calendar-feed.ts` | `/api/calendar` | **Yes** | Yes |
| `smart-tutorial.ts` | `/api/smart-tutorial` | **No** | **No** |

**Canonical runtime** is `server/index.ts`. Storage for schedule-builder lives in `server/lib/schedule-builder-db.ts` (wired through `dbStorage` / `CombinedStorage`).

**SPA `/api` skip:** `server/vite.ts` (dev + static) skips `/api/*` so unmounted APIs are not shadowed by HTML 200.

## Auth & consumer reads

- Writes: `ADMIN_ROLES` (`schoolAdmin` | `admin` | `superAdmin` | `director`).
- Consumer reads: `CONSUMER_READ_ROLES` (+ `parent` | `teacher` | `educator`) on published plan / skeleton GETs.
- Parents: **`GET /api/schedule-builder/parent/my-week-plans?weekStart=YYYY-MM-DD`** (Monday default).

### Enrollment → class resolver

`effectiveClassId = marketplaceClassId ?? classId`. Session-only enrollments with both null do **not** match skeletons — parent UI shows no class section for that child (empty).

Canonical block fields: `title`, `description`, `objectives`, `materials`, `homework`, `notes`, `lessonLink`, `resources`, `groups`, `isCompleted`, `completedAt`, `completedBy`. Week filter uses `weekStartDate`. Teaching preview helpers: `client/src/lib/week-plan-lesson-content.ts`.

Block completion stays admin/Week Planner in v1 (sets `week_plan_blocks.is_completed` only — **does not** write `student_progress_log`).

## Progress bridge

- `GET /api/progress/parent/:childId/scheduled-lessons` — published blocks for child's enrolled classes; completion pills on Parent Progress → **This session**.
- Quarterly report DTO may include optional `scheduledLessons` list.

## Admin KPI

- `GET /api/school-admin/academics/kpi` (+ `/export` CSV) — lesson completion % + attendance aggregates (same filters as `/attendance/summary`).
- UI: Attendance Management → **Lesson plans** tab.

## Client honesty

| Page | Live API? |
|------|-----------|
| `ScheduleBuilderPage` / `WeekPlannerPage` | Yes |
| `FamilySchedule` (`/schedule`) | Yes (`/api/schedule`, parent events, my-week-plans) |
| `WeeklySchedulePage` | Removed — week grid is `ParentWeekPlanGrid` on `/schedule?view=week` |
| `Lessons.tsx` | **Mock** `queryFn` |
| `AILessonGenerator.tsx` | **Simulated** |

## School-admin tutorial

Interactive walkthrough id `schedule-builder` (`client/src/components/tutorials/tutorialDefinitions.ts`):

- **How to use** on Weekly Templates + Week Planner headers
- First-visit soft prompt on Schedule Builder (`localStorage` key `schedule_builder_tour_seen`; session key `schedule_builder_tour_prompt_session`). Opening a CSV import dismisses the prompt so its Radix overlay cannot sit on the custom import dialog.
- **Need Help?** → Tutorials & Guides (school-admin role list includes this guide)

Steps: templates → class bind → blocks/CSV → Week Planner → New Week → Publish → optional Attendance Lesson plans KPI.

## Day index convention

- Skeleton / week-plan blocks: **Sunday = 0**.
- Educator `/api/educator/schedules/week` class slots: **Monday = 0**.
- Shared helper: `shared/schedule-day-index.ts` (`skeletonDayToEducatorDay`, `skeletonSlotMatchesClassMeeting`).
- Mentor overlay matches published blocks by **day** (class.schedule windows are coarse; skeleton blocks are fine-grained). Class times normalized via `extractFamilyScheduleTiming` (default-variant only).
- Multiple assigned classes on the same day each get a meeting card (morning then afternoon). A **published** week plan for the selected week includes that class even when `classes.start_date` is later (Logic Hall #82 starts 2026-09-21 but Week 1 is published for 2026-09-14). Helpers: `shared/educator-week-visibility.ts`.

## Tests & seed

| ID | Coverage |
|----|----------|
| `POST /api/test/setup-schedule-builder-scenario` | Admin/educator/parent, Seekers+Yankee classes (+ `schedule` jsonb + educator assignment), skeletons/`classId`, published+draft weeks, completion, attendance, optional Supabase link |
| Jest | `schedule-builder-mount`, `schedule-builder-seed`, `schedule-builder-api` (incl. week-plan CSV import), `progress-scheduled-lessons`, `school-admin-academics-kpi`, `school-admin-attendance`, `schedule-day-index`, `educator-week-visibility` |
| Playwright | `parent-family-calendar` (incl. school-event day-sheet details), `parent-dashboard-upcoming-events` (7-day mix + outside-window exclusion), `parent-calendar-redirects`, `school-admin-calendar`, `parent-weekly-schedule` (redirect + print root), `schedule-builder-publish`, `school-admin-week-planner-print`, `schedule-template-csv-import`, `parent-progress-scheduled-lessons`, `school-admin-academics-kpi`, `educator-weekly-schedule-plans`, plus mentor loop specs in [educator-ui.md](./educator-ui.md) |

Commands: [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md). Progress cross-link: [student-progress-assessments.md](./student-progress-assessments.md).

## Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| E2E `schedule-builder-publish` times out on `week-planner-publish` click | Publish is a **DropdownMenuItem** under Actions (`week-planner-actions` → `week-planner-publish`), not a top-level button | Open Actions first, then click Publish |
| Block edit PATCH 500 / E2E `waitForResponse` + `r.ok()` hangs | `insertBlockHistory` interpolated empty/null `materials` text[] into drizzle `sql``` → Postgres `syntax error at or near ")"` | Emit `ARRAY[]::text[]` / `ARRAY[...]::text[]` in `schedule-builder-db.ts`; assert PATCH status in E2E |
| Week chip selected but pane says “Select a week…” | Detail pane required `selectedWeekData`; while `GET /week-plans/:id` is pending the UI showed empty-state copy | Show loading/error states; E2E waits for draft block edit control |
| Week Planner **Confirm Import** 500 / failed | Import built `{ dayOfWeek, startTime, data }` but `bulkUpdateWeekPlanBlocks` needs `skeletonBlockId` + flat fields | Resolve skeleton slot by day+start_time; pass correct shape (fixed 2026-07-14) |
| Template CSV (`default_title`) on Week Planner looks wrong / empty titles | Week-plan columns use `title`; no mapper | Shared dialog maps `default_title` → title; server also falls back to `default_title` |
| Educator Schedule “Unable to load” / `/schedules/week` 500 | Missing `getEducatorSchedulesForWeek` / events storage | Restored in `educator-schedules-db` + soft-fail `events-range-db`; overlay published plans via `schedule-day-index` |
| Mentor Schedule shows only the morning band (Logic Hall missing) | `/api/educator/schedules/week` skipped classes whose `start_date` is after the week, even with a published week plan | Include assigned classes when a published plan exists for that `weekStart` (`educatorClassVisibleInWeek`). Jocelyn #9 is on Pioneers #70 and Logic Hall #82. |
| POST `/api/calendar-events` 400 Validation error | `requireSchoolContext` sets `req.schoolId` as a **string**; drizzle-zod `insertEventSchema.schoolId` is integer | `Number(req.schoolId)` before parse/compare |
| Parent Calendar empty / E2E miss school event chips | Month cell shows **one** school chip; switching users in the same Playwright context keeps admin auth; dashboard fetch storm can delay `/parent/events` | Isolated `browser.newPage()`; list view; `waitForResponse` on `/parent/events` |
| Dashboard Upcoming Events only shows one class day | Card used `/api/schedule` class days only, capped to 7 days | Merge `GET /api/calendar-events/parent/events` for the same 7-day window; school events past day 7 belong on `/schedule` |
| Parent day sheet only shows school event title | School rows rendered badge + title | Show description, All day or start–end, venue; human type label (`Holiday` not `holiday`) |
| E2E `schedule-csv-done` / `schedule-csv-mapping-next` click times out | First-visit tour prompt (`schedule-tour-prompt`) Radix overlay intercepts the custom CSV portal; CI often hits this on Done (tour fires during import), fast local runs on Next | Seed `schedule_builder_tour_seen`; dismiss prompt when CSV opens; force-click Done after success. Skip `networkidle`. |
| School admin print does not match staff handouts | Week Planner used to print the editor UI (or had no Print). Mentor **Schedule** (`/educator/weekly-calendar`) is the ASA branded Time × day sheet. | Use **Print** on the selected week in Week Planner — same `AsaWeeklySchedulePrintSheet` as staff |
| E2E `getByText('Draft: Pending Publish')` strict-mode 2 matches | Print sheet is `display:none` but still in the DOM with the same block titles | Scope to editor `p` / `data-testid`, or `getByTestId('schedule-print-root')` for print assertions |

## Key files

| Area | Path |
|------|------|
| Storage | `server/lib/schedule-builder-db.ts`, `educator-schedules-db.ts` |
| Admin UI | `ScheduleBuilderPage.tsx`, `WeekPlannerPage.tsx` |
| Consumers | `FamilySchedule.tsx`, `ParentWeekPlanGrid.tsx`, `ParentProgressPage.tsx`, `WeeklyCalendar.tsx` (mentor Schedule) |
| School events | `server/api/calendar-events.ts`, `server/api/calendar-feed.ts`, `server/lib/events-range-db.ts`, `server/lib/calendar-ics.ts` |
| Migration | `server/migrations/260-family-calendar.sql` |
| Mentor week API | `server/api/educator.ts` `GET /schedules/week` |
| Day index | `shared/schedule-day-index.ts` |
| Block detail | `client/src/components/schedule/WeekPlanBlockDetailSheet.tsx` |
| Shared print sheet | `client/src/components/schedule/AsaWeeklySchedulePrintSheet.tsx`, `client/src/lib/asa-weekly-schedule-print.ts` |
| KPI UI | `AttendanceManagementPage.tsx` (Lesson plans tab) |
| Tutorial | `tutorialDefinitions.ts` (`schedule-builder`), `useScheduleBuilderTour.ts`, HelpTutorials school-admin list |
| API | `server/api/schedule-builder.ts`, `progress.ts`, `school-admin.ts` (academics/kpi) |
| Schema | `weeklySkeletons`, `skeletonBlocks`, `weekPlans`, `weekPlanBlocks` |
