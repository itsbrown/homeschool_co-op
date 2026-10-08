# Platform audit — American Seekers Academy (2026-10-08)

Report-only review of GitHub `main` at `c800d99ebe1812f3cbb0aafe96f07b74693875d5`. No application code was changed. No migrations, `db:push`, production database, live Stripe keys, or `.env.prod` were touched. Live Replit env values (Sentry DSN, `ENABLE_BACKGROUND_JOBS`, which Postgres URL is actually used) were **not** inspected.

**Maturity:** **solid** = routed UI plus a real API/storage path; **partial** = present but incomplete, miswired, feature-flagged, or legacy; **stub** = placeholder, unrouted, or API that does not exist.

---

## Executive summary

The product that is actually built is a **single-deployment, multi-school co-op operating system**, and the path that can take money today is **ASA (or another school on the same Stripe account) charging families**: membership, session/class tuition with installments and Pay All, public store and event RSVP, fundraisers. That billing stack is PaymentIntent-centric, webhook-backed, and covered by payments tests and Playwright specs.

It is **not** ready to sell as self-serve SaaS, and it is **not** ready to take a platform fee on other organizations’ payments.

- There is no Stripe Connect, no Billing Portal, no trials, and no seat pricing. The “platform plans” screen (`client/src/pages/PaymentPlans.tsx`) calls `/api/platform-subscriptions/*`, which does not exist. The server routes are `/api/subscriptions/*` and are not finished by webhooks.
- Schools are rows in one database (`shared/schema.ts` `schools`), parents join with a registration code, and school-admin tools are largely real. Isolation is **application code only**. Several routes return child and roster data with **no login**.
- A git-tracked `db_push_output.txt` contains a plaintext Postgres password for a `supabase.co` host. Other tracked files contain a hardcoded auth password and legacy JSON with parent/staff/child fields.
- Public store, forms, and registration are a Vite SPA. `client/index.html` has one ASA title and Open Graph block. There is no `robots.txt`, sitemap, or per-page OG image in the repo. `/` for a logged-out visitor is the login screen, not the marketing page in `client/src/pages/Home.tsx` (imported, not routed).

**Best income path from what exists:** keep collecting ASA family payments (membership, tuition plans, store/events) after the security lockdown below. **Best software-income path:** sell the school-admin product to other co-ops only after authz, provisioning, and a real subscription (or Connect fee) exist. White-label and a teacher marketplace are later products.

---

## 1. Feature inventory

Role model in code: parents operate household accounts; **children are records, not logins**. A `learner` role exists, but there is no student app. Mentors use `/educator/*`. School admins use `/schools/*` and `/school-admin/*`. Platform operator tools are split between `/admin/*` (many of which render a generic dashboard) and `/superadmin/*`.

Nav sources: `client/src/components/layout/ParentSidebar.tsx`, educator shell, `UnifiedSchoolAdminSidebar.tsx`. Routes: `client/src/App.tsx`. API mount hub: `server/routes.ts`, `server/index.ts`.

### Public / unauthenticated

| Feature | Maturity | Pointers |
|---------|----------|----------|
| Supabase login, callback, forgot/reset password | solid | `/login`, `client/src/components/auth/SupabaseLogin.tsx`, `server/api/auth.ts` |
| Legacy login URLs (`/auth/login`, `/old-login`, `/auth0-login`, `/embedded-login`, `/school-admin-login`) | partial | Still routed in `App.tsx` |
| School-code registration | solid | `/register`, `/register/:code`, `/school/:code`; `GET /api/schools/validate-code/:code`, `GET /api/schools/by-code/:code`, `server/lib/registration-public-locations.ts` |
| Accept staff / role invitation | solid | `/accept-invitation`, `/accept-educator-invitation`; public handlers in `server/routes.ts` |
| QR session check-in | solid | `/qr/:token` |
| Public custom forms | solid | `/forms/:slug` → `DynamicFormPage.tsx`; `server/api/custom-forms.ts` |
| Public store + event RSVP (brunch-style) | solid | `/store/:schoolSlug` and item/checkout/success; `server/api/public-store.ts`; RSVP editor and `e2e/public-store-event.spec.ts` |
| Public fundraiser shop | solid | `/fundraiser/:campaignId/:familySlug`; `server/api/fundraisers.ts`. Checkout session is created; **no webhook fulfillment** found for `fundraiser_order` |
| Legacy product-order form | partial | `/product-order/:slug` is **not** on the public allowlist in `App.tsx` (~483–494), so logged-out visitors are sent to login |
| School application | partial | UI at `/school-application` is **not** on the public allowlist (redirects to login). `POST /api/school-applications` is public. Approval does not create a school (`server/api/school-applications.ts` ~342–351, `console.log` only) |
| Marketing home | stub | `client/src/pages/Home.tsx` is imported in `App.tsx` and **never routed**. Logged-out `/` is `SupabaseLogin` |
| Support / payment-help assistants | solid | `POST /api/technical-support/report`, `/api/payment-help/*` |

### Parent

