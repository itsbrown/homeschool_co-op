# Epic **P1-B (BL-02)** — AutoPay closure traceability

**Roadmap note:** `docs/IMPLEMENTATION_ROADMAP.md` does not spell out `P1-B-xx`. One-line **done** lines for **P1-B-01 … P1-B-03** are taken verbatim from the banner on `server/services/autopay-policy.ts`. **P1-B-04 … P1-B-08** are mapped here to the autopay-related modules and tests present in this tree (same epic slice, inferred ordering).

---

### P1-B-01

- **Done criterion:** Retry cap enforced via max attempts, predicate helper, and DB query upper bound on retry count (banner on `autopay-policy`).
- **Code locations:**
  - `server/services/autopay-policy.ts` — `AUTOPAY_MAX_RETRY_ATTEMPTS`, `isRetryCapReached`, `retryCountLessThan` in `buildDueAutoPayQueryCriteria`; `evaluateAutoPayPolicy` skip branch.
  - `server/services/scheduled-payment-reminders.ts` — `queryDueScheduledPayments` applies `lt(scheduledPayments.retryCount, criteria.retryCountLessThan)`.
  - `server/tests/autopay-policy.test.ts` — retry-cap guard expectations.
  - `server/tests/scheduled-payment-due-query-source.test.ts` — criteria passes `retryCountLessThan` contract.
  - `server/tests/integration/phase2/autopay-runtime-policy.test.ts` — skip + `cancelled` when retry cap hit at runtime path.

### P1-B-02

- **Done criterion:** Stale attempts excluded by cutoff days, date predicate, and `dueOnOrAfter` window in due-query criteria (banner on `autopay-policy`).
- **Code locations:**
  - `server/services/autopay-policy.ts` — `AUTOPAY_STALE_ATTEMPT_DAYS`, `isStaleAttemptDate`, `dueOnOrAfter` in `buildDueAutoPayQueryCriteria`; `evaluateAutoPayPolicy` stale skip.
  - `server/services/scheduled-payment-reminders.ts` — DB filter `gte(scheduledPayments.scheduledDate, criteria.dueOnOrAfter)`.
  - `server/tests/autopay-policy.test.ts` — stale vs boundary dates.
  - `server/tests/integration/phase2/autopay-runtime-policy.test.ts` — stale skip terminal path.

### P1-B-03

- **Done criterion:** Due-payment selection uses typed DB criteria + repository port + `getDueAutoPayCandidates` entrypoint (banner on `autopay-policy`).
- **Code locations:**
  - `server/services/autopay-policy.ts` — `DueAutoPayQueryCriteria`, `DueAutoPayRepository`, `buildDueAutoPayQueryCriteria`, `getDueAutoPayCandidates`.
  - `server/services/scheduled-payment-reminders.ts` — `queryDueScheduledPayments(criteria)` Drizzle implementation; `processAutoPayExecutionPath` wires `getDueAutoPayCandidates({ queryDueScheduledPayments }, now)`.
  - `server/tests/scheduled-payment-due-query-source.test.ts` — repository contract (criteria forwarded, no in-memory due list).
  - `server/tests/integration/phase2/autopay-runtime-policy.test.ts` — asserts execution path does not call `getAllScheduledPayments` for due filtering.

### P1-B-04 — Stuck-processing reconciliation worker

- **Done criterion:** Stuck `processing` scheduled payments reconciled against Stripe PaymentIntent truth; query window from `AUTOPAY_PROCESSING_STUCK_MINUTES`.
- **Code locations:**
  - `server/services/autopay-reconciliation.ts` — `reconcileStuckAutoPayProcessingAttempts`, `buildAutoPayReconciliationCriteria`, `mapStripePaymentIntentStatusString`, repository port.
  - `server/services/scheduled-payment-reminders.ts` — `buildAutoPayReconciliationRepository`, `runAutoPayStuckProcessingReconciliation`, `tickAutoPayReconciliation`, `AUTOPAY_RECONCILIATION_INTERVAL_MS`.
  - `server/services/autopay-observability.ts` — `AUTOPAY_PROCESSING_STUCK_MINUTES` (aligned with stuck window).
  - `server/tests/reconciliation-autopay.test.ts` — unit coverage.
  - `docs/AUTOPAY_PRODUCTION_CHECKLIST.md` — singleton worker + env cadence.

