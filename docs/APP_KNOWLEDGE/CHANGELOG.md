# App knowledge changelog

## 2026-05-30 (Financial reports — recent transactions 500 fix)

- **Bug:** `GET /api/admin/financial-reports/recent-transactions` returned 500 while summary/revenue worked. Drizzle typed `payments.status` / `payment_method` hydration failed on production rows with values outside schema enums (e.g. `succeeded`, `card`).
- **Fix:** Cast status and payment_method to `::text` in the ledger SELECT; wrap Stripe history + live Stripe enrichment in try/catch so ledger + refunds always return; use Drizzle select for `getStripePaymentHistoryForSchool` (typed rows, shared `sqlStripeHistoryUserAtSchool`).

## 2026-05-30 (Financial reports — activePaymentPlans metric fix)

- **Bug:** `GET /api/admin/financial-reports/summary` `activePaymentPlans` counted enrollments with positive effective balance, not enrollments with pending `scheduled_payments`.
- **Fix:** Count `COUNT(DISTINCT enrollment_id)` from `scheduled_payments` where `status = 'pending'` (same rule as `/payment-plans` `activePlans`). JSON key unchanged — UI label is "Active Payment Plans".
- **Tests:** Integration asserts tuition + membership = outstanding, `activePaymentPlans` from pending SPs, collections `totalOwedCents` parity; unit regression guard on query source.

## 2026-05-30 (Financial reports — outstanding balances rollup + membership)

- **Outstanding Balances tab:** `buildOutstandingBalanceRows` family/`summary.totalOutstandingCents` roll up **enrollment-level tuition** (dedupe installments via `enrollmentRemainingBalance`), not sum of installment row `amount`. Membership owed rows (`type: 'membership'`, `MEMBERSHIP_OWED_STATUSES`) included so tab total aligns with summary card `outstandingBalanceCents` (tuition + membership).
- **UI:** Group-by-parent totals use same enrollment dedupe; membership rows labeled separately; scheduled reminders only on `type: 'scheduled'`.

## 2026-05-30 (Lapsed families report — last enrollment date)

- **Fix:** `buildLapsedFamiliesData` (`server/api/retention.ts`) populates `lastEnrollmentDate` via batch `getLastEnrollmentDateByParentEmails` — max `GREATEST(enrollment_date, program_start_date)` over qualifying `program_enrollments` statuses, keyed with `normalizeEmailForLookup`.
- **UI:** Lapsed families table shows Last enrollment column (`RetentionReportPage.tsx`); CSV export already included the field.

## 2026-05-29 (biweekly scheduled payments without program dates)

- **Installments 2–12 missing when webhook/reconcile runs but enrollment lacks program dates:** `persistRemainingScheduledPaymentsAfterFirstCheckoutPayment` rebuilt phases via `buildPaymentPhases`, which falls back to legacy **4** biweekly payments when `program_start_date` / `program_end_date` are null — mismatch with PI metadata `totalInstallments: 12` would persist only 3 future rows (or 0 if fulfillment never ran). Added `buildBiweeklyPhasesFromInstallmentMetadata` fallback when rebuilt phase count ≠ metadata installment count.

## 2026-05-26 (biweekly checkout + membership proration)

- **Installment 1 applied $0 to class when cart includes membership:** PI metadata carried full `membershipAmount` ($175) while installment 1 was only $139.58 — class pool reserved entire payment, leaving enrollments at $0 paid. Fixed proportional membership reserve per PI; membership fulfillment accumulates partial paid across installments. Parent profile falls back to `enrollment.className` when `class_id` is null.

## 2026-05-26 (manual payment admin visibility)

- **Manual class payments missing from parent profile after entry:** With `PAYMENT_PROCESSOR_ENABLED=true`, `POST /api/payment-history/manual` wrote only `stripe_payment_history`; admin profile read `payments` only. Fixed dual-write to `payments` after processor success; parent profile merges orphan manual ledger rows; removed silent file fallback on Postgres `createPayment` failure (was invisible to profile reads).

## 2026-05-26 (CombinedStorage payment history reads)

- **Admin/parent Payment History empty despite Postgres rows:** `CombinedStorage.getPaymentsByParentEmail` (and `getPaymentByStripeId` / `updatePaymentStatus`) read only `memStorage` while `createPayment` writes Postgres — profile Payments tab showed `[]` for all DB-backed parents (e.g. Lauren user 130). Fixed to delegate to `dbStorage` like `getAllPayments` / `getScheduledPaymentsByParentEmail`.

Dated updates to this knowledge base (not product release notes).

## 2026-05-26

- **Location activation threshold (implemented):** Schema `249-location-activation-threshold.sql`, `location-activation-service`, scheduler, wishlist enroll path, cart/Stripe guards, admin + parent UI. See domain doc.
- **Location activation threshold (planned):** Product rules locked in `domains/registration-and-locations.md` — student count, `sessions.location_id`, short notice before batch charge, early admin activate + audit, expiry cancels wishlist and releases cards.
- **School-wide staff permissions:** `user_school_permissions` table + `/api/school-admin/user-school-permissions` (GET/POST/PATCH). Middleware `checkLocationPermission` honors school-wide grants at every location. Staff Permissions page has a **School-wide access** card; `my-permissions` returns `schoolWide` for sidebar nav.
- **Staff Permissions:** `StaffPermissionsPage` grants location access to any school user via `/api/school-admin/users` (search + quick list), not only `/api/school-admin/staff` roles; assign block always visible below the permissions table. `STAFF_TYPE_ROLES` includes `mentor`/`aide` with case-insensitive match on `/api/school-admin/staff`.
- **Comp enrollment balance:** `resolveEnrollmentEffectiveBalance` prefers computed `total_cost - total_paid - comp_amount_cents` when stored `effective_balance` drifts; comp API uses same helper; Parent Profile drops `remainingBalance` fallback; `server/scripts/repair-comp-amount-cents.sql` for legacy rows with `comp_percentage` but zero `comp_amount_cents`.
- **Comp school guard:** `POST /api/admin/enrollments/:id/comp` uses `canAdminManageEnrollmentSchool` (all assignable schools + class `school_id` fallback), not a single `user_roles.school_id` — fixes “Cannot comp enrollments from other schools” when admin is `schools.admin_id` for the enrollment’s school but legacy `users.school_id` differs.
- Added `domains/student-progress-assessments.md`: audit of F-14 reading assessments — UI/migrations exist; routes, storage, and Drizzle schema not wired (non-functional at runtime).

## 2026-05-22

- Added `scripts/post-merge-replit-check.mjs` and runbook notes for Replit "Already up to date" + conditional SQL.

## 2026-05-21

- Seeded `docs/APP_KNOWLEDGE/` hub, architecture, registration, CI, merge runbook.
- Documented CI scope: production-path + client jsdom as Tests gate; full `test:server` local only.
- Documented prod rule: additive SQL only; `ci-db-push.mjs` + role enum bootstrap for CI.
- Documented admin school resolution (`schools.admin_id` vs `users.school_id`) and production-path suites.
- Added personal skill `~/.cursor/skills/maintain-app-knowledge`, project skill `asa-app-knowledge`, rule `.cursor/rules/app-knowledge.mdc`.