| Feature | Maturity | Pointers |
|---------|----------|----------|
| Family dashboard | solid | `/`, `/dashboard`, `/parent/home` → `ParentDashboard.tsx` via `DashboardRouter` |
| Children, profiles, enrollments, emergency contacts | solid | `/children`, `/children/:id`, `/parent/emergency-contacts`; `server/api/parent.ts`, `server/api/children.ts` |
| Programs and session enrollment | solid | `/parent/programs`, `/enroll`; `POST /api/session-enrollments`; admin sessions `server/api/admin-sessions.ts` |
| Location wishlist (campus not yet open) | solid | Status `location_wishlist` in `server/api/session-enrollments.ts`; threshold on locations; `server/services/location-activation-service.ts`. Not a separate product page |
| Cart, checkout, payment plans (full / biweekly / deposit / split / custom) | solid | `/cart`, `/cart/checkout`; `server/api/stripe.ts`, `server/services/stripe-payment-plans.ts`, `shared/checkout-payment-plan.ts` |
| Installments, Pay Now, autopay | solid | `server/api/scheduled-payments.ts`, `server/api/auto-pay.ts`, `server/services/autopay-off-session-charge.ts` |
| Pay All / pay outstanding balance | solid (on `main`) | `PaymentManagement.tsx`; `POST /api/billing/pay-balance` in `server/api/billing.ts`. Idempotency store is **in-memory per process** |
| Payment methods, history, volunteer credits | solid | `/payment-methods`, `/payment-history`; credits in cart and pay-balance |
| Membership fee, agreement e-sign, member ID | solid | `schools.membershipFeeAmount` in `shared/schema.ts`; `server/api/membership-agreement.ts`; signup can create a pending membership (`server/api/auth.ts`) |
| Door codes | solid when flagged | Parent `GET /api/parent/access-code` (`server/api/family-access-codes.ts`); school feature `doorCodes` defaults **off** (`server/lib/school-features.ts`) |
| Schedule / calendar, week plans, ICS | solid | `/schedule`; `GET /api/schedule`, schedule-builder parent week plans, `server/api/calendar-feed.ts` |
| Supply lists | solid | `/parent/supplies`; `server/api/supply-lists.ts` |
| Documents, progress, assessments / Lexile | solid | `/parent/documents`, `/parent/progress`, `/parent/assessments` |
| Notifications inbox | solid | `/notifications` |
| Settings, onboarding tour | solid | `/settings`; `OnboardingTour.tsx`; `schools.onboardingTourEnabled` |
| Enrollment AI assistant | solid | `/enrollment-assistant`; `POST /api/ai/enrollment-assistant` |
| Parent AI concierge | partial | Page route `/parent/concierge` exists. `server/api/parent-concierge.ts` is **not imported** anywhere under `server/` |
| Family AI insights | partial | `/ai-insights`; depends on data and Anthropic |
| Platform “Family Plan $29.99” picker | stub | `/payment-plans` → `PaymentPlans.tsx` (see §3) |
| Standalone class payment plans | stub | `/class-payment-plans/:classId` uses **inline mock class data** in `App.tsx` (~664–680), school name hard-coded to ASA |
| Curriculum / lessons / knowledge base browse | partial | `/curriculum`, `/lessons`, `/knowledge-base`. Marketplace and lesson generators are not the live parent enrollment path (see §7) |

### Student

| Feature | Maturity | Pointers |
|---------|----------|----------|
| Student login / learner portal | stub | No `/learner/*` routes. `LearnerDashboard.tsx` calls `/api/enrollments/me`, `/api/lessons/assigned`, `/api/badges/me`, `/api/events/upcoming/me` — those paths were not found as implemented product APIs. `AuthCallback.tsx` can send users to `/learner/dashboard`, which is not routed |

Students are `children` rows managed by parents and seen by mentors and school admins.

### Mentor / teacher (`/educator/*`)

| Feature | Maturity | Pointers |
|---------|----------|----------|
| Dashboard, my classes, class detail | solid | `App.tsx` ~718–727; `server/api/educator.ts` |
| Start session, live attendance | solid | `/educator/classes/:id/start-session`, `/educator/session/:id` |
| My students and student detail | solid | `/educator/students` |
| Weekly calendar and published week plans (read/print) | solid | `/educator/weekly-calendar`, `/educator/week-plans` |
| Assessments | solid | `/educator/assessments` |
| My hours, notifications, settings, staff guide | solid | matching `/educator/*` routes |
| Legacy class list by email | partial / unsafe | `GET /api/educator/classes?email=` in `server/api/educator.ts` (comment: migrate to authentication) |

Week Planner **authoring** (lesson links, materials, optional Google Drive) is a **school-admin** page: `/schools/week-planner` (`WeekPlannerPage.tsx`, `/api/schedule-builder/*`). Mentors consume published plans.

### School admin

Grouped from `UnifiedSchoolAdminSidebar.tsx` and `App.tsx`. Most of this surface is **solid** and is the product other co-ops would actually buy.

| Area | Features | Maturity | Pointers |
|------|----------|----------|----------|
| School | My school, edit profile/logo, settings, categories | solid | `/schools`, `/schools/my-school`, `server/api/schools.ts`, `server/api/school-admin.ts` |
| Campuses | Locations, activation threshold, wishlist close/activate | solid | `/schools/locations`; `server/api/locations.ts`; `location-activation-service.ts` |
| Door codes | Per-campus toggle, CSV import, per-family code | solid (flag off by default) | `LocationManagementPage.tsx`; `/api/school-admin/access-codes*` |
| Classes & sessions | CRUD, CSV upload, roster, F001 sessions, enrollments, grade auto-placement | solid | `/schools/classes`, `/schools/sessions`, `/schools/enrollments`; `server/api/admin-sessions.ts`; grade preview/sync on school-admin |
| Money | Discounts, memberships, manual payments, financial reports, refunds, credits, retention, analytics / cart funnel, payroll rates, payroll-day checklist | solid | `/school-admin/financial-reports`, `refunds`, `credits`, `analytics`, `retention-report`, `payroll-rates`; `/payroll-day` |
| Store & fundraising | Public store manager including event RSVP products; fundraisers | solid | `/school-admin/public-store`, `/school-admin/fundraisers` |
| People | Staff, invite, hours, positions, permissions, educators, students, users, parent profile, emergency contact lists | solid | `/schools/staff/invite`, `/school-admin/staff-permissions`, `docs/PERMISSIONS_ROLLOUT.md` |
| Academics | Schedule builder, week planner, assessments, attendance | solid | `/schools/schedule-builder`, `/schools/week-planner`, `/school-admin/attendance` |
| Comms & content | Form builder (+ AI draft), documents, knowledge base, announcements, notification campaigns, marketing links, school calendar | solid | `/school-admin/forms`, `/schools/notifications`, `/schools/calendar` |
| Import | School contact CSV (parents, children, staff, enrollments, payments by filename) | solid | `/schools/contact-import` → `POST /api/school-admin/contact-import` |
| Import hub | Generic data-import page | stub | `client/src/pages/schools/DataImportPage.tsx` has **no route** in `App.tsx` |
| Feature flags | financial reports, AI insights, door codes, daily hours, public store | solid | `server/lib/school-features.ts`; superadmin school edit |

