# Schedule builder & lesson planning

Operational truth for **class weekly templates / week plans**, educator calendars, family schedule, lessons/curriculum UI, and related AI — **not** Stripe `scheduled_payments`.

## Product loop

1. **Weekly Templates** — `/schools/schedule-builder` → skeletons + recurring time blocks (`weekly_skeletons`, `skeleton_blocks`). Bind **`classId`** to marketplace `classes.id` (not title-as-value). CSV import uses `ScheduleBlocksCsvImportDialog` (map → preview → confirm); `POST .../skeletons/:id/blocks/import-csv` accepts optional FormData `mapping` JSON. Requires `express-fileupload` on `/api/schedule-builder`.
2. **Week Planner** — `/schools/week-planner` → per-week plans + block content (`week_plans`, `week_plan_blocks`); optional `/api/schedule-ai/*`. Week-card **Actions** menu includes **Build** (create `week_plan_blocks` for empty skeleton slots from template defaults), Publish/Complete, CSV, Clone, AI, Delete. CSV import reuses the same dialog in `mode="week-plan"` (map → preview → confirm); `POST .../week-plans/:id/blocks/import-csv` accepts optional `mapping`, resolves slots by day+start_time → `skeletonBlockId`, and accepts template-shaped CSVs (`default_title` → title).
3. **Publish** — parents see `/parent/weekly-schedule` via enrollment-scoped my-week; educators see `/educator/week-plans`.

Adjacent: `/educator/schedule` (class calendar via `/api/educator/schedules/week`), `/schedule` (enrollment family schedule via `GET /api/schedule`), `/schools/calendar` (school events), `/lessons` + AI generators.

**Family `/api/schedule`:** `classes.schedule` is **jsonb** (usually `{ variants: [{ days, startTime, endTime }] }`). Never `.match()` it as a string — use `server/utils/family-schedule.ts` `extractFamilyScheduleTiming`. A thrown parse used to 500 the whole calendar (“0 scheduled activities”).

## Runtime mounts

| Router | Prefix | `server/index.ts` | `server/app-init.ts` |
|--------|--------|-------------------|----------------------|
| `schedule-builder.ts` | `/api/schedule-builder` | **Yes** | Yes |
| `schedule-ai.ts` | `/api/schedule-ai` | **Yes** | Yes |
| `calendar-events.ts` | `/api/calendar-events` | **No** | **No** |
| `smart-tutorial.ts` | `/api/smart-tutorial` | **No** | **No** |

**Canonical runtime** is `server/index.ts`. Storage for schedule-builder lives in `server/lib/schedule-builder-db.ts` (wired through `dbStorage` / `CombinedStorage`).

**SPA `/api` skip:** `server/vite.ts` (dev + static) skips `/api/*` so unmounted APIs are not shadowed by HTML 200.

## Auth & consumer reads

- Writes: `ADMIN_ROLES` (`schoolAdmin` | `admin` | `superAdmin` | `director`).
- Consumer reads: `CONSUMER_READ_ROLES` (+ `parent` | `teacher` | `educator`) on published plan / skeleton GETs.
- Parents: **`GET /api/schedule-builder/parent/my-week-plans?weekStart=YYYY-MM-DD`** (Monday default).

### Enrollment → class resolver

`effectiveClassId = marketplaceClassId ?? classId`. Session-only enrollments with both null do **not** match skeletons — parent UI shows no class section for that child (empty).

Canonical block fields: `title`, `description`, `isCompleted`, `completedAt`, `completedBy`. Week filter uses `weekStartDate`.

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
| `WeeklySchedulePage` | Yes (`/parent/my-week-plans`) |
| `Lessons.tsx` | **Mock** `queryFn` |
| `AILessonGenerator.tsx` | **Simulated** |

## School-admin tutorial

Interactive walkthrough id `schedule-builder` (`client/src/components/tutorials/tutorialDefinitions.ts`):

- **How to use** on Weekly Templates + Week Planner headers
- First-visit soft prompt on Schedule Builder (`localStorage` key `schedule_builder_tour_seen`)
- **Need Help?** → Tutorials & Guides (school-admin role list includes this guide)

Steps: templates → class bind → blocks/CSV → Week Planner → New Week → Publish → optional Attendance Lesson plans KPI.

## Tests & seed

| ID | Coverage |
|----|----------|
| `POST /api/test/setup-schedule-builder-scenario` | Admin/educator/parent, Seekers+Yankee classes, skeletons/`classId`, published+draft weeks, completion, attendance, optional Supabase link |
| Jest | `schedule-builder-mount`, `schedule-builder-seed`, `schedule-builder-api` (incl. week-plan CSV import), `progress-scheduled-lessons`, `school-admin-academics-kpi`, `school-admin-attendance` |
| Playwright | `schedule-builder-publish`, `schedule-template-csv-import`, `parent-weekly-schedule`, `parent-progress-scheduled-lessons`, `school-admin-academics-kpi` |

Commands: [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md). Progress cross-link: [student-progress-assessments.md](./student-progress-assessments.md).

## Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| E2E `schedule-builder-publish` times out on `week-planner-publish` click | Publish is a **DropdownMenuItem** under Actions (`week-planner-actions` → `week-planner-publish`), not a top-level button | Open Actions first, then click Publish |
| Block edit PATCH 500 / E2E `waitForResponse` + `r.ok()` hangs | `insertBlockHistory` interpolated empty/null `materials` text[] into drizzle `sql``` → Postgres `syntax error at or near ")"` | Emit `ARRAY[]::text[]` / `ARRAY[...]::text[]` in `schedule-builder-db.ts`; assert PATCH status in E2E |
| Week chip selected but pane says “Select a week…” | Detail pane required `selectedWeekData`; while `GET /week-plans/:id` is pending the UI showed empty-state copy | Show loading/error states; E2E waits for draft block edit control |
| Week Planner **Confirm Import** 500 / failed | Import built `{ dayOfWeek, startTime, data }` but `bulkUpdateWeekPlanBlocks` needs `skeletonBlockId` + flat fields | Resolve skeleton slot by day+start_time; pass correct shape (fixed 2026-07-14) |
| Template CSV (`default_title`) on Week Planner looks wrong / empty titles | Week-plan columns use `title`; no mapper | Shared dialog maps `default_title` → title; server also falls back to `default_title` |

## Key files

| Area | Path |
|------|------|
| Storage | `server/lib/schedule-builder-db.ts` |
| Admin UI | `ScheduleBuilderPage.tsx`, `WeekPlannerPage.tsx` |
| Consumers | `WeeklySchedulePage.tsx`, `ParentProgressPage.tsx` |
| KPI UI | `AttendanceManagementPage.tsx` (Lesson plans tab) |
| Tutorial | `tutorialDefinitions.ts` (`schedule-builder`), `useScheduleBuilderTour.ts`, HelpTutorials school-admin list |
| API | `server/api/schedule-builder.ts`, `progress.ts`, `school-admin.ts` (academics/kpi) |
| Schema | `weeklySkeletons`, `skeletonBlocks`, `weekPlans`, `weekPlanBlocks` |
