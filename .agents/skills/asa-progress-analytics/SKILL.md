---
name: asa-progress-analytics
description: Student placement levels, assessment analytics, Lexile and Math Level entry, coverage worklists, and progress charts. Use when editing assessment profiles, placement APIs, ProgressInsightsTab, school progress analytics, or parent and educator level displays.
---

# ASA Progress Analytics

## Core Rules

- **Snapshot plus history** — Read current placement from `children.current_lexile_range`, `current_reading_grade_level`, and `current_math_level`; use `student_assessments` for dated history.
- **Parallel entry UX** — Keep Lexile and Math Level profile cards on the same empty-state CTA, inline form, save, current badge, and history interaction model.
- **Role boundary** — Staff enter placement levels; parents receive read-only snapshot and history views.
- **Actionable coverage** — Make Progress Insights coverage KPIs open the missing-level worklist and link each student to the profile entry surface.
- **Separate assessment sessions** — Never write a program `sessions.id` to `student_assessments.session_id`; it references `assessment_sessions`.

## Data Sources

| Metric | Current snapshot | History |
|--------|------------------|---------|
| Lexile | `children.current_lexile_range`, `children.current_reading_grade_level` | Reading-category `assessment_types`; `student_assessments.lexile_score` or grade-level `score` |
| Math Level | `children.current_math_level` | Math-category `assessment_types`; `student_assessments.score` |

Jurisdiction/proficiency bands derive only from normalized Lexile and reading grade data. Math Level values such as `3A` are categorical; aggregate them as a label/count distribution, never as numeric jurisdiction bands.

## API Map

| Path | Purpose |
|------|---------|
| `GET /api/progress/analytics/school` | School coverage, Lexile trends/bands, and Math Level distribution |
| `GET /api/progress/analytics/school/missing-levels` | Admin worklist filtered by `missing=lexile|math|either` and optional `locationId` |
| `GET /api/progress/analytics/child/:childId` | Child reading/math series; parent ownership or staff school scope required |
| `/api/lexile/*` | Staff history, student list, manual entry, CSV import, and AI insight routes |
| `/api/math-level/*` | Staff history, student list, and manual entry routes |

## Client Surfaces

- `ProgressInsightsTab` is mounted in both `/school-admin/assessments` and `/school-admin/analytics`; keep filters, KPIs, worklist, charts, and export behavior consistent.
- School-admin and educator student profiles mount both `LexileProfileSection` and `MathLevelProfileSection`.
- Educator rosters use `StudentLevelsSheet` for combined entry; parent Progress and Assessments show read-only placement badges.

## E2E Coverage

- `e2e/school-admin-lexile-profile.spec.ts` — profile empty state, entry, current badges, history.
- `e2e/school-admin-math-level-profile.spec.ts` — matching Math Level flow and session-FK regression.
- `e2e/parent-placement-levels.spec.ts` — parent snapshots without staff save controls.
- `e2e/educator-levels-sheet.spec.ts` — combined roster entry and refreshed chips.
- `e2e/school-admin-progress-insights-placement.spec.ts` — Math coverage KPI, missing-level worklist, and categorical distribution.

Run each with `npm run test:e2e -- e2e/<file>.spec.ts`. These linked-auth specs must use `requireLinkedSeed`; skipped tests are not passes.

## Common Pitfalls

- **Manual save returns FK 500** → a program session ID was assigned to `student_assessments.session_id` → leave it null unless using an `assessment_sessions.id`.
- **Parent sees edit controls** → staff profile components were reused directly → render the parent read-only placement component.
- **Coverage card is decorative** → KPI click does not set a missing filter → open `/school/missing-levels` worklist in place.
- **Math values appear in reading bands** → categorical labels were coerced to numbers → use `mathLevelDistribution`.
- **One admin page drifts** → only one `ProgressInsightsTab` mount was checked → verify Assessments and School Analytics.

## Best Practices

### Do
- Read placement coverage from the `children.current_*` snapshot fields.
- Preserve assessment rows as dated history after updating snapshots.
- Link missing-level rows to `/schools/students/:childId`.
- Apply school scope to staff analytics and ownership checks to parent child analytics.
- Run all affected linked-seed Playwright specs with zero skips.

### Don't
- Write program enrollment session IDs into assessment session foreign keys.
- Give parents `/api/lexile/entry` or `/api/math-level/entry` controls.
- Infer Math Level ordering or jurisdiction proficiency from labels.
- Duplicate Progress Insights implementations between its two mounts.
- Treat a coverage KPI without a remediation path as complete.

## Key Files

- `server/lib/progress-analytics.ts` — school aggregates, child series, and missing-level worklist
- `server/api/progress-analytics.ts` — school and child analytics authorization
- `server/api/lexile.ts` — staff Lexile history, entry, and import
- `server/api/math-level.ts` — staff Math Level history and entry
- `client/src/components/admin/ProgressInsightsTab.tsx` — shared admin analytics surface
- `client/src/components/lexile/LexileProfileSection.tsx` — staff Lexile profile interaction
- `client/src/components/math/MathLevelProfileSection.tsx` — staff Math Level profile interaction
- `client/src/components/educator/StudentLevelsSheet.tsx` — combined roster placement entry
- `client/src/components/progress-charts/PlacementLevelsStrip.tsx` — parent read-only placement display