Account deactivate sets `users.is_active` only (`docs/APP_KNOWLEDGE/architecture.md`). Children and payments remain.

### Platform / super admin

| Feature | Maturity | Pointers |
|---------|----------|----------|
| All schools, school detail, feature flags | solid | `/superadmin/schools`, `.../:id`, `.../edit` |
| School applications review UI | partial | `/superadmin/applications`. API list and status change have `// TODO: Add super admin authentication` (`server/api/school-applications.ts` ~269–309) and do not provision a tenant |
| Role invitations UI | stub | `InvitationsPage.tsx` is lazy-imported in `App.tsx` and **has no `<Route>`**. It calls `/api/role-invitations`; the router is mounted at `/api/admin/role-invitations` **without** auth middleware (`server/routes.ts` ~3346, `server/api/role-invitations.ts`) |
| System errors, technical support queue, volunteer credits | solid | `/admin/system-errors`, `/admin/technical-support`, `/admin/volunteer-credits` |
| Admin classes and contact import | partial | `/admin/classes*`, `/admin/contact-import` |
| `/admin`, `/admin/users`, `/admin/programs`, `/admin/reports` | stub | All render `Dashboard.tsx` (`App.tsx` ~903–909) |
| Features overview | partial | `/admin/features` is informational |

### Background jobs

Started from `server/index.ts` only when `shouldRunBackgroundJobs` is true. In production that means `ENABLE_BACKGROUND_JOBS=true` on **one** worker (`server/index.ts` ~76–83 and the log at ~555). Not set in `.replit` `[userenv.shared]`.

| Job | Maturity | Where |
|-----|----------|--------|
| Scheduled notifications (60s) | solid | in-process with the flag |
| Enrollment and scheduled-payment reminders | solid | reminder schedulers |
| Autopay off-session charges | solid | gated by autopay env flags; checklist `docs/AUTOPAY_PRODUCTION_CHECKLIST.md` |
| Location activation batch charge | solid | `location-activation-scheduler` |
| Credit expiration, checkout-funnel abandon, missed PaymentIntent sweep, membership status | solid | matching services under `server/` |
| JSON file “backups” | partial | `server/services/backupService.ts` copies `data/*.json`, not Postgres |
| Web push | stub | `server/api/push-subscriptions.ts` not mounted; no client usage found |

---

## 2. Multi-tenancy readiness

**Can it host many independent co-ops today?** As extra schools inside **one** ASA-operated deployment, **mostly yes**, if someone creates the school, registration code, campuses, sessions, and prices. As a product **other organizations sign up for and run on their own brand and their own Stripe account, no.**

### What is already tenant-shaped

- `schools` (`shared/schema.ts` ~73–129): name, logo, address, `registrationCode`, membership fee, `enabledFeatures`, `storeSlug`, `publicStoreEnabled`. Types include `school`, `co-op`, `homeschool_group`, `other`.
- Widespread `school_id` on locations, sessions, classes, enrollments, payments, credits, forms, store tables, staff, children.
- Parents join via `/register/:code`.
- Admins resolve school with `schools.admin_id` first, then `users.school_id`, then `user_roles` (`server/lib/resolve-school-id.ts`, `requireSchoolContext`). This exists because `users.school_id` alone was wrong in production.
- Superadmin can list schools.

### What is not isolated

- **No Postgres RLS on the live app path.** The API uses a privileged DB role. `fix-supabase-permissions.sql` explicitly `DISABLE ROW LEVEL SECURITY` on `accounts`, `schools`, and `role_invitations`. A missing `WHERE school_id` is a cross-tenant leak.
- **No custom domain or subdomain.** One hostname. `APP_URL` in `.replit` is `https://accounts.americanseekersacademy.com`.
- **No per-school Stripe account** (see §3). `users.stripeCustomerId` is one customer per user, not per school.
- **No theme colors.** Logo and name only.
- Global or weakly scoped tables include `notifications` (no `school_id`), `curricula` / `lessons` / `knowledge_bases` / `marketplace_items` (author-scoped), `stripe_payment_history` (no `school_id` in the billing review).
- `GET /api/schools` and `GET /api/schools/:id` are unauthenticated and return school rows. `GET /api/schools/:id` also calls `ensureSchoolRegistrationCode`, so a missing code can be **created** by an anonymous request (`server/api/schools.ts` ~379–407).
- `GET /api/schools/:id/students` returns **all children for that school id** with no auth (~426–441).

### Hard-coded ASA / Brighton

Brighton in Playwright specs and unit tests is fixture copy, not a global tenant id. These are product hard-codes:

