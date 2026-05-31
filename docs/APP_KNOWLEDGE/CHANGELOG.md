# App knowledge changelog

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
