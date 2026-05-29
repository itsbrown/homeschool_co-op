# App knowledge changelog

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