| Location | What is fixed |
|----------|----------------|
| `client/index.html` 14–19 | Title, description, `og:url` `https://americanseekersacademy.com` |
| `client/src/pages/not-found.tsx` | Title “American Seekers Academy” |
| `client/src/pages/children/ChildProfilePage.tsx` ~81 | Fallback school name ASA |
| `client/src/pages/schools/ParentProfilePage.tsx` ~3673 | Literal “School: American Seekers Academy” |
| `client/src/pages/SchoolRegistrationPage.tsx` | Default form values prefilled as ASA (reported in review of that page) |
| `client/src/pages/RegistrationLandingPage.tsx` | Welcome toast and “Brighton Location” fallback |
| `App.tsx` mock class plan | `school: 'American Seekers Academy'` |
| `server/api/notifications.ts` ~1063–1080 | Email footer and sender name ASA |
| `server/api/school-admin.ts` ~265–321 | Welcome email body, sender `noreply@americanseekersacademy.com` |
| `server/api/admin-users.ts` ~83 | `schoolId \|\| 1` comment “Default to American Seekers Academy” |
| `server/api/registration.ts` ~186 | Location fallback `'Brighton'` |
| AI prompts | `server/api/payment-help.ts`, `parent-concierge.ts`, `smart-tutorial.ts` name ASA |
| `.replit` | `ERROR_NOTIFICATION_EMAIL`, `APP_URL` on the ASA domain |
| Docs / scripts | Prod notes such as “prod ASA = school id 2” in `docs/APP_KNOWLEDGE/runbooks/public-mentor-application-form.md`; `server/scripts/create-test-admin.ts` uses school id 1. **Not verified against the live database.** |

Door codes are per school and per family, not one global code.

### Gaps before another organization can sign up

1. Close unauthenticated school, child, and invitation APIs (§5).
2. Approving a school application must create the school, owner, registration code, and first campus. Today it logs a message.
3. Transactional email, login chrome, and AI prompts must use `schools.name` (and logo), not ASA.
4. Stripe: either one merchant of record with a written fee (still one account) or Connect (§3).
5. Custom domain is new work (DNS, cookies, `APP_URL`).
6. Empty-state checklist for a school with zero campuses, sessions, or staff. Registration **fails closed** without an active campus (`server/lib/persist-parent-location.ts`).
7. Superadmin school stats load children per school (`server` superadmin schools helper). Fine for a handful of tenants; not a scale design. **Unknown:** how many schools exist in production.

---

## 3. Billing readiness

### What Stripe does today (family → school, one platform account)

Config: `server/config/stripe.ts` (env keys, and a Replit connector when `REPLIT_DEPLOYMENT` is set). Test override: `server/test-env-loader.ts` (`TESTING_STRIPE_SECRET_KEY`). Webhook: `POST /api/stripe/webhook` with `constructEvent` in `server/webhook-handler.ts`. Dev bypass only if `STRIPE_WEBHOOK_DEV_BYPASS=true` and `NODE_ENV` is development or test.

| Flow | Mechanism | Files |
|------|-----------|--------|
| Cart / tuition checkout | PaymentIntent + Elements | `server/api/stripe.ts`, `server/services/stripe-payment-plans.ts` |
| Installments 2+ | Rows in `scheduled_payments`, not Stripe Subscription Schedules | same + `server/api/scheduled-payments.ts` |
| Pay Now | PaymentIntent | `server/lib/scheduled-payment-parent-pay.ts` |
| Pay All | One PaymentIntent for combined balances | `server/api/billing.ts` `POST /api/billing/pay-balance` |
| Autopay | Off-session PaymentIntent | `server/services/autopay-off-session-charge.ts`, `server/api/auto-pay.ts` |
| Annual family membership | Checkout Session `mode: 'subscription'` + invoice/subscription webhooks | `server/api/parent.ts`, `server/api/membership-admin.ts`, `processMembershipStripeEvent` |
| Public store | Checkout Session `mode: 'payment'` → webhook `store_checkout` | `server/api/public-store.ts`, `server/lib/store-fulfillment.ts` |
| Fundraiser | Checkout Session created | `server/api/fundraisers.ts`. **No matching fulfillment in `webhook-handler.ts`** |
| Refunds | `charge.refunded` plus admin refund APIs | `server/webhook-handler.ts`, `server/api/payment-history.ts` |
| Credits | Applied at checkout and on pay-balance | `server/services/cart-credits-only-checkout.ts`, `server/utils/manualPayCredits.ts` |

Fulfillment is server-side (`server/lib/finalize-succeeded-payment-intent.ts`) with the webhook as backup. Idempotency is real for payment rows (PaymentIntent id, ledger claim). Pay-balance idempotency is **process memory** (`server/api/billing.ts`); the client was not found sending `Idempotency-Key`. Two app instances can create two Pay All intents.

**Test vs live:** dev can force test keys. Production warns if the key is not `sk_live_` / `pk_live_` (`server/config/stripe.ts`). No application check was found that rejects a test-mode PaymentIntent when the server is in production. Missed-PI sweep reads `STRIPE_SECRET_KEY` directly (documented in `docs/APP_KNOWLEDGE/domains/payments-and-billing.md`), which can diverge from the Replit connector client. `.replit` sets `PAYMENT_PROCESSOR_ENABLED=true`; the primary webhook path does not go through `PaymentProcessor`. **Unknown:** which Stripe account (test vs live) the Replit deployment actually uses.

**Connect:** no `application_fee_amount`, `transfer_data`, `on_behalf_of`, or connected-account creation in application code. `stripe.accounts.retrieve()` appears only as a preflight in `server/scripts/autopay-preflight.ts` (the platform account). **All charges settle to one Stripe account.**

