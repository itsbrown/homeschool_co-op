# School analytics

**Last updated:** 2026-07-01

Unified school-admin analytics: **app engagement**, **cart abandonment**, and **student progress** (literacy charts). Parent-facing progress charts use the same progress analytics service with parent scoping.

## Routes

| Audience | Route | Notes |
|----------|-------|-------|
| School admin | `/school-admin/analytics` | Tabs: Engagement, Cart Abandonment, Student Progress |
| School admin | `/school-admin/assessments` → **Progress insights** | Literacy cohort charts + social PNG export |
| Parent | `/parent/progress` → **Charts** tab | Child reading/math time-series |
| Legacy | My School → Statistics | `/api/analytics/school/*` (enrollment breakdown) |

Sidebar: **Finance → School Analytics**.

## Data model (additive)

| Table | Purpose |
|-------|---------|
| `user_activity_events` | Login, page_view, session_start/end, heartbeat |
| `checkout_funnel_events` | Member cart + public store funnel steps |

Migration: `server/migrations/253-school-analytics-events.sql`; idempotent bootstrap in `server/init-db.ts`.

### Checkout funnel steps

`add_to_cart` → `view_cart` → `begin_checkout` → `add_payment_info` → `purchase` | `abandon`

Lanes: `member_cart`, `public_store`. Each attempt has a `correlation_id` (UUID).

## APIs

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/telemetry/activity` | Authenticated; batch insert activity |
| POST | `/api/telemetry/checkout-funnel` | Authenticated; school-scoped funnel event |
| GET | `/api/school-analytics/engagement` | School admin / director |
| GET | `/api/school-analytics/cart-abandonment` | School admin / director |
| GET | `/api/progress/analytics/school` | School context |
| GET | `/api/progress/analytics/child/:childId` | Parent (own child) or staff |

Shared filters (query params): `from`, `to`, `locationId`, `grade`, `gender`, `ageBand`, `teacherId`.

## Demographic dimensions

Engagement and cart reports slice by **child demographics** (primary enrolled child per parent):

| Dimension | Source |
|-----------|--------|
| Location | `children.location_id` (primary child) |
| Grade | `children.grade_level` |
| Age band | `prek_k`, `grades_1_3`, `grades_4_8`, `grades_9_12` from birthdate |
| Gender | `children.gender` or `unknown` |
| Teacher | Instructor on active `program_enrollments` |

## Client instrumentation

| Area | File | Events |
|------|------|--------|
| App usage | `client/src/components/ActivityTelemetry.tsx` | page_view, login, heartbeat |
| Member cart | `CartContext.tsx`, `CartCheckout.tsx`, `CartSuccess.tsx` | funnel steps |
| Public store | `server/api/public-store.ts` | `begin_checkout` on checkout POST |

`users.last_login` updates when a `login` activity event is persisted (`telemetry-activity.ts`).

## Key server files

- `server/lib/school-analytics.ts` — insert + aggregate engagement/funnel
- `server/lib/progress-analytics.ts` — literacy cohort + child time-series
- `server/lib/parse-lexile-range.ts` — Lexile normalization
- `server/api/school-analytics.ts`, `telemetry-activity.ts`, `progress-analytics.ts`

## Key client files

- `client/src/pages/schooladmin/SchoolAnalyticsPage.tsx`
- `client/src/components/school-analytics/*`
- `client/src/components/progress-charts/*`
- `client/src/lib/chartExport.ts`, `telemetryClient.ts`

## Privacy

- **Social / progress export:** anonymous school aggregates only (`ProgressInsightsTab` PNG export).
- **Engagement + cart abandonment:** internal ops — parent names/emails visible to school admins.
- Not in scope v1: guest browse-cart before account, cross-school benchmarks, automated recovery emails.

## Tests

| File | Type |
|------|------|
| `server/tests/parse-lexile-range.test.ts` | Unit |
| `server/tests/integration/activity-telemetry.test.ts` | DB (`TEST_DATABASE_URL`) |
| `server/tests/integration/checkout-funnel.test.ts` | DB |
| `server/tests/integration/progress-analytics-school.test.ts` | DB |
| `server/tests/integration/school-analytics-dimensions.test.ts` | DB |
| `e2e/school-analytics-engagement.spec.ts` | Playwright + `setup-cart-scenario` |
| `e2e/school-analytics-cart-abandonment.spec.ts` | Playwright |
| `e2e/parent-progress-charts.spec.ts` | Playwright + `setup-progress-scenario` |

## Related domains

- [student-progress-assessments.md](./student-progress-assessments.md) — F-14 assessments, progress log
- [payments-and-billing.md](./payments-and-billing.md) — cart checkout, pending_payment backfill for funnel

## Pitfalls

- `/api/analytics` must be mounted in **both** `server/index.ts` and `server/app-init.ts` (My School Statistics 404 if missing).
- `useAnalytics` alone does not persist events — `ActivityTelemetry` must be mounted in `App.tsx`.
- Cart funnel `correlation_id` should stay stable per checkout attempt (client `telemetryClient.ts`).
- Progress child API returns 403 if parent does not own the child.
