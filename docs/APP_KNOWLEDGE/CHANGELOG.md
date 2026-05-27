# App knowledge changelog

## 2026-05-27

- **Checkout abandon / false payment plan:** `POST /api/stripe/create-payment-intent` no longer writes `paymentPlan` or `initialPaymentIntentId` on enrollments before Stripe succeeds; those fields are set in `persistRemainingScheduledPaymentsAfterFirstCheckoutPayment` after installment 1. Dashboard and Payments → Upcoming treat `checkout_due` as **incomplete checkout** (amber), not overdue; no fake “installment 1 of N” until first payment succeeds — full schedule appears only after webhook creates `scheduled_payments` rows 2..N.
- **Membership at checkout:** `resolveMembershipOwedForCheckout` in `server/utils/cart-pricing.ts` is used by cart snapshot and payment intent so annual membership is included when the school requires it, even if the client omits it. Cart checkout syncs membership from snapshot and gates pay on signed agreement (`/api/parent/agreements/check/:schoolId`).

Dated updates to this knowledge base (not product release notes).

## 2026-05-26

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