### What is missing to sell the platform as SaaS

| Need | Status |
|------|--------|
| Plans in Stripe | UI prices are placeholders: `price_family_monthly`, `price_educator_monthly` in `PaymentPlans.tsx` (~48). No `stripe.products.create` / `prices.create` in `server/` |
| Checkout that the UI can call | UI posts `/api/platform-subscriptions/create` and `/free`. Server implements `/api/subscriptions/create` and `/free` (`server/routes.ts` ~1353–1420) |
| Entitlement after pay | Webhook handler does not apply `metadata.planId` to the user. `SubscriptionSuccess.tsx` does not confirm the session |
| `users.subscription` | Enum exists (`free`, `individual`, `family`, `educator`, `institutional`) in `shared/schema.ts` ~22. **`subscriptionStatus` is written in `routes.ts` and is not a column in `shared/schema.ts`** |
| Feature gating by plan | Not found. School feature flags are a superadmin JSON blob, not a paid plan |
| Billing Portal, trials, seat/student pricing, dunning for the platform | Not found (`billingPortal` has no matches) |
| Customer split | Platform checkout reuses `users.stripeCustomerId`, the same field as parent tuition |

Membership `invoice.payment_failed` updates `membership_enrollments`. That is school-membership dunning, not SaaS dunning.

### What is missing for a platform fee on tenant payments

Connected accounts, Account Links, application fees, and fee reporting. Effort is **L**: schema (`schools.stripe_account_id`), Connect onboarding, every PaymentIntent and Checkout Session, webhooks, refunds, and autopay must pass the connected account. Until then, other schools’ tuition would land in ASA’s Stripe balance.

---

## 4. Onboarding / self-serve

### Parent (works if the school is already configured)

1. `/register` → code → `/register/:code` (`RegistrationLandingPage.tsx`).
2. `POST /api/auth/register` creates a Supabase user and a Postgres user, requires at least one child, and requires a campus when the school has locations.
3. If `membershipFeeAmount > 0`, a pending membership enrollment is created.
4. Parent lands on `/dashboard`, can open `/enroll`, cart, and checkout.

A stranger **cannot** do this until a registration code, an active school, a campus, and something to buy already exist. That setup is Corey’s (or a school admin’s) job today.

**Unknown:** whether `POST /api/auth/register` checks that `registrationCode` matches `schoolId`, or trusts the client. The validate-code endpoint does check the code; the register body should be re-checked before calling this safe. Mark as a review item, not a confirmed bypass.

### New organization (does not work unattended)

| Path | Result |
|------|--------|
| School application | Stores `school_applications`. Approve sends email and logs that an invitation “should be created”. No `schools` row |
| Application UI while logged out | Redirected to login (`App.tsx` public allowlist does not include `/school-application`) |
| `POST /api/schools` | Any **logged-in** user can create a school and become `schoolAdmin` (`server/api/schools.ts` ~24). No payment |
| `POST /api/school-admin/setup-school` | Same idea from My School empty state (`MySchoolPage.tsx`) |
| Superadmin invitations page | Unrouted (§1) |

There is no “pay then receive a tenant” flow.

### Invites and roles

- Staff invite is real: `/schools/staff/invite` → email → `/accept-educator-invitation`.
- Platform role invitation API exists and is under-protected (§5).
- Parents are expected to use the school code, not a parent invite. `RoleManagementPage.tsx` copy mentions inviting parents; a dedicated parent-invite API was not confirmed.

### Import and empty states

- School CSV import is routed and school-scoped (`ContactImportPage.tsx`, school-admin contact-import).
- `DataImportPage.tsx` is unrouted. `POST /api/payment-import/upload-payments` (`server/api/payment-import.ts`) has **no auth**.
- Empty My School offers “Create School”. Registration with a bad code shows an error card. Zero campuses block parent signup. A guided “your school has no sessions yet” checklist across admin pages was **not** found.

### What a stranger still needs from Corey

An active school, registration code, at least one campus, sessions or store products, membership text if a fee is charged, Stripe that actually charges the right account, and door-code / feature flags if those matter. Application approval will not do this.

---

## 5. Security and reliability blockers

These are launch blockers for **any** new paid audience, including more ASA families, because several of them expose children.

### Secrets and PII in git

| Path | Tracked | What | Do not treat as safe |
|------|---------|------|----------------------|
| `db_push_output.txt` | yes | `postgresql://` URL, user `postgres`, password present (15 characters), host suffix `supabase.co` | Rotate that database password even if the Supabase project is paused. Purge the file from history. Whether this password matches the **current Replit** database is **unknown** |
| `create-supabase-auth-account.js` | yes | Hardcoded password and a Gmail address used to create an auth user | Rotate that user’s password; delete the script from the repo |
| `data/user-profiles.json` | yes | Owner profile: name, email, phone | Remove from git; treat the phone as exposed |
| `data/children.json` | yes | One child row including `birthdate`, names, `parentEmail` | Treat as child PII until proven to be a fake fixture |
| `data/staff.json` | yes | 9 rows with name, email, phone | Same |
| `data/schools.json`, `data/school-data.json` | yes | Address, phone, email, registration code | Same |
| `data/scheduled-payments.json` | yes | 52 rows with `parentEmail` | Same |
| `data/payment-history.json` and `data/archive_legacy_json/*` | yes | Parent email, child name, Stripe ids | Same |
| `data/password-reset-tokens.json` | yes | Empty object `{}` | Low; still a token store pattern in git |
| `playwright.config.ts` | yes | Stripe **sample** `sk_test_` / `pk_test_` keys (documented test keys, not `sk_live_`) | Not a live secret. No `sk_live_` key was found in tracked source |

