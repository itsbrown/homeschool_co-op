# App knowledge changelog

## 2026-05-28 (child enrollments vs cart parity)

- Child Enrollments page loads `/api/parent/enrollments` (same as cart) so payment-plan–excluded `pending_payment` rows appear with an amber “Not in cart” badge; session enroll skip messages include enrollment id for Unenroll.

## 2026-05-28 (cart membership + session line visibility)

- **Missing $125 membership at checkout:** Treat `enrolled` membership rows as paid only when remaining balance is zero; cart snapshot defensively sets `membershipTotal` when school requires a fee; CartContext uses snapshot without a short timeout race; checkout order summary falls back to `membership.required` + school fee amount.
- **Session row dropped quote→cart:** Cart line filter no longer hides the latest `pending_payment` row when an older `enrolled` row exists in the same child+session group.

## 2026-05-28 (parent unenroll persistence)

- **Unenroll toast but row remains:** `DELETE /api/enrollments/:id/unenroll` now deletes pending `scheduled_payments` before removing `program_enrollments` (FK). `CombinedStorage.deleteProgramEnrollment` no longer treats mem-only delete as success when Postgres delete fails; mem cache is cleared after DB delete.
- **Parent UI:** Child enrollments page invalidates `/api/parent/enrollments` and awaits cart refresh after unenroll.

## 2026-05-28 (sessions location column backfill)

- **Enrollment Sessions list/create regression:** Older environments without `sessions.location_id` fail once location-scoped sessions code is deployed (appears as "no sessions" + create error). `server/init-db.ts` now always runs `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location_id REFERENCES locations(id)` during startup.
- **Ops note:** If users report missing sessions after deploy, confirm backend restart so startup migration executes.

## 2026-05-28 (credit ledger)

- **Credits not deducted / reusable after refresh:** Webhook consumes credits before `scheduled_payments.completed` early-exit; throws if ledger incomplete (Stripe retry). Parent Pay Now (card + credits) reserves `credit_holds`. Checkout idempotency via `Checkout {pi_id}` logs. See `docs/CREDIT_LEDGER_REPAIR.md`.
- **Repair:** `npx tsx server/scripts/backfill-missing-credit-ledger.ts --dry-run|--apply`; school admin `GET /api/credits/admin/integrity-check`, `POST /api/credits/admin/repair-ledger`.

## 2026-05-26 (multi-subject progress)

- **F-14 + curriculum progress wired:** Drizzle tables, `assessment-progress-db` storage, routes in `app-init.ts` (`/api/assessments`, `/api/lexile`, `/api/progress`, `/api/progress/insights`).
- **Educator:** Progress tab on assessments page, quick log on student detail; POST uses `score` / `lesson`.
- **Parent:** `/parent/progress` hub; sidebar Progress entry; concierge `get_child_progress`.
- **Admin:** Progress catalog tab on assessments management.
- **Tests:** `progress-log-validation.test.ts`; integration smokes `assessments-api`, `progress-api` (require `TEST_DATABASE_URL`).

## 2026-05-27

- **School admin Classes page 500:** `GET /api/school-admin/classes` calls `storage.getHiddenCategoryIds()` but the method was dropped from `server/storage.ts` / `server/dbStorage.ts` during a May merge while the API call remained — restores method + `categories.isPublic` in Drizzle schema.
- **Checkout abandon / false payment plan:** `POST /api/stripe/create-payment-intent` no longer writes `paymentPlan` or `initialPaymentIntentId` on enrollments before Stripe succeeds; those fields are set in `persistRemainingScheduledPaymentsAfterFirstCheckoutPayment` after installment 1. Dashboard and Payments → Upcoming treat `checkout_due` as **incomplete checkout** (amber), not overdue; no fake “installment 1 of N” until first payment succeeds — full schedule appears only after webhook creates `scheduled_payments` rows 2..N.
- **Membership at checkout:** `resolveMembershipOwedForCheckout` in `server/utils/cart-pricing.ts` is used by cart snapshot and payment intent so annual membership is included when the school requires it, even if the client omits it. Cart checkout syncs membership from snapshot and gates pay on signed agreement (`/api/parent/agreements/check/:schoolId`).
- **Checkout school for membership:** `resolveCheckoutSchoolId` prefers the school that owns cart classes/enrollments over `users.school_id` (snapshot, validate, Stripe intent). `alreadyPaid` only when `isActiveMembership` status — not `remainingBalance <= 0` on pending rows. Checkout loads `/api/cart/snapshot` on mount and uses `totals.membershipTotal` for the order summary line.

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
