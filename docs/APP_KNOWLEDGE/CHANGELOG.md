# App knowledge changelog

## 2026-07-14 (Week Planner CSV mapping + import fix)

- Week Planner CSV now uses shared `ScheduleBlocksCsvImportDialog` (`mode="week-plan"`): map → preview → confirm; surfaces server validation errors.
- **Confirm Import root cause:** API passed `{ dayOfWeek, startTime, data }` but `bulkUpdateWeekPlanBlocks` expects `{ skeletonBlockId, title, … }` → DB/create failures. Import now matches template slots by day+start_time and accepts `default_title` (template CSV shape).
- Domain: [schedule-and-lesson-planning.md](./domains/schedule-and-lesson-planning.md).

## 2026-07-14 (Week Planner Actions menu + Build)

- Week Planner week-card header: cluttered button row → single **Actions** dropdown; added **Build** (fill empty slots from skeleton `defaultTitle` / `defaultDescription`).
- Domain: [schedule-and-lesson-planning.md](./domains/schedule-and-lesson-planning.md).


## 2026-07-14 (Collections Overview Auto-pay on = 0 — fixed)

- **UI bug, not empty data:** ASA prod has **5** owing parents with `users.auto_pay_enabled` (plus 2 more with flag but no collections balance). Charge history Jul 2026 is correctly $0 (no `charged_by=auto_pay` / autopay `completion_source` rows; next autopay-on dues start ~Jul 19).
- **Root cause:** `loadParentInfo` in `server/lib/financial-collections.ts` iterated `db.execute(...).rows`; drizzle/postgres-js returns an array → catch forced every family `autoPayEnabled: false`.
- **Fix:** select `users.autoPayEnabled` in the existing drizzle parent query; unit guard against `execute().rows` / raw `COALESCE(auto_pay_enabled`.
- **Doc:** [payments-and-billing.md](./domains/payments-and-billing.md) — Collections Overview criteria + pitfall (marked fixed).

## 2026-07-14 (Checkout payment options E2E audit)

- **Runbook:** [checkout-payment-e2e-audit.md](../runbooks/checkout-payment-e2e-audit.md) — matrix of pay-in-full, biweekly, Pay Now, partial/credits-only, membership.
- **Spec:** `e2e/checkout-payment-options-audit.spec.ts` (incl. no auto-spend when credits unchecked + confirm for credits-only).
- **Catalog:** [E2E_COMMANDS.md](../../E2E_COMMANDS.md).
- **Helpers:** `goCheckoutAndWaitForPaymentCard` waits for enrollments + Pay button (not Loading); `registerAnotherChild` uses Grade/Gender labels + `exact: true` for Male.
- **Blocker observed:** local `VITE_TESTING_STRIPE_PUBLIC_KEY` rejected by Stripe (`elements/sessions` 401 Invalid API Key) while `TESTING_STRIPE_SECRET_KEY` still works — rotate publishable key from Dashboard for same account, then re-run audit.

## 2026-07-14 (Credits auto-spent on checkout load)

- **Cause:** `POST /create-payment-intent` (called on page load / plan toggle) immediately ran `completeCartCreditsOnlyCheckout` whenever credits covered the cart — no Pay click required.
- **Fix:** Require `confirmCreditsOnlyCheckout: true` to spend; otherwise return `creditOnlyEligible`. Checkout shows **Apply credits & complete enrollment**. CartSuccess handles `?creditOnly=true`.

## 2026-07-14 (Cart total dropping on reload)

- **Cause:** Checkout cart line price = enrollment `remainingBalance`. Broken credits-only attempts (and a later $60 credits-only) wrote `totalPaid` down ($780→$60→$0) while UI still looked mid-checkout.
- **Ledger bug:** `finalizeCreditHolds` updated `credits.used_amount` then failed inserting usage logs (bad `payment_history_id`) **without a transaction** — credits burned with no log.
- **Fixes:** transactional `finalizeCreditHolds`; PI only sends credits when Apply is checked; credit-toggle effect skips initial mount; repaired credit #22 `used_amount` to match usage logs for jocimarie test parent.

## 2026-07-14 (Checkout credits checkbox vs displayed total)

- **Bug:** After applying then unchecking credits (or after a failed credits-only attempt), Pay-in-Full / plan amounts could keep a **stale snapshot** that still subtracted credits while “Apply to order” was off.
- **Fix:** Track `snapshotCreditsApplied`; only trust snapshot `payableAmount`/`paymentPlans` when it matches `creditsToApply`; always refresh snapshot/PI on credit toggle even if `clientSecret` is missing.

## 2026-07-14 (Credits-only cart checkout FK)

- **Error:** “Failed to complete credits-only checkout” — `finalizeCreditHolds` was given `payments.id`; FK requires `stripe_payment_history.id`.
- **Fix:** `cart-credits-only-checkout.ts` writes/links synthetic `stripe_payment_history`, finalizes against that id; cleans orphan `payments` on failure; skips re-apply only when usage logs already exist.

## 2026-07-14 (Schedule builder publish-ready)

- **Domain:** [schedule-and-lesson-planning.md](domains/schedule-and-lesson-planning.md) — mounts on `index` + `app-init`, CSV `fileUpload` + `csv-stringify`, family jsonb parse, progress scheduled-lessons, academics KPI `classId` on attendance half.
- **Lessons / AI:** `Lessons.tsx` → live `GET /api/lessons`; `AILessonGenerator` → `POST /api/lessons/generate` (Anthropic) + real save; no silent mocks.
- **Tests:** Jest schedule-builder / family-schedule / progress / KPI / attendance; Playwright catalog rows for publish, parent week, progress pills, KPI, CSV import. Seed: `setup-schedule-builder-scenario`.
- **Deferred:** completion → `student_progress_log`; schedule-ai `recommend-resources` UI; family `/schedule` Playwright (unit coverage only).


## 2026-07-13 (E2E CI harden — PR #49)

- **Auth setup:** soft-skip when `E2E_PARENT_*` cannot leave `/login` (ephemeral CI DB / `REGISTRATION_REQUIRED`).
- **Stripe:** payment specs skip unless a real `sk_test_*` secret is set (docs sample key is not valid).
- **Registration E2E:** wait for locations `?code=` (not only `schoolId=`); `selectOption` uses string labels.
- **Store E2E:** guest cart asserts contact after step1; referral checkout seeds `$0` merch to avoid Stripe.
- **Forms rate limit:** per-form limiter keys + higher CI cap so spam burst does not starve other form specs.

## 2026-07-10 (CI auth sync + Postgres health-check clarity)

- **Auth sync:** `UserSyncService.syncAuth0User` looks up by `supabaseId`/`auth0Id` then `LOWER(email)` so E2E seeds do not hit `users_email_lower_idx` on login.
- **CI:** `pg_isready -U test -d asa_test` — `POSTGRES_USER=test` is the role; DB name remains `asa_test` (not a mismatch with `DATABASE_URL`).

## 2026-07-10 (Custom forms best-in-class + AI Smart Builder)

- **Editor:** Debounced field PUTs, functional state, query invalidation; Preview → admin preview; by-slug `staleTime: 0`.
- **Submit:** Admin + submitter emails (`notifyOnSubmission` / `sendSubmitterConfirmation`); honeypot; rate limit; duplicate + required-field enforcement.
- **AI:** `POST /api/form-builder-ai/chat` + `FormSmartBuilderPanel` + `apply-draft` (draft only, no auto-publish); `FORM_BUILDER_AI_MOCK` for E2E.
- **E2E:** `form-editor-fields`, `form-submission-notify-spam`, `form-smart-builder` — catalogued in E2E_COMMANDS.
- **Docs:** [custom-forms-public-access.md](domains/custom-forms-public-access.md).

## 2026-07-02 (School analytics v1 gaps)

- **Abandon cron:** `checkout-funnel-abandon-job.ts` emits `abandon` after 24h idle (6h tick).
- **Public store purchase funnel:** `recordCheckoutFunnelPurchase` on store fulfillment; stable `public-store-{orderId}` correlation.
- **Progress Insights:** campus dropdown (locations by name) instead of raw location ID.

