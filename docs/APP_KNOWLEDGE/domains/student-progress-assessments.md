# Student progress & assessments

**Last updated:** 2026-09-09

## Two lanes

| Lane | Purpose | Tables | APIs |
|------|---------|--------|------|
| **Assessments** | Scores, McCall-Crabbs, Lexile snapshots, math level | `assessment_types`, `curriculum_books`, `student_assessments`, `assessment_sessions`; `children.current_*` | `/api/assessments`, `/api/lexile`, `/api/lexile-ai`, `/api/math-level`, `/api/assessment-upload` |
| **Curriculum progress** | Where left off + session coverage (any subject) | `progress_subjects`, `progress_tracks`, `student_progress_current`, `student_progress_log`, `child_progress_insights` | `/api/progress`, `/api/progress/insights` |

Mounted in `server/app-init.ts`. Storage in `server/lib/assessment-progress-db.ts`, delegated via `CombinedStorage` / `dbStorage`.

## UI routes

| Role | Route | Notes |
|------|-------|-------|
| Parent | `/parent/progress` | Hub: read-only current Lexile/reading grade + Math Level, **Charts** (reading/math API), overview, this session, AI summary |
| Parent | `/parent/assessments` | Read-only current Lexile/reading grade + Math Level, reading charts + assessment history |
| Educator | `/educator/assessments` | Default mentor nav. Tabs: record assessment, **Progress** (log form), Lexile. See [educator-ui.md](./educator-ui.md). |
| Educator | `/educator/students`, class Students tab | Compact reading/math chips + **Levels** Sheet; posts manual entries to `/api/lexile/entry` and `/api/math-level/entry`. |
| School admin | `/schools/students/:id` | Profile: Lexile + **Math Level** (enter/update + history) |
| Educator | Student detail | Lexile + **Math Level** entry |
| School admin | `/school-admin/assessments` | Types/books + **Progress catalog** + **Sessions & reports** + **Progress insights** |
| School admin | `/school-admin/analytics` | Engagement, cart abandonment, student progress (see [school-analytics.md](./school-analytics.md)) |

## Key behaviors

- **Hybrid validation:** Log POST requires at least one of lesson number, unit label, or topics covered (`insertStudentProgressLogBodySchema`).
- **Session required:** `student_progress_log.session_id` from `resolveActiveSessionIdForChild` (enrolled `program_enrollments` with non-null `session_id`).
- **Do not reuse that ID on assessments:** `student_assessments.session_id` FKs `assessment_sessions`, not program `sessions`. Manual Lexile / Math Level entry leaves `session_id` null; writing a program session id causes FK 500 for enrolled students.
- **Carry-forward:** `student_progress_current` upserted on each log; unique `(child_id, progress_track_id)`.
- **Reading bridge:** Creating a `student_assessment` with a `curriculum_book` linked to `progress_track_id` updates current + optional log when session resolvable.
- **Default subjects:** `ensureProgressSubjectsForSchool` seeds math, science, reading, etc. on first catalog read.
- **AI:** `GET /api/progress/insights/summary/:childId` (parent) and `GET /api/progress/insights/staff/summary/:childId` (staff) share `child_progress_insights` cache via `server/lib/progress-context-bundle.ts`. Parent concierge appends cached summary when fresh (&lt;24h).
- **Reports:** NY IHIP quarterly template (`template=ny-ihip-quarterly`): preview JSON, draft PDF, `POST .../generate` → immutable `quarterly_progress_reports` snapshot; audit events in `audit_logs`; parents download via `snapshotId` only.

## Placement entry and analytics contract

- **Enter where viewed:** Empty Lexile and Math Level cards on staff student profiles expose their own entry CTA; both use the same inline entry → save → current badge + history model.
- **Role boundary:** School admins and educators write through `/api/lexile/entry` and `/api/math-level/entry`; parent Progress and Assessments render `children.current_*` snapshots read-only.
- **Dual-source analytics:** Current coverage comes from `children.current_lexile_range`, `current_reading_grade_level`, and `current_math_level`; dated series come from reading/math `assessment_types` plus `student_assessments`.
- **Different aggregations:** Jurisdiction/proficiency bands are Lexile-only. Math Level values are categorical labels and feed `mathLevelDistribution`.
- **Actionable KPIs:** `ProgressInsightsTab` coverage cards open `/api/progress/analytics/school/missing-levels`; each worklist row links to the student profile for entry.
- **Shared surface:** `ProgressInsightsTab` mounts under both `/school-admin/assessments` and `/school-admin/analytics`.

## Tests

