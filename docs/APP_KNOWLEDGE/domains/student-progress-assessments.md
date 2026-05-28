# Student progress & assessments

**Last updated:** 2026-05-26

## Two lanes

| Lane | Purpose | Tables | APIs |
|------|---------|--------|------|
| **Assessments** | Scores, McCall-Crabbs, Lexile snapshots | `assessment_types`, `curriculum_books`, `student_assessments`, `assessment_sessions` | `/api/assessments`, `/api/lexile`, `/api/lexile-ai`, `/api/assessment-upload` |
| **Curriculum progress** | Where left off + session coverage (any subject) | `progress_subjects`, `progress_tracks`, `student_progress_current`, `student_progress_log`, `child_progress_insights` | `/api/progress`, `/api/progress/insights` |

Mounted in `server/app-init.ts`. Storage in `server/lib/assessment-progress-db.ts`, delegated via `CombinedStorage` / `dbStorage`.

## UI routes

| Role | Route | Notes |
|------|-------|-------|
| Parent | `/parent/progress` | Hub: overview, this session, reading link, AI summary |
| Parent | `/parent/assessments` | Reading charts + Lexile history |
| Educator | `/educator/assessments` | Tabs: record assessment, **Progress** (log form), Lexile |
| Educator | Student detail | Quick **Log progress** dialog |
| School admin | `/school-admin/assessments` | Types/books + **Progress catalog** tab |

## Key behaviors

- **Hybrid validation:** Log POST requires at least one of lesson number, unit label, or topics covered (`insertStudentProgressLogBodySchema`).
- **Session required:** `student_progress_log.session_id` from `resolveActiveSessionIdForChild` (enrolled `program_enrollments` with non-null `session_id`).
- **Carry-forward:** `student_progress_current` upserted on each log; unique `(child_id, progress_track_id)`.
- **Reading bridge:** Creating a `student_assessment` with a `curriculum_book` linked to `progress_track_id` updates current + optional log when session resolvable.
- **Default subjects:** `ensureProgressSubjectsForSchool` seeds math, science, reading, etc. on first catalog read.
- **AI:** `GET /api/progress/insights/summary/:childId` caches in `child_progress_insights`; invalidated on progress writes. Parent concierge tool `get_child_progress`.
- **Reports:** `GET /api/progress/report/:childId` (staff) — JSON bundle for export (PDF later).

## Tests

| File | Type |
|------|------|
| `server/tests/progress-log-validation.test.ts` | Zod hybrid rules (always runs) |
| `server/tests/integration/assessments-api.test.ts` | DB smoke (`TEST_DATABASE_URL`) |
| `server/tests/integration/progress-api.test.ts` | DB smoke (`TEST_DATABASE_URL`) |
| `e2e/authenticated/educator-progress-tab.spec.ts` | Opt-in with `E2E_EDUCATOR_EMAIL` |
| `e2e/authenticated/parent-progress-hub.spec.ts` | Opt-in with `E2E_PARENT_EMAIL` |

## Pitfalls

- Educator assessment POST must use `score` and `lesson`, not legacy `scoreValue` / `lessonNumber`.
- Progress log without active enrolled session → 400 / UI “no active session” alert.
- `ParentProgressPage` reading tab links to `/parent/assessments` (do not nest `MyAssessmentsPage` — double shell).
- Admin progress catalog uses same `/api/progress/subjects` as educators; subject **create** is admin-only.

## Still partial / later

- F-14-04 PDF export (JSON report endpoint exists).
- `curriculum_books.progress_track_id` admin UI on book dialog (column + bridge logic exist).
- Full integration suite for log upsert, bridge, insights rate limit (needs `TEST_DATABASE_URL`).
- In-app `assessment_sessions` UI not built.

## Key files

- `shared/schema.ts` — enums + progress/assessment tables
- `server/lib/assessment-progress-db.ts` — CRUD + bridge + insights cache
- `server/api/progress.ts`, `progress-insights.ts`, `assessments.ts`, `lexile.ts`
- `client/src/components/educator/ProgressLogForm.tsx`, `ProgressLogTab.tsx`, `ProgressQuickLogDialog.tsx`
- `client/src/pages/parent/ParentProgressPage.tsx`
- `client/src/components/admin/ProgressCatalogTab.tsx`