## 2026-07-01 (School Analytics Platform)

- **Feature:** School Analytics page (`/school-admin/analytics`) — Engagement, Cart Abandonment, Student Progress tabs with demographic filters.
- **Progress:** Progress Insights tab on Assessments; parent `/parent/progress` Charts tab with reading/math APIs; Lexile parser + `progress-analytics.ts`.
- **Telemetry:** `user_activity_events`, `checkout_funnel_events` tables; `POST /api/telemetry/activity` and `/checkout-funnel`; `ActivityTelemetry` in `App.tsx`.
- **Tests:** Integration specs under `server/tests/integration/*analytics*`; E2E `school-analytics-engagement`, `school-analytics-cart-abandonment`, `parent-progress-charts`.
- **Docs:** [school-analytics.md](domains/school-analytics.md).

## 2026-07-02 (Public store — share links & referral attribution)

- **Share:** Catalog cards and item detail include Share — message auto-includes title, price, description, and link. Logged-in users append `?userId={users.id}`; guests share without param.
- **Attribution:** `?userId=` captured in sessionStorage (last-touch per store) and sent at checkout; persisted on `store_orders.metadata.referral` and admin Sign-ups table/CSV.
- **E2E:** `e2e/public-store-share.spec.ts` — share UI, clipboard message, referral capture, checkout payload, admin sign-ups referral column.

## 2026-07-01 (Public store — product pickup vs shipping)

- **Checkout:** Carts with products include a Delivery step — pick up at campus or ship (full address required).
- **Persistence:** `productDelivery` on checkout snapshot + order metadata; shown on success page, confirmation email, admin sign-ups CSV.

## 2026-07-01 (Public store — header description)

- **UI:** Removed clamped school description from sticky store header; full intro text shows once on the browse page body (`store-intro-description`).

## 2026-07-01 (Public store — auth redirect E2E)

- **E2E:** `e2e/public-store-auth-redirect.spec.ts` — login from store browse, item detail, merch checkout contact, and program checkout children step; asserts `returnTo`, cart persistence, member banner.
- **Seed:** `setup-public-store-scenario` supports `withParent` + `linkSupabaseAuthParent` (same-school parent for store login tests).
- **UI:** Checkout contact step includes Sign in link (`store-checkout-sign-in`); header uses `store-header-sign-in`.
- **Fix:** Removed duplicate `/login` redirect in `App.tsx`; `SupabaseLogin` uses `consumeAuthReturnDestination()` so `returnTo` is not cleared twice (was sending users to `/dashboard` instead of the store).

## 2026-07-01 (Public store — catalog & detail UX)

- **Browse:** Cards show type badge, price, dates, 2-line teaser, and explicit “View program/product details” link; sections split **Programs & classes** vs **Shop** when both exist.
- **Detail:** Same slug URL for all listing types; layout adapts — merch shows stock + product copy; programs show schedule + enrollment copy; full description never clamped; desktop sticky purchase panel.

## 2026-07-01 (Public store — slug URLs for catalog items)

- **URLs:** Item detail pages use `/store/:storeSlug/:itemSlug` (e.g. `kayak-quest-week-1`) instead of `/store/:slug/item/:listingId`.
- **API:** Catalog items include `slug`; `GET …/catalog/:catalogKey` accepts slug or legacy numeric id.
- **Legacy:** `/store/:slug/item/:id` redirects to the canonical slug URL.

## 2026-07-01 (Parent dashboard — registered campus on children & enrollments)

- **API:** `GET /api/parent/children`, `/api/parent/children/:id`, and `/api/parent/enrollments` now include `locationName` (and `registeredLocationName` on enrollments) resolved from `users.location_id` with child `location_id` fallback via `server/lib/parent-registered-location.ts`.
- **UI:** Parent Dashboard Children + Enrollments tabs, child profile, children list, and child enrollments page show the family’s registered campus.

## 2026-07-01 (Public store — admin sign-ups export)

