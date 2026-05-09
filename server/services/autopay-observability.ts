import type { AutoPayTerminalReason } from "./autopay-policy";
import { AUTOPAY_MAX_RETRY_ATTEMPTS } from "./autopay-policy";

/**
 * AutoPay metrics & alert tuning — single place operators adjust thresholds.
 * Label taxonomy stays low-cardinality: no user/parent/payment ids in label values.
 */

// --- Processing staleness (must stay aligned with reconciliation query window) ---

/** Rows in `processing` with updatedAt older than this are "stuck" candidates for reconciliation. */
export const AUTOPAY_PROCESSING_STUCK_MINUTES = 30;

// --- Alert thresholds (batch-oriented; sized for a small co-op, tune upward for scale) ---

/**
 * Warn when this many payments hit retry cap in a single autopay-oriented batch.
 * Rationale: ≥3 in one run usually merits checking Stripe/dashboard before it spreads.
 */
export const AUTOPAY_ALERT_RETRY_EXHAUSTED_WARN_BATCH = 3;

/** Critical: systemic card or gateway failure affecting many families in one sweep. */
export const AUTOPAY_ALERT_RETRY_EXHAUSTED_CRITICAL_BATCH = 10;

/**
 * Warn when the stuck-processing reconciliation query returns at least this many rows.
 * Rationale: even one stuck PI can be bad, but 5+ concurrent stuck rows often indicates worker/API trouble.
 */
export const AUTOPAY_ALERT_PROCESSING_BACKLOG_WARN_COUNT = 5;

/** Critical backlog: risk of fund capture delays and support spikes. */
export const AUTOPAY_ALERT_PROCESSING_BACKLOG_CRITICAL_COUNT = 25;

/**
 * "Divergence" — share of due candidates that end terminal (retry cap or stale) in one run.
 * Rationale: >25% terminal skew suggests clock/data issues or mass declines vs normal noise.
 */
export const AUTOPAY_ALERT_DIVERGENCE_WARN_RATIO = 0.25;

export const AUTOPAY_ALERT_DIVERGENCE_CRITICAL_RATIO = 0.5;

/** Require this many prior baseline samples before spike detection avoids cold-start noise. */
export const AUTOPAY_ALERT_SPIKE_BASELINE_MIN_SAMPLES = 4;

/** Current interval count ≥ baseline × factor → warning (e.g. hourly terminal skip rate). */
export const AUTOPAY_ALERT_SPIKE_WARN_FACTOR = 3;

export const AUTOPAY_ALERT_SPIKE_CRITICAL_FACTOR = 6;

export type AutoPayAlertTier = "ok" | "warning" | "critical";

export function classifyRetryExhaustedBatchSeverity(retryCapTerminalCount: number): AutoPayAlertTier {
  const n = Math.max(0, Math.floor(Number(retryCapTerminalCount)));
  if (n >= AUTOPAY_ALERT_RETRY_EXHAUSTED_CRITICAL_BATCH) return "critical";
  if (n >= AUTOPAY_ALERT_RETRY_EXHAUSTED_WARN_BATCH) return "warning";
  return "ok";
}

export function classifyProcessingBacklogSeverity(stuckRowCount: number): AutoPayAlertTier {
  const n = Math.max(0, Math.floor(Number(stuckRowCount)));
  if (n >= AUTOPAY_ALERT_PROCESSING_BACKLOG_CRITICAL_COUNT) return "critical";
  if (n >= AUTOPAY_ALERT_PROCESSING_BACKLOG_WARN_COUNT) return "warning";
  return "ok";
}

export function classifyTerminalDivergenceSeverity(
  terminalSkips: number,
  totalDueCandidates: number,
): AutoPayAlertTier {
  const total = Math.max(0, Math.floor(Number(totalDueCandidates)));
  if (total <= 0) return "ok";
  const terminals = Math.max(0, Math.floor(Number(terminalSkips)));
  const ratio = terminals / total;
  if (ratio >= AUTOPAY_ALERT_DIVERGENCE_CRITICAL_RATIO) return "critical";
  if (ratio >= AUTOPAY_ALERT_DIVERGENCE_WARN_RATIO) return "warning";
  return "ok";
}

/**
 * Spike vs rolling baseline (e.g. same metric summed over the prior N intervals).
 * Cold start: tier stays `ok` until `baselineSampleCount` ≥ AUTOPAY_ALERT_SPIKE_BASELINE_MIN_SAMPLES.
 */
