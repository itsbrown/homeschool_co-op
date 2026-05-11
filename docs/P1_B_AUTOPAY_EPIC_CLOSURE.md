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

- **Intent:** In-app + email before an AutoPay charge in a defined window (e.g. ~20h).
- **This tree:** Scheduled **payment reminders** (due-date buckets) and `sendScheduledPaymentReminder` in `server/services/scheduled-payment-reminders.ts` — **6h job cadence**, not a dedicated “T-minus 20h AutoPay” artifact. See **Residual gaps**.

### P1-B-07 — Credit-covered AutoPay skip notification

- **Intent:** Notify when AutoPay skips because credits cover the obligation.
- **This tree:** No dedicated `credit-covered` notification strings located under `server/services/` in a quick search — **may be absent or named differently**; treat as **follow-up** unless confirmed elsewhere.

### P1-B-08 — Operational metrics and alerts

- **Done criterion:** Stable metric names, label taxonomy, threshold helpers for operators/dashboards.
- **Code locations:**
  - `server/services/autopay-observability.ts` — counters/labels/classifiers, `AUTOPAY_ALERT_*`.
  - `server/tests/integration/phase2/autopay-metrics-contracts.test.ts` — contracts.
  - `server/tests/p1b-autopay-epic-contract.test.ts` — smoke exports.

---

## Residual gaps

- **B-06 timing:** Reminders follow the **6-hour** (and startup) job schedule; not wall-clock “exactly 20h before charge.”
- **B-07:** Dedicated credit-covered skip notification path **not verified** in this snapshot — confirm product requirement vs implementation branch.
- **B-08 live emission:** Metric helpers/tests exist; **external sink wiring** (Prometheus/Datadog) may still be required for production dashboards.
- **B-04/B-05 integration:** `decideAutoPayAttemptStart` **may not** be invoked from production AutoPay charge entrypoints in this repo snapshot — confirm `processAutoPayExecutionPath` / Stripe charge wiring uses lifecycle helpers end-to-end.