`.env`, `.env.prod`, and `.env.e2e` are gitignored. No committed Google service-account JSON was found. `secrets/` is gitignored.

### Authorization holes (verified in source)

Unauthenticated:

- `GET /api/children/:id` returns the child row (`server/routes.ts` ~2213–2232), including fields defined on `children` such as birthdate, allergies, medical info (`shared/schema.ts` ~552+).
- `GET /api/children/:id/enrollments` (~2164).
- `GET /api/schools/:id/students` (`server/api/schools.ts` ~426).
- `GET /api/schools` and `GET /api/schools/:id` (~130, ~380), including registration code generation.
- `GET /api/school-admin/debug-users` lists id, email, role, `supabaseId` (`server/api/school-admin.ts` ~518). `GET /api/school-admin/test` (~512).
- `server/api/admin-users.ts`: `GET /users/email/:email`, `POST /users/create-from-enrollments`, `POST /users/update-role`, `POST /users/migrate-to-supabase`, `POST /users/sync-supabase-role` have **no** `supabaseAuth`. The router is mounted with no gate (`server/routes.ts` ~2150). The export route later in that file **does** use auth (~551).
- `GET/POST /api/admin/backups` and `POST /api/admin/backups/restore/:timestamp` (`server/routes.ts` ~3789–3823). Comment says “development only”; the handlers are not wrapped in a `NODE_ENV` check.
- `POST /api/migration/migrate` (`server/routes/migration.ts` ~20) runs SQL.
- `GET` and `PATCH` school applications (`server/api/school-applications.ts` ~269, ~307) with TODOs for superadmin auth. `GET /:id` and `POST /check-status` are also open.
- `POST /api/payment-import/upload-payments`.
- `/api/admin/role-invitations` list/create/revoke without auth on the router.

Authenticated school-admin modules (`requireSchoolContext`, permissions) are the normal path and are in better shape. This audit did **not** prove every authenticated handler filters `school_id`. One miss is enough while the DB role can read all tenants.

`/api/test/*` is registered when `NODE_ENV !== 'production'` and uses a header `X-Test-Token`. **Unknown** whether any public Replit dev URL is left in non-production mode.

### Child data, COPPA / FERPA

Stored on children: birthdate, grade, gender, special needs, allergies, medical info, emergency contact, notes, school, parent email (`shared/schema.ts`). Parents and school staff are the intended readers. The unauthenticated routes above bypass that.

Membership agreement signing exists (`server/api/membership-agreement.ts`). That is a school policy signature, not an age gate. No under-13 consent flow was found in client or server. COPPA/FERPA appear in product docs (`docs/PRODUCT_REQUIREMENTS_DOCUMENT.md`) as policy language, not as enforced product behavior.

Export: school-admin CSV of users and children (`admin-users.ts` export, authenticated). Delete child: school-admin and parent profile flows exist. A full account-erasure / parent data-download API was **not** found.

This is not legal advice. Before paid growth, a lawyer should look at who is the school vs the vendor, what is in the membership agreement, and whether a vendor processing children’s education records needs FERPA school-official terms and a COPPA plan if under-13 accounts are ever opened directly.

### Rate limiting, backups, monitoring, tests

- `express-rate-limit` is used on billing, public form submit, some analytics and AI routes. There is **no** global limiter in `server/index.ts`. Limiters are in-memory (one Replit process each).
- `piiRateLimit` (100/hour) is used from location enrollments, not from the open child routes.
- In-app backup copies legacy JSON, and the HTTP API to list/restore it is unauthenticated. Postgres backups are **not** implemented in this repo. `docs/DEPLOYMENT_AND_MAINTENANCE_GUIDE.md` mentions `pg_dump`. `.github/workflows/fall-2026-roster-snapshot.yml` uses a `PROD_DATABASE_URL` secret. Whether Replit/the host has point-in-time recovery is **unknown**.
- Sentry: `server/lib/sentry.ts` and `client/src/lib/sentry.ts` initialize when DSN env vars are set. Scrubbing: `shared/sentry-scrub.ts`. In-app error telemetry: `server/api/error-telemetry.ts`. **Unknown** if production DSN is set. It is not in `.replit` shared env.
- Tests: **76** `e2e/*.spec.ts` files; **214** `server/tests/**/*.test.ts` files. PR Tests workflow runs production-path plus client jsdom, not the full server suite (`docs/APP_KNOWLEDGE/domains/ci-and-testing.md`). Playwright covers registration, checkout options, store, event RSVP, educator invite, membership agreement. It does **not** cover the unauthenticated IDOR routes, school-application admin APIs, or COPPA.

### Deployment

`.replit`: VM deploy, `npm run build` / `npm run start`, dev workflow port 5000, integrations for Stripe, Twilio, and object storage. `PAYMENT_PROCESSOR_ENABLED=true` and post-payment verify flags are committed as shared env (non-secret). Background jobs default **off** in production until `ENABLE_BACKGROUND_JOBS=true` on exactly one process. If that flag is off, reminders, autopay, and scheduled notifications do not run. **Unknown** whether production has it on.

`CombinedStorage` (`server/storage.ts`) falls back to memory/JSON if Postgres is missing. Production startup checks Supabase env vars; a bad `DATABASE_URL` in a non-prod process can look “up” on JSON. Do not point paid users at that.

WebSockets are disabled when `NODE_ENV` is production (`server/routes.ts` ~3774–3786).

