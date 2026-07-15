# Schedule builder & lesson planning

Operational truth for **class weekly templates / week plans**, educator calendars, family schedule, lessons/curriculum UI, and related AI — **not** Stripe `scheduled_payments`.

## Product loop

1. **Weekly Templates** — `/schools/schedule-builder` → skeletons + recurring time blocks (`weekly_skeletons`, `skeleton_blocks`). Bind **`classId`** to marketplace `classes.id` (not title-as-value). CSV import uses `ScheduleBlocksCsvImportDialog` (map → preview → confirm); `POST .../skeletons/:id/blocks/import-csv` accepts optional FormData `mapping` JSON. Requires `express-fileupload` on `/api/schedule-builder` and **`csv-stringify`** (CSV export).
2. **Week Planner** — `/schools/week-planner` → per-week plans + block content (`week_plans`, `week_plan_blocks`); optional `/api/schedule-ai/*` (`generate-week`, `suggest-block-content`, `analyze-gaps`; `recommend-resources` API exists, no UI yet).
3. **Publish** — parents see `/parent/weekly-schedule` via enrollment-scoped my-week; educators see `/educator/week-plans`.

Adjacent: `/educator/schedule` (class calendar via `/api/educator/schedules/week`), `/schedule` (enrollment family schedule via `GET /api/schedule`), `/schools/calendar` (school events), `/lessons` + AI generators.

**Family `/api/schedule`:** `classes.schedule` is **jsonb** (usually `{ variants: [{ days, startTime, endTime }] }`). Never `.match()` it as a string — use `server/utils/family-schedule.ts` `extractFamilyScheduleTiming` (also accepts JSON-stringified jsonb). A thrown parse used to 500 the whole calendar (“0 scheduled activities”). Covered by Jest `server/tests/family-schedule.test.ts` (no dedicated Playwright; parent weekly schedule E2E covers schedule-builder my-week, not this enrollment calendar).

## Runtime mounts

| Router | Prefix | `server/index.ts` | `server/app-init.ts` |
|--------|--------|-------------------|----------------------|
| `schedule-builder.ts` | `/api/schedule-builder` | **Yes** (+ scoped `fileUpload`) | Yes (+ scoped `fileUpload`) |
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

- `GET /api/school-admin/academics/kpi` (+ `/export` CSV) — lesson completion % + attendance aggregates.
- Attendance half of KPI applies the same **school / date / `classId`** filters as lesson KPI (class filter joins `class_sessions.class_id`).
- UI: Attendance Management → **Lesson plans** tab.

## Client honesty

| Page | Live API? |
|------|-----------|
| `ScheduleBuilderPage` / `WeekPlannerPage` | Yes |
| `WeeklySchedulePage` | Yes (`/parent/my-week-plans`) |
| `Lessons.tsx` | Yes — `GET /api/lessons` via `fetchLessons` |
| `AILessonGenerator.tsx` | Yes — `POST /api/lessons/generate` (Anthropic) + `POST /api/lessons` save; **503** when `ANTHROPIC_API_KEY` missing (no silent mock) |

**Deferred / v2:** block completion → `student_progress_log`; schedule-ai `recommend-resources` UI; dedicated Playwright for family `/schedule` calendar.

## Tests & seed

| ID | Coverage |
|----|----------|
| `POST /api/test/setup-schedule-builder-scenario` | Admin/educator/parent, Seekers+Yankee classes, skeletons/`classId`, published+draft weeks, completion, attendance, optional Supabase link |
| Jest | `family-schedule`, `schedule-builder-mount`, `schedule-builder-seed`, `schedule-builder-api`, `progress-scheduled-lessons`, `school-admin-academics-kpi`, `school-admin-attendance` |
| Playwright | `schedule-builder-publish`, `parent-weekly-schedule`, `parent-progress-scheduled-lessons`, `school-admin-academics-kpi`, `schedule-template-csv-import` |

Commands: [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md). Progress cross-link: [student-progress-assessments.md](./student-progress-assessments.md).

## Key files

| Area | Path |
|------|------|
| Storage | `server/lib/schedule-builder-db.ts` |
| Family parse | `server/utils/family-schedule.ts` |
| Admin UI | `ScheduleBuilderPage.tsx`, `WeekPlannerPage.tsx`, `ScheduleBlocksCsvImportDialog.tsx` |
| Consumers | `WeeklySchedulePage.tsx`, `ParentProgressPage.tsx` |
| Lessons / AI | `Lessons.tsx`, `AILessonGenerator.tsx`, `POST /api/lessons/generate` in `routes.ts` |
| KPI UI | `AttendanceManagementPage.tsx` (Lesson plans tab) |
| API | `server/api/schedule-builder.ts`, `schedule-ai.ts`, `progress.ts`, `school-admin.ts` (academics/kpi) |
| Schema | `weeklySkeletons`, `skeletonBlocks`, `weekPlans`, `weekPlanBlocks` |