### P1-B-05 — Webhook retry + replay-safe handling

- **Done criterion:** Replayed or duplicate `payment_intent` / webhook events do not double-apply financial side effects.
- **Code locations:**
  - `server/webhook-handler.ts` — `getPaymentByStripeId` short-circuits, `scheduled_payment` metadata path, enrollment balance updates.
  - `server/tests/integration/payment-webhook-replay.test.ts` — replay idempotency.
  - `server/tests/integration/checkout-pi-webhook-idempotency.test.ts` — related idempotency.
  - `server/services/autopay-lifecycle.ts` — `decideAutoPayAttemptStart` (replay vs new attempt) — **used in tests; confirm call sites in execution path in this tree** (see Residual gaps).

### P1-B-06 — Pre-charge notifications (~policy window before charge)

- **Done criterion:** In-app + email heads-up inside **20 hours** before the scheduled due time, **replay-safe** (dedupe via persisted notification content marker).
- **Code locations:**
  - `server/services/autopay-notifications.ts` — `AUTOPAY_PRECHARGE_WINDOW_HOURS`, `maybeEmitPreChargeNotification`, dedupe marker `AUTOPAY_DEDUPE:pre_charge:…`.
  - `server/services/scheduled-payment-reminders.ts` — `processAutoPayExecutionPath` calls `maybeEmitPreChargeNotification` for each due candidate with parent context (after policy pass, before marking `process`).
  - `server/tests/autopay-notifications.test.ts` — window + dedupe unit tests.
- **Operational note:** Scheduler cadence is still **6h**; parents may receive the pre-charge notice on the first tick that falls inside the 20h window (not wall-clock exact minute).

### P1-B-07 — Credit-covered AutoPay skip notification

- **Done criterion:** When a due installment exists but **enrollment `remainingBalance` is already 0**, skip charging, cancel the scheduled row (same status path as other terminal skips), and notify the parent once (dedupe).
- **Code locations:**
  - `server/services/autopay-notifications.ts` — `maybeEmitCreditCoveredSkipNotification`.
  - `server/services/scheduled-payment-reminders.ts` — balance check + `reason: 'credit_covered'` on `AutoPayExecutionResult`.
  - `server/tests/integration/phase2/autopay-runtime-policy.test.ts` — credit-covered path integration test.

### P1-B-08 — Operational metrics and alerts

- **Done criterion:** Stable metric names, label taxonomy, threshold helpers for operators/dashboards.
- **Code locations:**
  - `server/services/autopay-observability.ts` — counters/labels/classifiers, `AUTOPAY_ALERT_*`.
  - `server/tests/integration/phase2/autopay-metrics-contracts.test.ts` — contracts.
  - `server/tests/p1b-autopay-epic-contract.test.ts` — smoke exports.

---

## Residual gaps

- **B-06 timing precision:** Pre-charge uses a **20h window** but delivery is tied to the **scheduler tick** (e.g. 6h); not “exactly T−20h” wall clock.
- **B-07 semantics:** “Credit-covered” is approximated as **`remainingBalance <= 0`** on the primary enrollment row; true credit-ledger coverage (P1-C) may refine this later.
- **B-08 live emission:** Structured log line `[autopay_notifications_total]` carries label map; wire to Prometheus/Datadog in ops layer if needed.
- **B-04/B-05 integration:** `decideAutoPayAttemptStart` **may not** be invoked from production AutoPay charge entrypoints in this repo snapshot — confirm `processAutoPayExecutionPath` / Stripe charge wiring uses lifecycle helpers end-to-end.