export function classifySpikeSeverity(
  currentIntervalCount: number,
  baselineAverage: number,
  baselineSampleCount: number,
): AutoPayAlertTier {
  const cur = Number(currentIntervalCount);
  const base = Number(baselineAverage);
  const samples = Math.floor(Number(baselineSampleCount));
  if (!Number.isFinite(cur) || !Number.isFinite(base) || samples < AUTOPAY_ALERT_SPIKE_BASELINE_MIN_SAMPLES) {
    return "ok";
  }
  if (base <= 0) return cur > 0 ? "warning" : "ok";
  if (cur >= base * AUTOPAY_ALERT_SPIKE_CRITICAL_FACTOR) return "critical";
  if (cur >= base * AUTOPAY_ALERT_SPIKE_WARN_FACTOR) return "warning";
  return "ok";
}

// --- Aggregators for multi-source "retry exhausted" signals ---

export function countPolicyRetryCapSkips(
  results: ReadonlyArray<{ action: string; reason?: string }>,
): number {
  return results.filter((r) => r.action === "skip" && r.reason === "retry_cap_reached").length;
}

export function countReconciliationRetryCapFailures(
  results: ReadonlyArray<{ action: string }>,
): number {
  return results.filter((r) => r.action === "failed_retry_cap_reached").length;
}

export function classifyCombinedRetryExhaustionSeverity(
  policyRetryCapSkips: number,
  reconciliationRetryCapFailures: number,
): AutoPayAlertTier {
  return classifyRetryExhaustedBatchSeverity(policyRetryCapSkips + reconciliationRetryCapFailures);
}

// --- Metric names (stable for dashboards / Prometheus) ---

export const AUTOPAY_METRIC_POLICY_SKIPS_TOTAL = "autopay_policy_skips_total";

export const AUTOPAY_METRIC_LIFECYCLE_DECISIONS_TOTAL = "autopay_lifecycle_decisions_total";

export const AUTOPAY_METRIC_RECONCILIATION_ACTIONS_TOTAL = "autopay_reconciliation_actions_total";

// --- Label keys (stable; values must remain bounded / non-identifying) ---

export const LABEL_AUTOPAY_SUBSYSTEM = "autopay_subsystem";

export const LABEL_AUTOPAY_OUTCOME = "outcome";

export const LABEL_AUTOPAY_TERMINAL_REASON = "terminal_reason";

export const LABEL_AUTOPAY_RECONCILE_ACTION = "reconcile_action";

export const LABEL_AUTOPAY_STRIPE_TRUTH = "stripe_truth";

export type AutoPayMetricSubsystem = "policy" | "lifecycle" | "reconciliation";

export function buildAutoPayPolicySkipLabels(reason: AutoPayTerminalReason): Record<string, string> {
  return {
    [LABEL_AUTOPAY_SUBSYSTEM]: "policy",
    [LABEL_AUTOPAY_OUTCOME]: "skip",
    [LABEL_AUTOPAY_TERMINAL_REASON]: reason,
  };
}

type LifecycleDecisionLabelInput =
  | { action: "start_new_attempt" }
  | { action: "replay_existing_attempt"; paymentIntentId: string }
  | { action: "skip_terminal"; reason: "completed" | "cancelled" | "retry_cap_reached" };

export function buildAutoPayLifecycleLabels(decision: LifecycleDecisionLabelInput): Record<string, string> {
  if (decision.action === "start_new_attempt") {
    return {
      [LABEL_AUTOPAY_SUBSYSTEM]: "lifecycle",
      [LABEL_AUTOPAY_OUTCOME]: "start_new_attempt",
    };
  }
  if (decision.action === "replay_existing_attempt") {
    return {
      [LABEL_AUTOPAY_SUBSYSTEM]: "lifecycle",
      [LABEL_AUTOPAY_OUTCOME]: "replay_existing_attempt",
    };
  }
  return {
    [LABEL_AUTOPAY_SUBSYSTEM]: "lifecycle",
    [LABEL_AUTOPAY_OUTCOME]: "skip_terminal",
    [LABEL_AUTOPAY_TERMINAL_REASON]: decision.reason,
  };
}

/** Reconciliation job outcomes; omit payment IDs. */
export function buildAutoPayReconciliationLabels(
  reconcileAction: string,
  stripeTruth?: string,
): Record<string, string> {
  const labels: Record<string, string> = {
    [LABEL_AUTOPAY_SUBSYSTEM]: "reconciliation",
    [LABEL_AUTOPAY_RECONCILE_ACTION]: reconcileAction,
  };
  if (stripeTruth !== undefined && stripeTruth !== "") {
    labels[LABEL_AUTOPAY_STRIPE_TRUTH] = stripeTruth;
  }
  return labels;
}

/**
 * Maps retry index to coarse bucket for metrics (never emit raw payment row id).
 * `retry_cap` bucket aligns with policy max for dashboard algebra.
 */
export function autopayRetryAttemptMetricBucket(retryCount: number): string {
  const n = Number.isFinite(retryCount) ? Math.max(0, Math.floor(Number(retryCount))) : 0;
  if (n >= AUTOPAY_MAX_RETRY_ATTEMPTS) return "retry_cap";
  return `attempt_${n}`;
}