Auth code still uses Supabase JWT and the service role (`server/middleware/supabase-auth.ts`, `server/db/supabase.ts`). The user context for this audit says old Supabase projects are paused and the live database is Replit’s Postgres. **This repo cannot confirm which database URL production uses.** If Auth still depends on a paused Supabase project, login breaks even when Postgres is healthy. That live check was out of scope.

---

## 6. Performance and SEO of public pages

Architecture: Vite React SPA (`client/src/main.tsx`). Production Express serves `dist/public` and falls back to `index.html` (`server/vite.ts`). No SSR, prerender, or SSG config was found.

| URL | Render | Meta |
|-----|--------|------|
| `/store/:schoolSlug` and item pages | Client fetch after JS | No per-route title/OG in `client/src/pages/public-store/` |
| `/forms/:slug` | Client fetch (`staleTime: 0`) | Sets `document.title` after load (`DynamicFormPage.tsx`) |
| `/register/:code`, `/school/:code` | Client | Inherits `index.html` |
| `/fundraiser/...` | Client | Inherits `index.html` |
| `/` logged out | Login | Inherits `index.html` |
| `Home.tsx` marketing | Not routed | Would set a title if it were mounted |

`client/index.html`: title, description, `og:title`, `og:description`, `og:type`, `og:url` (apex `americanseekersacademy.com`, not `accounts.`), theme color, Google tag `G-C95K2BBZSS`. **No** `og:image`, Twitter card, canonical, `robots.txt`, or `sitemap.xml` in the repo. **Unknown** whether the Replit host adds a robots file.

Consequences: link previews for a brunch store URL show the global ASA card, not the event. Crawlers that do not run JS see an empty `<div id="root">`. Store images are normal `<img>` tags to object storage; a systematic lazy-load/srcset pass was not done. The app is large but routes are `lazy()` in `App.tsx`, so the store page does not need every admin page in the first chunk. Auth still boots providers on those routes.

SEO work matters if the store and forms are meant to be found on Google. It does not block an invited parent who already has a registration link.

---

## 7. Monetization fit

Effort: **S** = a few existing modules, no new billing model; **M** = several modules plus tests and a product decision; **L** = new money model (Connect or real SaaS billing) or a cross-tenant security retrofit plus white-label.

Ranked by how close the code is to collecting money, not by theoretical TAM.

### 1. ASA keeps charging families (tuition, membership, store, events) — do this first

- **Exists:** PaymentIntents, installments, Pay All, autopay, credits, refunds, membership subscriptions, public store and event RSVP, fundraisers (checkout only), financial reports.
- **Must build:** Security lockdown (§5) before more families. Fundraiser webhook fulfillment if those campaigns should record orders (**S**). Confirm live vs test Stripe and that background jobs run (**S**, ops).
- **Dependencies:** One Stripe account already in use; membership agreement; school catalog configured.
- **Risks:** Open child/roster APIs; Pay All duplicate intents across processes; fundraiser sessions that never fulfill; Replit connector vs `STRIPE_SECRET_KEY` mismatch.

This is income for the school, not a software company. It is still the only path that works this month.

### 2. SaaS subscription for other co-ops / microschools — best software product, not ready

- **Exists:** Schools, registration codes, locations, sessions, staff permissions, billing for **their** families, store, forms, planner, superadmin school list, a plan picker UI with prices ($0 / $29.99 / $49.99 / institutional in `PaymentPlans.tsx`).
- **Must build:** Authz (**L** if done properly across `routes.ts`), application → tenant provisioning (**M**), fix plan API/webhook/entitlement (**M**), Billing Portal and dunning (**M**), gate features by plan (**M**), transactional email using the school name (**S/M**). Seat or student pricing is **not** started (**M** on top of working subscriptions).
- **Dependencies:** Decision: flat school fee vs per-student. Legal terms. A second Stripe product that does not share the parent tuition customer blindly.
- **Risks:** Shipping `PaymentPlans.tsx` as-is charges nothing and implies features (unlimited AI, custom branding) the flags do not enforce. A second school on ASA’s Stripe account mixes their families’ money with ASA’s.

### 3. Platform fee on tuition and event payments (Connect) — pairs with #2, larger build

- **Exists:** The charge flows a fee would wrap. Nothing in Connect.
- **Must build:** Connected accounts, onboarding, application fees on every PI and Checkout Session, refunds, autopay, store, webhooks (**L**).
- **Dependencies:** Stripe Connect approval, who is merchant of record, tax, and what happens when a school’s account is restricted.
- **Risks:** Autopay and Pay All are the easy places to forget `stripeAccount` / `application_fee_amount` and either fail the charge or drop the fee.

### 4. Family subscription for the planner (homeschool parents, no co-op)

- **Exists:** Week plans, parent `/schedule`, supply lists, progress, assessments, and marketing copy on the Family Plan card.
- **Must build:** A tenant-free or auto-provisioned “household school”, plan enforcement, and working Stripe Billing (**M/L**). Today the planner assumes a school published the week.
- **Dependencies:** Curriculum Corey is willing to attach; AI cost (Anthropic) if “unlimited worksheets” stays on the card.
- **Risks:** The card promises custom branding and premium knowledge bases that are not gated. Parents already pay ASA tuition; a second subscription needs a clear extra.

### 5. Paid curriculum / lesson-plan library