| File | Type |
|------|------|
| `server/tests/progress-log-validation.test.ts` | Zod hybrid rules (always runs) |
| `server/tests/ny-ihip-template.test.ts` | Verbatim ASA PDF strings |
| `server/tests/progress-report-pdf.test.ts` | PDF generation smoke |
| `server/tests/email-service-sendgrid.test.ts` | SendGrid routing + attachment |
| `server/tests/progress-insights-rate-limit.test.ts` | AI insights 429 at rate limit |
| `server/tests/integration/f14-quarterly-report.integration.test.ts` | Full quarter workflow (`TEST_DATABASE_URL`) |
| `server/tests/integration/progress-api.test.ts` | DB smoke (`TEST_DATABASE_URL`) |
| `server/tests/integration/progress-analytics-school.test.ts` | Progress analytics school + child APIs |
| `server/tests/parse-lexile-range.test.ts` | Lexile parser unit tests |
| `e2e/school-admin-lexile-profile.spec.ts` | Admin enter/view Lexile from the student profile empty state |
| `e2e/school-admin-math-level-profile.spec.ts` | Admin enter/view Math Level on `/schools/students/:id` (`setup-progress-scenario` + `linkSupabaseAuthAdmin`) |
| `e2e/educator-levels-sheet.spec.ts` | Educator My Students Levels Sheet saves Lexile + Math Level (`setup-progress-scenario`, linked educator Supabase auth) |
| `e2e/parent-progress-charts.spec.ts` | Parent Charts tab (`setup-progress-scenario`, Supabase) |
| `e2e/parent-placement-levels.spec.ts` | Parent read-only placement badges on Progress + Assessments (`setup-progress-scenario` with `withPlacementLevels`, Supabase) |
| `e2e/school-admin-progress-insights-placement.spec.ts` | Admin Math coverage KPI, missing-level worklist, and categorical distribution |

**Run validation bundle:**

```bash
npm run test:server -- --testPathPatterns="f14-quarterly-report|email-service-sendgrid|ny-ihip-template|progress-report-pdf|progress-log-validation"
```

**Live SendGrid smoke (optional):**

```bash
RUN_LIVE_EMAIL=1 npx tsx server/scripts/send-progress-report-email-smoke.ts your@email.com
```

| File | Type |
|------|------|
| `e2e/quarterly-progress-report-wizard.spec.ts` | Educator wizard save/finalize + parent PDF (`setup-progress-scenario`, Supabase) |
| `e2e/authenticated/educator-progress-tab.spec.ts` | Opt-in with `E2E_EDUCATOR_EMAIL` |
| `e2e/authenticated/parent-progress-hub.spec.ts` | Opt-in with `E2E_PARENT_EMAIL` |

## Pitfalls

- Educator assessment POST must use `score` and `lesson`, not legacy `scoreValue` / `lessonNumber`.
- Progress log without active enrolled session → 400 / UI “no active session” alert.
- Manual Lexile / Math Level: never put program `sessions.id` on `student_assessments.session_id` (FK → `assessment_sessions`); enrolled kids 500 otherwise.
- `ParentProgressPage` **Charts** tab uses `/api/progress/analytics/child/:childId`; detailed reading history remains on `/parent/assessments`.
- Parent placement values come from `children.current_lexile_range`, `current_reading_grade_level`, and `current_math_level`; parent APIs expose these fields read-only and never mount staff entry controls.
- Admin progress catalog uses same `/api/progress/subjects` as educators; subject **create** is admin-only.

## NY | Progress report (IHIP-aligned)

- Template data: `server/data/ny-ihip-progress-report-template.ts` (verbatim ASA PDF; version `2026-05-asa-v1`).
- Band resolver: `server/lib/resolve-progress-report-band.ts` from `children.gradeLevel`.
- Rubric tables: `quarterly_progress_meta`, `quarterly_skill_checks`, snapshots in `quarterly_progress_reports`.
- Educator UI: `QuarterlyReportWizard` on progress log form; admin book → `progressTrackId` on `/school-admin/assessments`; `AssessmentSessionsTab` for session + report audit view.
- Observability: see [observability.md](./observability.md) (Sentry dual-write, SendGrid webhook, report audit).

## Key files

- `shared/schema.ts` — enums + progress/assessment + quarterly tables
- `server/lib/assessment-progress-db.ts` — CRUD + bridge + insights + quarterly
- `server/lib/build-student-progress-report.ts`, `server/services/progressReportPdf.ts`
- `server/lib/progress-context-bundle.ts` — shared Claude context for insights, Lexile AI, concierge
- `server/api/progress.ts`, `progress-insights.ts`, `assessments.ts`, `lexile.ts`, `math-level.ts`
- `client/src/components/math/MathLevelProfileSection.tsx` — profile card + inline entry
- `server/migrations/264-children-math-level.sql` — `current_math_level` + assessment type
- `client/src/components/educator/ProgressLogForm.tsx`, `ProgressLogTab.tsx`, `ProgressQuickLogDialog.tsx`
- `client/src/components/educator/StudentLevelsSheet.tsx` — roster-level reading/math entry Sheet + compact chips
- `client/src/pages/parent/ParentProgressPage.tsx`
- `client/src/components/admin/ProgressCatalogTab.tsx`, `AssessmentSessionsTab.tsx`
- Reference PDF: `docs/templates/` (copy ASA source PDF when committed)