- **Admin UI:** Public Store → **Sign-ups** tab with searchable table and CSV export (child, parent, emergency contact, order #, payment).
- **API:** `GET /api/school-admin/public-store/signups` and `/signups/export`.

## 2026-07-01 (Public store — confirmation email)

- **Email:** Branded store purchase confirmation on fulfillment (paid Stripe + waitlist-only). Order number, child names, confirmation URL, program delivery document download links (auto share tokens).
- **Idempotency:** `store_orders.metadata.confirmationEmailSentAt`
- **Future attachments:** `STORE_CONFIRMATION_ATTACH_DOCUMENTS=true` + SendGrid (hook in `buildStoreDeliveryEmailAttachments`)
- **Success page:** Document download links match email links

## 2026-07-01 (Public store — checkout & confirmation UX)

- **Checkout:** Labeled child fields (DOB, grade select), emergency contact on contact step for programs, one child per program line with “Use same child for all”, step progress indicator, school branding in header.
- **API:** Checkout accepts `emergencyContact`; persisted via `server/lib/store-checkout-contact.ts`. Order token endpoint returns `orderNumber` (`YYYYMMDD-00001`), store branding, line items with child names.
- **Success page:** Branded confirmation with order summary, formatted order ID, cart cleared from session storage.
- **E2E:** `publicStoreCheckout.ts` fills emergency contact + grade select; success assertions on order number and child name.

## 2026-07-01 (Public store — single-click add to cart)

- **Fix:** Program add-to-cart required two clicks — `confirmAddProgram` read stale `pendingProgram` state after `setPendingProgram`, and guests had to confirm a sign-in modal. Programs now add on first click; sign-in remains optional at checkout.

## 2026-07-01 (Auth — persist returnTo through OAuth)

- **Fix:** `returnTo` stored in `sessionStorage` before login/OAuth; Google OAuth `redirectTo` lands on `/login?returnTo=…`; OAuth URL cleanup strips `code`/`access_token` but keeps `returnTo`.
- **E2E:** `public-store.spec.ts` — login from checkout returns to checkout with cart preserved.

## 2026-07-01 (Public store — member banner Enroll link)

- **UI:** Member banner hides **Enroll** when the store catalog has no session listings (classes/products only); copy switches to “manage programs” instead of “enroll via the member portal”.

## 2026-07-01 (Public store — item detail crash & card actions)

- **Fix:** Item detail page crashed when listing had dates — `safeFormatDate` was called without a format string in `PublicStoreItemPage`.
- **UI:** Catalog cards stack Add + View details vertically (full-width, 44px min touch targets); item detail queries use explicit `queryFn`.

## 2026-07-01 (Public store — item detail pages)

- **UI:** `/store/:slug/item/:listingId` shows full description, hero image, dates, and add-to-cart; catalog cards link via title/image and “View details”. *(Superseded by slug URLs — see changelog entry above.)*
- **API:** `GET /api/public/store/:storeSlug/catalog/:listingId`; shared `buildStoreCatalogItem` in `server/lib/store-catalog-items.ts`.

## 2026-07-01 (Upload client — Bearer auth for presigned uploads)

- **Fix:** `uploadClient.ts` uses `apiRequest` for `/api/unified-uploads/*` so the Supabase JWT is sent (fixes `Missing or invalid authorization header` on store program/merch, logos, documents, KB, etc.).
- **E2E:** `public-store.spec.ts` — browser `ImageUpload` on programs tab (not only API-level presigned helper).

## 2026-06-01 (Platform — presigned uploads for all asset surfaces)

- **Architecture:** Logos, documents, knowledge base files, fundraiser images, custom form attachments, product order photos, and store images use `POST /api/unified-uploads/request-url` → direct PUT → confirm. Register endpoints save object paths (`/public/…` or `/objects/…`).
- **Removed:** Multipart upload routes for school logo, school documents, custom form attachments, fundraiser product images, store program/merch images.
- **Fixed:** Fundraisers API mounted at `/api/fundraisers`; public/private E2E object stub supports `/objects/*`.
- **Tests:** `server/tests/unified-upload-categories.test.ts`, `server/tests/upload-migration-registry.test.ts`; E2E helper `e2e/helpers/presignedUploadFlow.ts`.

## 2026-06-01 (Public store — presigned object storage for images)

- **Architecture:** Store program and merch images use the unified presigned upload flow (`POST /api/unified-uploads/request-url` → direct PUT → confirm) with categories `storePrograms` / `storeProducts`. DB stores `/public/store-programs/…` or `/public/store-products/…`. Removed multipart `POST …/public-store/upload/*` endpoints.
- **Serving:** `GET /public/*` in `registerObjectStorageRoutes` (wired in `server/index.ts`); E2E stub for Playwright.
- **Fix:** `setObjectAcl` and `getPublicObjectFile` for public object paths; schoolId auto-resolved on unified upload for store categories.

## 2026-06-01 (Public store — cart UX)

- **UX:** Add-to-cart toast + cart badge subtotal; mobile sticky cart bar; checkout cart review with quantity controls (products), remove lines, live subtotal updates.
- **Tests:** `client/src/lib/__tests__/store-cart.test.ts`; E2E cart feedback/qty/remove in `e2e/public-store.spec.ts`.

## 2026-06-01 (Public store — catalog uses enrollmentOpen for classes)

- **Fix:** Public store catalog and checkout pricing use `enrollmentOpen` (not legacy `isPublished`) so listed classes appear on `/store/:slug` when admin marks them on store.

## 2026-06-01 (Public store — class store-ready uses enrollmentOpen)

- **Fix:** Public Store **Classes & programs** treats **Open for Enrollment** (`enrollmentOpen`) + price as store-ready for classes, matching the parent catalog — not legacy `isPublished`.

## 2026-06-01 (Public store — Classes & programs tab + catalog images)

- **Admin:** Public Store → **Classes & programs** tab replaces Listings — toggle store visibility, members-only, and upload hero images for sessions and classes.
- **API:** `GET/PATCH /api/school-admin/public-store/programs/:listingType/:sourceId`; `POST …/upload/program-image`.
- **Schema:** `sessions.cover_image` (migration `252-session-cover-image.sql`); classes use existing `cover_image`.
- **Catalog:** `GET /api/public/store/:slug/catalog` returns `imageUrl` for session/class listings; guest cards show square crop via `StoreProductCardImage`.
- **Sessions admin:** store publish controls removed; link to Public Store programs tab.
- **E2E:** Extended `setup-public-store-scenario` (class/session fixtures); `fulfill-store-checkout` test API; `e2e/public-store.spec.ts` programs tab, catalog images, guest class payment flow.
- **Fix:** `storage.createUserRole` implemented (guest store checkout was calling a missing method).

## 2026-06-23 (Public store — merch upload auth + E2E)

- **Fix:** `ImageUpload` uses `apiRequest` so Supabase `Authorization` header is sent (fixes `Missing or invalid authorization header` on store merch upload).
- **E2E:** `e2e/public-store.spec.ts` — catalog imageUrl, guest card display, admin upload + create product, cart; seeds `ensure-public-store-schema` + `setup-public-store-scenario`.
- **Playwright:** `PUBLIC_STORE_ENABLED=true` in `webServer` env.

## 2026-06-23 (Public store — merch product photos)

- **UI:** `StoreProductCardImage` — square cropped image on public store product cards; placeholder when no photo.
- **Admin:** Public Store → Products — `ImageUpload` + auto-publish listing on create; `POST …/upload/product-image`.

## 2026-06-25 (Kendra Crofoot — phantom session ledger + parity plan)

- **Prod fix:** Reset `total_paid` on session enrollments #522–531 (phantom $441 with no succeeded PI / no `payments` row). Script: `server/scripts/fix-kendra-crofoot-session-phantom-paid-production.ts`; summary: `server/scripts/account-correction-summaries/kendra-crofoot-session-phantom-paid.json`.
- **Plan:** [enrollment-ledger-stripe-parity.md](../plans/enrollment-ledger-stripe-parity.md) — detect/prevent `total_paid` drift vs Stripe; **Phase 5 test matrix** (A–H) defines ship gates for medium-risk phases.
- **Docs:** [payments-and-billing.md](./domains/payments-and-billing.md) — invalid `phantom_paid` state documented.

## 2026-06-29 (Kendra Crofoot — Winter/Spring cart removal + parent email)

- **Prod fix:** Cancelled Winter/Spring 2027 session enrollments #528–531; zeroed balance and 100% comp so cart shows Fall 2026 only. Script: `server/scripts/fix-kendra-crofoot-cancel-winter-spring-production.ts`.
- **Cart:** `parentEnrollmentLineItems.ts` — cancelled/withdrawn/completed enrollments no longer hydrate checkout.
- **Email:** `account-correction-summaries/kendra-crofoot-account-update.json` via `send-account-correction-email.ts`.

## 2026-06-23 (Public storefront v1 — store lane)

- **Schema:** `251-public-store.sql` — `store_slug`, `public_store_enabled`, `store_products`, `store_listings`, `store_orders`, `store_checkout_snapshots`, `program_delivery_documents`.
- **API:** `server/api/public-store.ts`, `server/api/store-admin.ts`; webhook early `store_checkout` branch.
- **UI:** `/store/:schoolSlug`, checkout wizard, success page; `/school-admin/public-store`; publish-from-save on Sessions (+ class API hooks).
- **Docs:** [domains/public-store.md](./domains/public-store.md); E2E catalog `e2e/public-store-guest-checkout.spec.ts` (skipped until seed).
- **Nav/UX:** Finance sidebar link (gated by `enabled_features.publicStore` or activation); `SchoolAdminLayout` shell; store-admin 503 when migration 251 missing.

## 2026-06-01 (F-14 observability finish — Sentry, Claude bundle, audit)

- **`progress-context-bundle.ts`:** Single query bundle for progress-insights, Lexile AI (student route), and parent concierge cached summary append.
- **Staff insights:** `GET /api/progress/insights/staff/summary/:childId` shares 24h cache with parent route.
- **Sentry:** `@sentry/node` + `@sentry/react`; dual-write from error-telemetry (≥ medium) and errorTracker (non-throttled); PII scrub in `shared/sentry-scrub.ts`; PDF spans on report generate/download/email.
- **Report audit:** `progress_report_generated|downloaded|emailed` → `audit_logs`; admin **Sessions & reports** tab lists snapshots via `GET /api/progress/report/school-snapshots`.
- **SendGrid webhook stub:** `POST /api/webhooks/sendgrid/events` updates `email_log` on bounce/deliver.
- **Tests:** `progress-insights-rate-limit.test.ts`; optional `@axe-core/playwright` on parent progress hub in quarterly E2E spec.
- **Docs:** [domains/observability.md](./domains/observability.md).

## 2026-06-19 (Help — issue submission with optional screenshot)

- **UI:** “Need Help?” menu item renamed **Report an Issue** (`AISupportAssistant.tsx`); Payment Help adds “Still stuck?” link. Both floating buttons unchanged.
- **Form:** Category (`platform` vs `school_policy`), optional screenshot (capture via `html2canvas` or upload → `supportScreenshots` object storage category).
- **API:** `POST /api/technical-support/report` requires auth; always notifies recipients; AI tips still returned after submit.
- **Routing:** Platform issues → platform admins (`admin`/`superAdmin`); school policy → school admins for parent’s `schoolId` (in-app + email via `server/lib/support-issue-notifications.ts`).
- **Persistence:** Postgres table `technical_support_issues` — migration `server/migrations/250-technical-support-issues.sql` (run on prod before deploy).
- **Admin:** `/admin/technical-support` — Support Issues dashboard (sidebar: Admin portal + school admin **Communication**); category + signed screenshot URL; school admins see only their school’s policy tickets.
- **E2E:** `e2e/help-issue-submission.spec.ts` — `npm run test:e2e -- e2e/help-issue-submission.spec.ts`

## 2026-06-19 (Membership ledger foundation — reconcile + status job fix)

- **`MembershipStatusService`:** No longer recomputes `amountPaid` from `payments.metadata.membershipId` (missed combined checkout/backfills). Runs `reconcileMembershipLedgerForParent` first; calendar-only status transitions; guards block downgrade of fully paid `enrolled` rows.
- **`reconcileMembershipLedgerForParent`:** Wired on `GET /api/parent/member-id`, `GET /api/billing/summary`, post-finalize (`fulfill-payment-intent`, webhook), and post-payment AUTO_FIX. Infers `allocationBreakdown` on legacy backfill payment rows when reconcile detects combined cart satisfaction.
- **Post-payment verify:** `POST_PAYMENT_VERIFY_*` defaults on in production when unset; `.replit` sets `POST_PAYMENT_VERIFY_AUTO_FIX=true`. Membership waterfall criticals trigger reconcile auto-fix.
- **Tests:** `server/tests/membership-status-service.test.ts`, existing `reconcile-membership-ledger.test.ts`.

## 2026-06-19 (Emergency contacts UX + required email)

- **Email:** Required on form and API (`insertEmergencyContactSchema`); label no longer says optional.
- **List refresh:** After save/delete, optimistically update React Query cache then invalidate `/api/emergency-contacts`.
- **UX:** Removed duplicate page/dialog/card titles on parent emergency contacts; dialog uses plain form layout.

## 2026-06-19 (Emergency contacts save — DatabaseStorage method aliases)

- **Symptom:** Parent “Add Emergency Contact” fails with Admin Notified toast; POST/GET `/api/emergency-contacts` 500 in production.
- **Cause:** `CombinedStorage` calls `getEmergencyContactsByUserId` / `getEmergencyContactById` but `server/dbStorage.ts` only implemented `getEmergencyContactsByParent` / `getEmergencyContact`; production does not fall back to MemStorage.
- **Fix:** Added IStorage aliases on `DatabaseStorage`; `createEmergencyContact` now requires `userId` and maps fields explicitly.

## 2026-06-19 (Pending parent_manual + stale PI — INSTALLMENT_NOT_AVAILABLE)

- **Symptom:** Pay Now **409 `INSTALLMENT_NOT_AVAILABLE`** after abandoned checkout (Taylor Karnath SP #380, same pattern as Heather Jacks).
- **Cause:** Autopay reconciliation moved `processing` + `parent_manual` rows to `pending` but left `charged_by` + dead Stripe PI; `findStuckParentManualInstallments` only scanned `processing` (15m+) and `failed`+PI, so cron audit missed `pending`+PI.
- **Ops:** Released SP #380 on prod (`releaseStuckParentManualInstallment`).
- **Code:** `findStuckParentManualInstallments` + `isRecoverableStuckParentManualRow` include `pending`/`overdue` + stale PI; autopay reconciliation skips `charged_by = parent_manual`.

## 2026-06-18 (Parent emergency contacts route)

- **`/parent/emergency-contacts`:** Dedicated parent page + sidebar/mobile nav; `/registration/contacts` redirects here; `/registration/:rest*` sub-routes work again.
- **API:** `/api/emergency-contacts` uses Supabase `req.user.id` (not session-only); `PATCH` route registered (form uses PATCH).

## 2026-06-16 (Payment stuck-alert gaps closed)

- **Alerts:** `error-notification.ts` now supports SendGrid (`SENDGRID_API_KEY`) with Brevo fallback; immediate/daily error emails use `ERROR_NOTIFICATION_EMAIL`.
- **Payment criticals now email immediately:** post-payment verification criticals, payment-flow-monitor warning/critical snapshots, `INSTALLMENT_NOT_AVAILABLE` pay-now failures, and 5xx `/api/billing/fulfill-payment-intent` failures.
- **Monitoring cadence:** `startPaymentFlowMonitorJob()` is now started from `app-init.ts` (still guarded by `AUTO_PAY_SINGLE_INSTANCE=true` singleton requirement).

## 2026-06-15 (Checkout agreement gate — stale cache after sign)

- **Symptom:** Parent signs membership agreement from checkout, returns to payment, alert still shows and checkout stays blocked.
- **Cause:** `CartCheckout` cached agreement status under `agreement-status-checkout` with 30s `staleTime`; `MembershipAgreementPage` only invalidated `agreement-status` on sign success.
- **Fix:** Unified query key `['agreement-status', schoolId]`, `refetchOnMount: 'always'` on checkout, invalidate all `agreement-status` queries after sign / "Already signed → Continue".

## 2026-06-14 (Payment fulfillment hardening — interactive primary, webhook backup)

- **Architecture:** Browser calls `POST /api/billing/fulfill-payment-intent` after Stripe success; server retrieves PI and runs `finalizeSucceededPaymentIntent` (balance/cart) or `finalizeSucceededScheduledPaymentIntent` (Pay Now). Webhook replays the same modules idempotently.
- **Client surfaces wired:** CartSuccess, BillingPage, PaymentSuccess, PayBalanceInFullDialog, PaymentManagement Pay Now (`finalizePaymentAfterStripeSuccess`).
- **Webhook:** Balance/cart path uses `finalizeSucceededPaymentIntent` only (no `processBalancePayment` duplicate). Scheduled path extracted to shared module.
- **Phase B:** `POST_PAYMENT_VERIFY_AUTO_FIX=true` replays finalize on critical `stripe_db_parity` / `enrollment_ledger` (missed apply only).
- **Tests:** `fulfill-payment-intent.integration.test.ts` — fulfill without webhook; client+webhook membership idempotency. E2E `parent-payment-flow.spec.ts` asserts ledger clears without webhook forwarder.
- **Legacy:** `POST /api/billing/confirm-payment` → 410.

## 2026-06-10 (Staff Permissions — profile location vs user_locations drift)

- **Symptom:** Users page shows campus (e.g. Brighton) but Staff Permissions says user lacks location / hides them from grant list.
- **Cause:** Users page reads `users.location_id`; permissions use `user_locations`. Grant picker wrongly excluded anyone whose profile location matched the selected campus (assumed access already existed). `PUT /api/school-admin/users/:id` updated profile only — no `user_locations` sync.
- **Fix:** Remove profile-location filter from grant list; `syncUserLocationForSchool` on user edit; `server/lib/sync-user-location-for-school.ts`.

## 2026-06-09 (Mentor application — resume upload blocked on prod)

- **Symptom:** Public `/forms/mentor-application` loads but applicants cannot submit; required resume upload fails.
- **Cause:** `POST /api/custom-forms/forms/13/upload-attachment` returns **401** `No token provided` on prod (stale deploy without public upload route); `main` has the fix since PR #17 (`e620a7cf`, 2026-05-31).
- **Form:** ASA prod `custom_forms` id **13**, field **105** `Resume (PDF or Word)` required `file_upload`.
- **Fix:** Redeploy production from current `main`; verify anonymous upload returns 200/400 (not 401).

- **Symptom:** Parent dashboard showed **$0 / "No payments due"** for `beigel.shaley@gmail.com` while DB had **$1,054.17** on Spring enr **351**.
- **Cause:** Dashboard used cart-eligible enrollments only (`stripe_managed` excluded) + all biweekly installments cancelled → no upcoming rows; billing summary ($1,054.17) was not consulted.
- **Fix:** `ParentDashboard.tsx` falls back to `/api/billing/summary` when cart/upcoming are empty but enrollment balance remains.
- **Ops:** Recreate pending scheduled payments or use **Pay in full** on `/payments` until deploy.

## 2026-06-01 (Stuck parent Pay Now — audit, flag, auto-heal)

- **Symptom:** Recurring **409 `INSTALLMENT_NOT_AVAILABLE`** when parents retry Pay Now after abandoning checkout (`processing` + `parent_manual` or `failed` + stale PI).
- **Audit:** `server/scripts/audit-stuck-parent-manual-installments.ts` + shared lib `server/lib/stuck-parent-manual-installments.ts`.
- **Auto:** Pay endpoint logs `error_logs` (`error_code: INSTALLMENT_NOT_AVAILABLE`, `metadata.flag: stuck_parent_manual_installment`) and attempts inline recovery; `payment-flow-monitor` adds `stuck_parent_manual` signal + safe auto-release every ~15m.
- **Tests:** `server/tests/stuck-parent-manual-installments.test.ts`.

## 2026-06-10 (Verryluz Pagan — stuck installment INSTALLMENT_NOT_AVAILABLE)

- **Symptom:** Pay Now showed `INSTALLMENT_NOT_AVAILABLE` for Chaska Spring balance ($383.12).
- **Cause:** `scheduled_payments` id **518** stuck in `processing` + `parent_manual` after an abandoned card attempt; claim blocked retries and row dropped off Upcoming list.
- **Prod fix:** `release-stuck-parent-manual-scheduled-payment.ts --email verryluzpagan@yahoo.com --apply` → reset id 518 to `pending`.
- **Code:** Pay endpoint retries after releasing stuck `parent_manual` claims; upcoming list includes in-flight parent_manual rows; Pay Now toast uses `message` not raw error code.

## 2026-06-01 (Registration location picker — mobile fix)

- **Bug:** Parents reported trouble selecting a campus on `/register/:code`. Radix `SelectContent` used `position="popper"`, constraining the dropdown viewport to trigger height (~40px) — hard to scroll on phones, especially with multiple campuses.
- **Fix:** Registration **Preferred Location** uses native `<select>` (16px font, iOS-safe). Grade/gender selects use `position="item-aligned"`. Submit disabled until campuses load and a location is chosen.

## 2026-06-01 (Staff permissions grant — idempotent POST)

- **Bug:** Granting location access returned `409 User is already assigned to this location` for parents who already had `user_locations` from registration; toast showed raw `409: {"message":…}`.
- **Fix:** `POST /api/school-admin/user-locations` and `POST /user-school-permissions` are idempotent (return existing or reactivate inactive rows). Staff Permissions UI excludes users whose profile `locationId` matches the selected campus from the grant list; errors use `parseApiErrorMessage`.

## 2026-06-09 (Spring 2026 prod ops scripts + audit archive)

- **Scripts (ledger already applied on prod):** `rebalance-nina-resser-spring`, `prep-batch-pay-email-parents`, `cancel-failed-scheduled-for-parent`, `fix-spring-schedules-june-2026` (dry-run only), grace/verryluz one-offs, `deep-search-parent-payments-window`.
- **Audit:** `docs/audit/spring-pay-reminder-*.json` and correction receipts for June 2026 spring collections.
- **Email:** `send-account-correction-email.ts` accepts SendGrid or Brevo.

## 2026-06-09 (CI lockfile — Replit registry URLs)

- **Root cause:** `package-lock.json` had 19 `package-firewall.replit.local` resolved URLs (from Replit overrides); GitHub Actions `npm ci` failed with `EAI_AGAIN`.
- **Fix:** Rewrote to `registry.npmjs.org`; `scripts/normalize-lockfile-registry.mjs` runs before CI install.

## 2026-06-09 (CI npm install hardening)

- **CI:** `scripts/ci-npm-install.mjs` falls back to `npm install` when `npm ci` hits "Exit handler never called"; disables setup-node npm cache; verifies `drizzle-kit`/`vite` bins before db push.

## 2026-06-08 (CI / quality gaps — E2E DB, payments Postgres, quarterly verify)

- **E2E CI:** `.github/workflows/e2e.yml` now provisions Postgres + `ci-db-push`, passes `DATABASE_URL` to Playwright `webServer`, uses `npm run playwright:install:deps`.
- **Payments CI:** Same Postgres service + schema push so `credit-ledger-repair.integration` runs against real rows.
- **credit-ledger-repair test:** Use `classType: marketplace` + `marketplaceClassId`; `testDb.createTestClass` now sets required `category` for Postgres `classes` inserts.
- **Post-merge:** `scripts/verify-quarterly-schema.mjs` checks `quarterly_*` tables; wired into `post-merge.sh` and `post-merge-replit-check.mjs`.

## 2026-06-07 (NY IHIP quarterly progress reports)

- **Quarterly reports:** Educator `QuarterlyReportWizard` on progress log form; NY IHIP template (`ny-ihip-progress-report-template.ts`), draft PDF preview, immutable `quarterly_progress_reports` snapshots; parent download via `snapshotId`.
- **Schema:** `quarterly_progress_meta`, `quarterly_skill_checks`, `quarterly_progress_reports` in `shared/schema.ts`; init-db seeds rubric tables.
- **Email:** SendGrid provider in `email-service.ts` for progress-report attachments (`@sendgrid/mail`).
- **Tests:** `f14-quarterly-report.integration.test.ts`, `ny-ihip-template.test.ts`, `progress-report-pdf.test.ts`, `email-service-sendgrid.test.ts`; E2E `quarterly-progress-report-wizard.spec.ts`.

## 2026-06-07 (Pay Now idempotency + prod installment reset)

- **`INSTALLMENT_NOT_AVAILABLE`:** `/api/scheduled-payments/pay` resumes in-flight `processing` + `parent_manual` PaymentIntents on retry; clears stale PIs before reclaim (`server/lib/scheduled-payment-parent-pay.ts`). Stripe PI ownership verified via **parent email + customer id** (DB-linked + Stripe email search, same as payment history).
- **`/upcoming`:** Omits scheduled rows when linked enrollment `effective_balance <= 0`.
- **Prod:** Cancelled Jessica Hutchins orphan SPs **370/378**; reset failed autopay + stale `parent_manual` rows to `pending`.

## 2026-06-03 (Login loop — roles bootstrap + DB cold start)

- **GET /api/user/roles:** resolve `userId` by email when JWT auth succeeds but DB id was missing; return 503 (not 401) in degraded DB mode.
- **db.ts:** connection cooldown applies only after a prior successful connect — startup failures retry immediately (fixes 30s login lockout on Replit cold start).
- **RoleContext:** refresh Supabase session and retry `/api/user/roles` once before session-expired logout.
- **GET /api/health:** reports DB + Supabase secret presence for Replit diagnostics.

## 2026-06-02 (Payments Overview uses billing summary balance)

- **PaymentManagement Overview:** `resolveEnrollmentOutstandingForOverview()` prefers `/api/billing/summary` balances over cart-filtered enrollments so families with cancelled scheduled rows still see total owed and **Pay in full** (fixes portal dead-end e.g. biweekly balance with no Upcoming rows).
- **diagnose-parent-payments.ts:** Fixed `credits` schema import; added effective balance, payments table, portal parity (cart exclusion vs actionable scheduled).

## 2026-06-02 (Webhook test mock — no dev-bypass noise)

- **Tests:** `mockStripeConstructEventParsesBody()` in `server/tests/helpers/stripeWebhookTestMock.ts` — integration tests parse webhook JSON in the Stripe mock instead of throwing to force `STRIPE_WEBHOOK_DEV_BYPASS` (eliminates misleading `console.error` in Jest output).
- **webhook-handler:** Quieter logs in `NODE_ENV=test`; detailed signature debug only in development; production still rejects invalid signatures.

## 2026-06-02 (Payment integration test isolation)

- **Root cause:** fixtures used `klass.name` but classes expose `title` → DB enrollment insert failed silently to mem while reads hit Postgres.
- **CombinedStorage:** mem fallback when DB update returns no row; merge mem+DB scheduled-payment reads; test DB pool reset between cases; `getDb()` keeps pool alive under test cooldown.
- **testDatabase:** TRUNCATE when `TEST_DATABASE_URL` is set; `createTestUser` purge by email; `createTestClass` accepts `name` or `title`.
- **credit-ledger-repair:** `sqlRowValue()` for snake/camel SQL columns; skip invalid `scheduledPaymentId`.
- **Webhooks:** `payment_intent.succeeded` skips duplicate cart apply when checkout already recorded; `applyCartCheckoutItemsFromWebhook` caps at amount owed.
- **scheduled-payment-installment-variants:** unique `stripePaymentIntentId` per run (avoids stale `pi_multi_pay_1` rows).

## 2026-06-02 (Credits-only checkout test fixes)

- **Credits-only fulfill:** `applyCreditCentsToEnrollment` uses `computeEffectiveBalance`; fallback applies remaining class credits via `enrollmentIds` when canonical breakdown line caps are zero.
- **Storage/test harness:** `createPayment` DB errors fall back to file storage (non-prod); `getUser` / `getUserByEmail` use mem when Postgres unavailable in `NODE_ENV=test`; `supabaseAuth` honors `x-test-user-email` in tests.
- **Schema:** Export `assessmentSessions` (was breaking `storage` import / Jest globalSetup).
- **Integration:** `cart-credits-only-checkout-route.test.ts` uses `installFinancialIntegrationStubs()`.

## 2026-06-01 (Membership-first payment allocation)

- **Waterfall:** `server/lib/balance-payment-metadata.ts` — membership annual fee is satisfied before class tuition on each payment gross (PI + credits), not proportional to cart total. Resolver: `resolve-membership-reserve-for-payment.ts`.
- **Credits:** Volunteer credits apply to membership first (`allocateVolunteerCreditsWaterfall`); credits-only cart reordered in `cart-credits-only-checkout.ts`; checkout PI metadata `creditAllocation` from `stripe-payment-plans.ts`.
- **Verification:** `membership_waterfall` checks in `post-payment-verification.ts` / `verify-membership-waterfall.ts`; `payments.metadata.allocationBreakdown` written on fulfill.
- **Prod script:** `server/scripts/repair-heather-jacks-membership-first-production.ts` — Heather Jacks enrollment #449 ($125 membership + $14.58 class from first PI; 11 biweeklies on original dates 2–12).

## 2026-06-01 (Jasmine Klimovich — Spring billing cancelled)

- **Prod:** Cancelled scheduled payments **#432–433** ($650 × 2) for removed Spring enr **#384** (Elliana did not attend). Enr **#384** no longer on file; Winter **#181–182** unchanged (paid). Membership **#143** reconciled to enrolled/paid (member_id already set). Email: `jasmine-klimovich-spring-cancel.json`.

## 2026-06-01 (Cart checkout spinner recovery)

- **Cart checkout hang:** Slow `refreshCart` / `cartLoading` left checkout on spinners with no recovery; CartDrawer shows "Updating cart…"; checkout shows cart-loading copy and a retry card when payment intent never loads; **empty cart** (installment-plan exclusions) clears `loading` and redirects to `/payments?tab=upcoming`.
- **Prod notes (no deploy):** Jen Kuhns — stale `membership_enrollments` #113 vs `member_id` reconciled; cart tuition $600. Taylor Karnath — Aurora #403 biweekly ($520 owed); pay via Payments → Upcoming, not cart.
- **Ops:** `server/scripts/diagnose-parent-cart.ts` — `--email` cart eligibility + pricing on prod.

## 2026-06-01 (Pay in full on Payments page)

- Parents on installment plans can **Pay in full** from `/payments` (overview + upcoming tabs) via `/api/billing/pay-balance`; pending installments are cancelled when the enrollment balance reaches zero (`cancel-pending-scheduled-after-payoff.ts`).

## 2026-06-01 (Registration parent/child campus)

- School-code signup now requires campus and persists `user_locations` + `users.location_id` via `server/lib/persist-parent-location.ts` (children already got `location_id` via fallback).
- **Fix:** `server/api/auth.ts` must destructure `preferredLocationId` from `normalizeAuthRegisterInput` (was `preferredSignupLocationId`, so campus was dropped and signup returned 400).
- **Tests:** `persist-parent-location.test.ts`, `auth-register-location-persist.test.ts` — order (campus before `createChild`), invalid cross-school campus rejected, rollback on persist failure (`rollbackRegistrationAfterLocationFailure`).
- Prod backfill: 8 recent ASA parents fixed with `audit-registration-locations.ts --fix` (copied child campus 3 onto parent).

## 2026-06-01 (Vega Venmo manual payments — parent 88)

- **Prod:** Recorded Venmo $400 (2026-04-30) and $300 (2026-05-19) via `server/scripts/apply-vega-venmo-payments-production.ts` → payments **#319**, **#320**; enrollment **#292** now **paid in full** ($1,180 `total_paid` on $900 tuition). Stripe email audit still shows **$1,250** succeeded PIs missing from `payments` (separate webhook-reconcile track).

## 2026-06-01 (Membership double-credit investigation)

- **Incident:** Added Karen Raczka (parent 173) membership double-credit root cause and detection SQL to `domains/payments-and-billing.md`.
- **Invariant:** Membership fulfillment must run once per succeeded PI; `webhook-handler.ts` + `processBalancePayment(...)` currently duplicate the call in one checkout branch.
- **Scope:** Prod sweep found one checkout-note membership row with same-PI double-apply signature (`updated_at > created_at`) and flagged two separate manual overpaid memberships (rows 92, 122) for finance cleanup.
- **AutoPay backfill finding:** Historical first-installment PI cards often cannot be re-attached (`may not be used again`) without prior future-use setup; documented as a post-hoc wiring constraint in payments domain doc.

## 2026-06-01 (Plan: post-payment verification pipeline)

- **Plan:** [`docs/plans/post-payment-verification-pipeline.md`](../plans/post-payment-verification-pipeline.md) — three-layer verify (post-webhook service, Cursor Automation on failure, existing payment-flow-monitor/reconciliation), per-PI checks, env vars, phases A–D, communication matrix, open questions.
- **Phase A shipped:** `post-payment-verification.ts` + async webhook hook; table `payment_verification_logs`. Off until `POST_PAYMENT_VERIFY_ENABLED=true` on worker. Tests: `server/tests/post-payment-verification.test.ts`.

## 2026-06-01 (Stripe email audit script)

- **New:** `server/scripts/inspect-parent-stripe-by-email.ts` — match parent email to all Stripe customers + succeeded PIs vs `payments`; flags missed reconciles.
- **Domain:** `payments-and-billing.md` — email-first Stripe audit required before trusting DB balance; Kelsie Forte incident added.

## 2026-05-31 (Prod mentor form: ASA branding)

- **Prod:** Live `mentor-application` on school **2** (American Seekers Academy, form id 13); deactivated mistaken copy on school 3 (Fin Reports fixture, form id 12).
- **Code:** `seed-form-templates.ts` prefers ASA / non–Fin Reports schools for templates; runbook default `--school-id 2`.

## 2026-05-31 (Domain docs: custom forms + agent knowledge model)

- **New:** [`domains/custom-forms-public-access.md`](domains/custom-forms-public-access.md) — public `/forms/:slug`, APIs, mentor template/provision, E2E, pitfalls; hub index entry.
- **ci-and-testing:** Playwright E2E table, **Agent knowledge maintenance** (footer vs persisted docs/rules), port-5000 E2E pitfall.
- **Hub README:** Step 5/6 clarified — CHANGELOG/domain files persist; chat footer is summary only.

## 2026-05-31 (Domain doc: payments and billing + Jake Fabry correction)

- **New:** [`domains/payments-and-billing.md`](domains/payments-and-billing.md) — balance fields (`effective_balance` vs `remaining_balance`), prod audit queries, credit-application corrections, correction email, incidents (Jake Fabry, Kari Wing, SQL pitfall, ghost checkout).
- **Hub:** `README.md` index entry for payments/billing domain.
- **Prod (Jake Fabry, parent 34):** Credit #34 ($810 spring comp) never applied after Mar 10 checkout → `effective_balance` $810. Fixed via `apply-jake-fabry-credits-production.ts` (enr 327–329); email `account-correction-summaries/jake-fabry.json`.
- **Invariant:** Approved manual credits must consume via `unified_credit_usage_logs` when applied at checkout or in admin correction.

## 2026-05-31 (Knowledge: E2E spec → E2E_COMMANDS maintenance)

- **Protocol:** New/changed `e2e/*.spec.ts` must add testing links in [`docs/E2E_COMMANDS.md`](../E2E_COMMANDS.md) (catalog row + command); optional runbook/domain cross-link + CHANGELOG.
- **Updated:** `asa-app-knowledge`, `asa-testing-deployment`, `ci-and-testing.md`, `.cursor/rules/app-knowledge.mdc`, “Maintaining this index” section in `E2E_COMMANDS.md`.
- **Example:** [`e2e/public-custom-forms.spec.ts`](../e2e/public-custom-forms.spec.ts) → `npm run test:e2e -- e2e/public-custom-forms.spec.ts`.

## 2026-05-31 (Resume upload E2E + mentor form provision)

- **E2E:** `public-custom-forms.spec.ts` — `upload-attachment` API + browser resume upload/submit; seed includes `file_upload` field.
- **E2E storage:** `fileUploadService.uploadBuffer` stubs object storage when `PLAYWRIGHT_WEB_SERVER=true` (non-production).
- **Ops:** `server/scripts/provision-public-mentor-form.ts` + runbook `docs/APP_KNOWLEDGE/runbooks/public-mentor-application-form.md`.

## 2026-05-31 (E2E command index doc)

- **Doc:** [`docs/E2E_COMMANDS.md`](../E2E_COMMANDS.md) — consolidated Playwright npm scripts, per-spec commands, env, projects, `/api/test/*` seeds; linked from `ci-and-testing.md` and `server/tests/README.md`.

## 2026-05-31 (E2E: public custom forms)

- **Spec:** `e2e/public-custom-forms.spec.ts` — unauthenticated `/forms/:slug`, public `by-slug` + `submit` APIs, members-only hidden from public routes.
- **Seed:** `POST /api/test/setup-public-form-scenario` (`server/tests/helpers/seedPublicFormScenario.ts`).
- **UI:** `data-testid="form-submit-success"` on post-submit confirmation card.

## 2026-05-31 (Mentor/educator application form template + resume upload)

- **Template:** `Mentor / Educator Application` in Form Builder (`slug: mentor-application-template`, 23 fields). Seeded via `server/scripts/seed-form-templates.ts`.
- **Resume:** Public `POST /api/custom-forms/forms/:formId/upload-attachment`; `file_upload` on `DynamicFormPage`; admin download `GET /api/custom-forms/submissions/:id/files/:fieldId` (`formAttachments` storage category).
- **Clone:** Any `isTemplate` form clones into the admin's school with public access + slug without `-template`.

## 2026-05-31 (Prod: classes.enrollment_open column missing — cart snapshot)

- **Symptom:** `getClassById` failed with `column "enrollment_open" does not exist`; CombinedStorage fell back to empty memStorage during `/api/cart/snapshot` → checkout/pricing errors (seen in prod logs for parent 31 cart).
- **Fix:** `ALTER TABLE classes ADD COLUMN IF NOT EXISTS enrollment_open BOOLEAN NOT NULL DEFAULT false` on prod; matching migration in `server/init-db.ts`.

## 2026-05-31 (Kristel Reichert prod + iOS billing path)

- **Prod (parent 16):** Membership **#124** → **\$175 paid / enrolled**; Andrew enr **289** (100% comp) → `payment_status = completed`; linked `cus_T60RuRly2qaTNk`. Remaining: Jackson enr **290** **\$556.25**.
- **Code:** `getAuthoritativeRemainingBalanceCents` uses `resolveEnrollmentEffectiveBalance` (comp-aware); Billing pay flow skips \$0 enrollments; cart refresh hash includes comp/paymentStatus (Safari stale-cart fix).

## 2026-05-31 (Batch balance reminder emails — collections template)

- **Sent:** 26 families consolidated balance emails via `sendFamilyBalanceEmail` / `server/scripts/send-balance-reminders-batch.ts` (amount due + Sign In & Pay link).
- **Excluded:** All **Fall 2026** registrants (`Fall 2026 - Full Day` / `Half Day`), explicit skips Corcoran/Ballou/Sartena/Pastorella, test accounts, admin ids **3/5**.
- **Fall skip set (8 parents):** DiSano **25**, Corcoran **29**, Selvaggio **119**, Sartena **121**, Pastorella **135**, Spencer **144**, Ballou **145**, Jacks **146**.
- **Non-blocking:** `email_log.created_at` + `payment_reminder_logs` memory fallback on prod schema drift; Brevo delivery succeeded.

## 2026-05-31 (Batch membership paid — 15 families)

- **Prod:** Marked 2026 membership **\$175 paid / \$0 remaining**, `status = enrolled` for membership rows **#85, #82, #86, #110, #111, #114, #116, #117, #121, #127, #141, #145, #147, #148, #398** (Frasier, Chappell, Torres, Lawrence, Lentz, Manza, Culotta, Spencer, Ragusa, **Alyssa** Hadley, Fuller, Erbland, Omar Hill, Green, Renee Zegarelli). Clark Hadley **#118** was already enrolled/paid — skipped.

## 2026-05-31 (School documents: per-file public share links)

- **Feature:** Admins can generate a **public, no-login download link** per document. New `school_documents.share_token` column (random `randomBytes(24).base64url`, partial-unique index `WHERE share_token IS NOT NULL`); NULL = not shared.
- **Endpoints:** `POST /api/schools/documents/:id/share` (generate/return token, idempotent, school-scoped), `DELETE /api/schools/documents/:id/share` (revoke). Public, **unauthenticated** `GET /api/schools/documents/public/:token/download` streams the file only while published + not archived + not expired (generic 404 otherwise; no `document_views` recording).
- **Schema fix:** Added `expiresAt`, `isArchived`, `shareToken` to `schoolDocuments` in `shared/schema.ts` (the first two columns already existed in the DB via `init-db` migrations but were missing from the Drizzle object — this also cleared pre-existing `isArchived` type errors in `server/api/schools.ts`). Migration added to `server/init-db.ts`.
- **Storage:** `getSchoolDocumentByShareToken()` on `DatabaseStorage` + `CombinedStorage`; set/clear via `updateSchoolDocument`.
- **UI:** Per-document Share dialog (generate / copy link / revoke) + green "Public link" badge in `DocumentManagementPage.tsx`. Absolute URL built client-side from `window.location.origin` + returned `sharePath`.
- **Files:** `shared/schema.ts`, `server/init-db.ts`, `server/dbStorage.ts`, `server/storage.ts`, `server/api/schools/documents.ts`, `client/src/pages/schooladmin/DocumentManagementPage.tsx`.

## 2026-05-31 (Scheduled-payment webhook vs reconciliation double-apply — Shaley Beigel)

- **Root cause:** `payment_intent.succeeded` scheduled path updated enrollments before inserting the `payments` row; stuck-processing reconciliation could backfill enrollment again when no row existed yet (only skipped `status === 'completed'` on payments).
- **Code fix:** Webhook creates `payments` row before enrollment mutation; reconciliation skips backfill when any blocking payments row exists (`completed`/`succeeded`/`pending`), or when SP is already `completed` with `completionSource` `stripe_autopay`/`stripe_checkout` (payments-row-only backfill).
- **Tests:** `server/tests/reconciliation-ledger-equivalence.test.ts` — guard unit tests + pending-row race scenario.
- **Prod (parent 58):** Enr **184** Winter → **\$900 paid / \$0** (removed duplicate \$792.50 apply); enr **351** Spring → **\$245.83 paid / \$1,054.17 owed** (`remaining_balance` corrected); linked `cus_T3wmWFilCYDILY`.
- **Email:** `server/scripts/account-correction-summaries/shaley-beigel.json`.

## 2026-05-30 (School document notifications: email delivery + bulk upload)

- **Email delivery:** Document notifications now send **in-app + email** (`type: 'both'`) instead of in-app only. Reuses the now-exported `sendNotificationEmails()` (Brevo) from `server/api/notifications.ts`; failures are non-fatal and skip if `BREVO_API_KEY` is unset.
- **Bulk upload:** Admin Document Management page accepts **multiple files** (`<input multiple>`); each is uploaded via `POST /api/schools/documents/upload`, then **one joint notification** for the batch is sent via new `POST /api/schools/documents/notify-bulk` (`{ documentIds, targeting }`).
- **Visibility:** `sendDocumentNotification` now delegates to `sendBulkDocumentNotification`, storing `documentIds: number[]` in `notifications.target_data` (scalar `documentId` kept for single-upload back-compat). Admin parent-document query in `server/api/schools.ts` unions both scalar + array via `jsonb_array_elements_text`.
- **Deferred:** video support in the `documents` category (still PDF/Word/image only) — scheduled separately.
- **Files:** `server/api/schools/documents.ts`, `server/api/notifications.ts`, `server/api/schools.ts`, `client/src/pages/schooladmin/DocumentManagementPage.tsx`.

## 2026-05-30 (Clark Hadley Spring checkout split — parent 48)

- **Issue:** Spring PI **#213** (`pi_3TF1Ma…`, **\$2,465** incl. **\$175** membership) split **÷4** across Winter **178/179** + Spring **375/376** → Winter overpaid, Spring **\$967.50** owed; membership **#118** pending despite PI metadata.
- **Fix (prod):** Winter → **\$900/\$0**; Spring **375** → **\$1,300/\$0**, **376** → **\$900/\$0**; membership **#118** → **\$175/0**; payment **#213** → **[375,376]**.
- **Email:** `server/scripts/account-correction-summaries/clark-hadley.json`.

## 2026-05-30 (Sara Puccia Spring checkout split — parent 55)

- **Issue:** Spring PI **#212** (`pi_3TEvOI…`, **\$2,720** + **\$360** credit) split **÷4** across Winter **187/188** + Spring **381/382** → Winter overpaid, Spring **\$620/enrollment** owed.
- **Fix (prod):** Winter **187/188/191** → paid in full; Spring **381/382** → **\$1,300/\$0**; payment **#212** → **[381,382]**; linked `cus_TaXnmTWE9U9v1l`.
- **Email:** `server/scripts/account-correction-summaries/sara-puccia.json`.

## 2026-05-30 (Nina Resser Winter double-apply + Spring credit — parent 30)

- **Issue:** Combined PI **Feb 26** double-applied Winter Greece shares; Spring **\$180** checkout credit not on `total_paid`; payment **#255** split **÷3** with Winter **215** in cart.
- **Fix (prod):** Winter **215/216** → **\$900/\$0**; Spring **391/392** → **~\$406.26 paid / \$493.74 owed** each (credit + cash reallocation); payments **#112** → **[215,216]**, **#255** → **[391,392]**.
- **Email:** `server/scripts/account-correction-summaries/nina-resser.json`.

## 2026-05-30 (Jasmine Klimovich Winter double-apply — parent 49)

- **Issue:** Combined biweekly PIs **Feb 19** applied Levi's shares (**\$129.37 + \$129.38**) to enr **181** twice → **\$1,158.75 paid** on **\$900** Winter row. Membership **#143** showed pending though already paid.
- **Fix (prod):** Enr **181** → **\$900 / \$0**; membership **#143** → **\$175/0 enrolled**; linked `cus_TXBXR5qUqZkJUJ`. Spring **384** unchanged at **\$1,300** legit unpaid.
- **Email:** `server/scripts/account-correction-summaries/jasmine-klimovich.json`.

## 2026-05-30 (Annalisa Termine manual payment not applied — parent 82)

- **Issue:** Spring enr **419** showed **\$900 owed** despite manual payment **#256** (\$900, "PAID IN FULL", 2026-04-30). Payments **#61** and **#256** had `parent_id = 5` (admin contact account) instead of **82** — enrollment balance update skipped at manual entry.
- **Fix (prod):** `parent_id → 82` on payments **#61, #256**; enr **419** → **\$900 paid / \$0**, `enrolled`/`completed`. Linked `cus_T60pYjnTzYSsTH` on user **82**. No succeeded Stripe PIs (Spring paid cash/manual, not card).
- **Email:** `server/scripts/account-correction-summaries/annalisa-termine.json`.

## 2026-05-30 (Renee Zegarelli Free After 3 + checkout split — parent 115)

- **Issue:** `pi_3TABABGhVuNOnUs71TH2mXdc` (**\$2,875**) split **÷4** (\$718.75/enr) including ghost **#346**; membership **\$175** never on **#147**; Violet **425** showed **\$900** owed though 4th child is **Free After 3**.
- **Fix (prod):** Enrs **345/347/348** → **\$900 paid / \$0**; **425** → `comp_amount_cents=90000`, **enrolled**, **\$0**; membership **#147** → **\$175/0**; linked `cus_U8S4us14Wvmwfs` on user **115**.
- **Email:** `server/scripts/account-correction-summaries/renee-zegarelli.json`.

## 2026-05-30 (Grace Mulcahy credit + membership cleanup — parent 66)

- **Spring sibling credit #59 (\$90):** Was on Stripe checkout `pi_3TIVRAG…` but not on `total_paid` for enrs **413+414** — applied **\$45 each**; Spring owes **\$362/enrollment** (\$724 total).
- **Winter sibling credit #44:** Ledger marked **used** (discount already on deposit PI); no balance change.
- **Membership:** Voided duplicate manual marks **#285**, **#290**; **#142** kept; membership **#144** unchanged at **\$175** paid.

## 2026-05-30 (Grace Mulcahy Stripe Link PI reconcile — parent 66)

- **Issue:** `pi_3TcQDqGhVuNOnUs71288rP33` succeeded (**\$701**, Stripe Link) but webhook missed; PI had **empty metadata** (no `enrollmentIds`).
- **Fix (prod):** Reconcile to Spring enrs **413+414** (\$350.50 each); payment **#312**, `stripe_payment_history` **#34**.

## 2026-05-30 (prod balance audit queue SQL pitfall)

- **Pitfall:** Ranking parents by `SUM(pe.effective_balance)` with a `LEFT JOIN payments` inflates totals (e.g. parent 66 showed \$13,635 vs actual \$1,515 = 9× with 9 payments). Use a subquery for payment counts or aggregate enrollments only.

## 2026-05-30 (Kari Wing aide credit application — parent 90)

- **Issue:** Four approved manual aide credits (**\$1,056** total) never applied to class balances; Winter **272** owed **\$876**, Spring **415** owed **\$859.20**.
- **Fix (prod):** `server/scripts/apply-kari-wing-credits-production.ts` — FIFO credit consumption + usage logs; payment **#311** (`credit_correction_*`). **272** → paid in full; **415** → **\$679.20** remaining.
- **Separate:** Membership **#92** shows **\$525 paid** vs **\$175 fee** (triple manual marks) — not touched in this fix.

## 2026-05-30 (Jackie Schleyer ghost cart cleanup — parent 116)

- **Issue:** Spring enrs **433/434** (`pending_payment`, **\$0 paid**) — cart abandoned, never attended; inflated **\$1,800** owed.
- **Fix (prod):** `status = cancelled` on **433, 434** (ghost account policy — no correction email).
- **Pitfall:** Do not balance-correct or email `pending_payment` + \$0 paid abandonments; cancel instead.

## 2026-05-30 (Carrie Pierce prod balance correction — parent 98)

- **Issue:** Triple membership marks (**#244, #279, #286**); combined Winter PIs **#225–230** tagged only enr **275** though SP pairs covered **275+276**; Spring **417/418** unpaid (**\$1,800**); credit **#57** (\$90) for checkout.
- **Fix (prod):** Void membership **#279, #286**; membership **#115** → **\$175/0**. Payment `enrollment_ids` → **[275,276]** on **#225–230**. Spring/credit unchanged.
- **Email:** `server/scripts/account-correction-summaries/carrie-pierce.json`.

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