- **Exists:** Knowledge base routes, curriculum and lesson tables, week planner links, some AI generation routes. Parent `/lessons` is not the production enrollment path.
- **Must build:** Catalog, entitlement, and a purchase that is not the broken platform-subscription path (**M**).
- **Dependencies:** Content ownership and copyright. Drive service account is an ops prerequisite for the planner (`docs/APP_KNOWLEDGE/runbooks/google-drive-service-account.md`), not a storefront.
- **Risks:** `server/api/marketplace.ts` author checks use `req.session.userId` while `isAuthenticated` is Supabase JWT (`server/api/auth.ts` ~33–38). That marketplace is not a safe thing to charge for until auth matches.

### 6. Marketplace where mentors sell to families

- **Exists:** `marketplace_items` schema and `server/api/marketplace.ts` (session-shaped).
- **Must build:** Public catalog, Connect or a ledger for payouts, reviews, tax (**L**).
- **Dependencies:** #3 if mentors are paid out. Supply of mentors.
- **Risks:** Same session/JWT split. No payout code.

### 7. White-label for ASA-style schools

- **Exists:** `schools.name` and `schools.logo`; registration landing can show the school name.
- **Must build:** Strip ASA from shell, email, AI, PDFs (`AsaWeeklySchedulePrintSheet`), custom domains, and #2 or #3 for money (**L**).
- **Dependencies:** #2 at minimum. Brand kit per school (colors are not in the schema).
- **Risks:** Easy to miss one email footer and ship another school’s parents an ASA receipt.

---

## 8. Roadmap to “open to paid users”

Buckets are priority order. S/M/L are scope, not a promise of calendar duration.

### Must-have before more paid users (including more ASA families)

1. **Rotate and purge secrets (S, ops).** Database password in `db_push_output.txt`. Password in `create-supabase-auth-account.js`. Assume `data/*.json` PII is public. Remove those files from the branch and from git history. Confirm the live Replit database password is not the leaked one.
2. **Shut the unauthenticated PII and admin routes (M).** At minimum: `GET /api/children/:id` and enrollments, `GET /api/schools/:id/students`, unauthenticated `GET /api/schools` and `/:id` (stop anonymous registration-code generation), `debug-users`, `admin-users` mutations, backups, `POST /api/migration/migrate`, school-application list/patch, payment-import upload, role-invitation admin router. Add a regression test that an anonymous request gets 401. Do this before any marketing of the app.
3. **Confirm operations (S, ops, unknown until checked in Replit).** `ENABLE_BACKGROUND_JOBS` on exactly one worker. Webhook endpoint and secret match the Stripe account that creates PaymentIntents. Host Postgres backups / PITR exist. Sentry DSN set or an explicit decision not to use it. Supabase Auth project is the one production still uses, not a paused project.
4. **Do not send people to `/payment-plans` (S).** Hide or remove the route until §3 is real, so nobody pays a placeholder price id or thinks branding is included.

### Next (first 30 days of product work after the lockdown)

- Fundraiser fulfillment or hide fundraiser checkout (**S**).
- Pay-balance idempotency that survives two processes (**S/M**).
- School-named email sender and footer for welcome and notification mail (**S**).
- Public allowlist decision for `/school-application` (**S**) and, if applications stay, superadmin auth plus “approve creates school + code + owner invite” (**M**).
- Rate limits on auth, registration, and the public store/form endpoints that do not have them (**S**).
- `robots.txt` plus a real OG image only if store links will be shared widely (**S**). SSR is not required for parents with a direct link.

### Following (about 60 days)

- Stripe Billing that matches the UI: real Price ids, webhook sets `users.subscription`, success page confirms the session, Billing Portal, failed-payment email (**M**). Pick **one** price: per school, or per active student. Do not implement both.
- Feature gate: unpaid school gets registration and a campus; paid school gets store, door codes, or AI (**M**). Reuse `enabledFeatures` rather than a second flag system.
- Admin first-run checklist: campus, registration code, one session or one store product (**S/M**).
- Authz pass on remaining school-admin handlers that still trust `users.school_id` only (**M**).
- Parent data export of their children and payments (**M**) if a lawyer says FERPA/COPPA-style access rights apply to the vendor.

### Later (about 90 days), only after a second real school is the goal

- Stripe Connect application fee on tuition, store, and autopay (**L**), **or** stay merchant of record and invoice schools a SaaS fee. Doing neither and onboarding a second school mixes funds.
- De-ASA the remaining chrome (login title, AI prompts, print stylesheet) (**M**).
- Custom domain (**L**). Skip until two schools are paying.
- Curriculum SKU and mentor marketplace stay off the critical path until Connect or a ledger exists.

**Do not** open self-serve org signup that only calls `POST /api/schools` with no payment and no authz fix. Any logged-in user can already create a school row.

---

## Unknowns (not guessed)

- Whether the leaked Supabase password still works, and whether production `DATABASE_URL` is Replit Postgres or that Supabase host.
- Whether production Supabase Auth is paused.
- Live Stripe mode, webhook event list in the Stripe dashboard, and `ENABLE_BACKGROUND_JOBS` / `SENTRY_DSN` on the VM.
- Host-level backups and how many schools/children are in production.
- Whether `POST /api/auth/register` binds `registrationCode` to `schoolId` on the server.
- Whether every authenticated admin query filters by the resolved school. The open routes in §5 are confirmed; the rest are not certified.
- Production `robots.txt` or CDN caching outside this repo.
- Intended product status of the learner portal and the parent concierge (page exists, API not mounted).

---

## How this was checked

Read `docs/APP_KNOWLEDGE/README.md` and `architecture.md`, then route tables, `shared/schema.ts` `schools`, Stripe and webhook call sites, `App.tsx` public allowlist, `.replit`, and `git ls-files` for the secret files. Secret **values** are not copied into this report. Counts: 76 Playwright specs, 214 server test files, `main` at `c800d99`.
