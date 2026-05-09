import { describe, expect, it } from "@jest/globals";
import {
  AUTOPAY_ALERT_DIVERGENCE_CRITICAL_RATIO,
  AUTOPAY_ALERT_DIVERGENCE_WARN_RATIO,
  AUTOPAY_ALERT_PROCESSING_BACKLOG_CRITICAL_COUNT,
  AUTOPAY_ALERT_PROCESSING_BACKLOG_WARN_COUNT,
  AUTOPAY_ALERT_RETRY_EXHAUSTED_CRITICAL_BATCH,
  AUTOPAY_ALERT_RETRY_EXHAUSTED_WARN_BATCH,
  AUTOPAY_ALERT_SPIKE_BASELINE_MIN_SAMPLES,
  AUTOPAY_METRIC_LIFECYCLE_DECISIONS_TOTAL,
  AUTOPAY_METRIC_POLICY_SKIPS_TOTAL,
  AUTOPAY_METRIC_RECONCILIATION_ACTIONS_TOTAL,
  AUTOPAY_PROCESSING_STUCK_MINUTES,
  LABEL_AUTOPAY_OUTCOME,
  LABEL_AUTOPAY_RECONCILE_ACTION,
  LABEL_AUTOPAY_STRIPE_TRUTH,
  LABEL_AUTOPAY_SUBSYSTEM,
  LABEL_AUTOPAY_TERMINAL_REASON,
  autopayRetryAttemptMetricBucket,
  buildAutoPayPolicySkipLabels,
  buildAutoPayReconciliationLabels,
  classifyCombinedRetryExhaustionSeverity,
  classifyProcessingBacklogSeverity,
  classifyRetryExhaustedBatchSeverity,
  classifySpikeSeverity,
  classifyTerminalDivergenceSeverity,
  countPolicyRetryCapSkips,
  countReconciliationRetryCapFailures,
} from "../../../services/autopay-observability";

describe("autopay metrics contracts / alert taxonomy", () => {
  it("exposes stable metric names for dashboards", () => {
    expect(AUTOPAY_METRIC_POLICY_SKIPS_TOTAL).toBe("autopay_policy_skips_total");
    expect(AUTOPAY_METRIC_LIFECYCLE_DECISIONS_TOTAL).toBe("autopay_lifecycle_decisions_total");
    expect(AUTOPAY_METRIC_RECONCILIATION_ACTIONS_TOTAL).toBe("autopay_reconciliation_actions_total");
  });

  it("uses a bounded label-key set with no identifying dimensions in sample payloads", () => {
    const policyLabels = buildAutoPayPolicySkipLabels("retry_cap_reached");
    const reconLabels = buildAutoPayReconciliationLabels("completed_from_stripe_truth", "succeeded");
    expect(Object.keys(policyLabels)).toEqual(
      expect.arrayContaining([
        LABEL_AUTOPAY_SUBSYSTEM,
        LABEL_AUTOPAY_OUTCOME,
        LABEL_AUTOPAY_TERMINAL_REASON,
      ]),
    );
    expect(Object.keys(reconLabels)).toEqual(
      expect.arrayContaining([LABEL_AUTOPAY_SUBSYSTEM, LABEL_AUTOPAY_RECONCILE_ACTION, LABEL_AUTOPAY_STRIPE_TRUTH]),
    );
    const pairs = [...Object.entries(policyLabels), ...Object.entries(reconLabels)];
    for (const [, v] of pairs) {
      expect(String(v).toLowerCase()).not.toMatch(/user|parent|email|payment_id|pi_[a-z]/i);
    }
  });

  it("classifies retry-exhausted batch severity at configured thresholds", () => {
    expect(classifyRetryExhaustedBatchSeverity(0)).toBe("ok");
    expect(classifyRetryExhaustedBatchSeverity(AUTOPAY_ALERT_RETRY_EXHAUSTED_WARN_BATCH - 1)).toBe("ok");
    expect(classifyRetryExhaustedBatchSeverity(AUTOPAY_ALERT_RETRY_EXHAUSTED_WARN_BATCH)).toBe("warning");
    expect(classifyRetryExhaustedBatchSeverity(AUTOPAY_ALERT_RETRY_EXHAUSTED_CRITICAL_BATCH - 1)).toBe(
      "warning",
    );
    expect(classifyRetryExhaustedBatchSeverity(AUTOPAY_ALERT_RETRY_EXHAUSTED_CRITICAL_BATCH)).toBe("critical");
  });

  it("classifies stuck-processing backlog using reconciliation row counts", () => {
    expect(classifyProcessingBacklogSeverity(0)).toBe("ok");
    expect(classifyProcessingBacklogSeverity(AUTOPAY_ALERT_PROCESSING_BACKLOG_WARN_COUNT - 1)).toBe("ok");
    expect(classifyProcessingBacklogSeverity(AUTOPAY_ALERT_PROCESSING_BACKLOG_WARN_COUNT)).toBe("warning");
    expect(classifyProcessingBacklogSeverity(AUTOPAY_ALERT_PROCESSING_BACKLOG_CRITICAL_COUNT - 1)).toBe(
      "warning",
    );
    expect(classifyProcessingBacklogSeverity(AUTOPAY_ALERT_PROCESSING_BACKLOG_CRITICAL_COUNT)).toBe("critical");
    expect(AUTOPAY_PROCESSING_STUCK_MINUTES).toBe(30);
  });

  it("classifies divergence as terminal share of due batch", () => {
    expect(classifyTerminalDivergenceSeverity(0, 10)).toBe("ok");
    expect(classifyTerminalDivergenceSeverity(2, 10)).toBe("ok"); // 20% < 25% warn
    expect(classifyTerminalDivergenceSeverity(3, 10)).toBe("warning"); // 30%
    expect(classifyTerminalDivergenceSeverity(5, 10)).toBe("critical"); // 50% threshold boundary
    expect(classifyTerminalDivergenceSeverity(1, 0)).toBe("ok");
    expect(AUTOPAY_ALERT_DIVERGENCE_WARN_RATIO).toBe(0.25);
    expect(AUTOPAY_ALERT_DIVERGENCE_CRITICAL_RATIO).toBe(0.5);
  });

  it("classifies spike severity only after enough baseline samples", () => {
    expect(classifySpikeSeverity(100, 1, AUTOPAY_ALERT_SPIKE_BASELINE_MIN_SAMPLES - 1)).toBe("ok");
    expect(classifySpikeSeverity(30, 10, AUTOPAY_ALERT_SPIKE_BASELINE_MIN_SAMPLES)).toBe("warning");
    expect(classifySpikeSeverity(60, 10, AUTOPAY_ALERT_SPIKE_BASELINE_MIN_SAMPLES)).toBe("critical");
  });

  it("aggregates policy + reconciliation retry-cap exhaustion for a single alert tier", () => {
    const policySkips = countPolicyRetryCapSkips([
      { action: "skip", reason: "retry_cap_reached" },
      { action: "skip", reason: "retry_cap_reached" },
      { action: "process" },
    ]);
    const reconFails = countReconciliationRetryCapFailures([
      { action: "failed_retry_cap_reached" },
      { action: "moved_to_pending_for_retry" },
    ]);
    expect(policySkips).toBe(2);
    expect(reconFails).toBe(1);
    expect(classifyCombinedRetryExhaustionSeverity(policySkips, reconFails)).toBe("warning");
    expect(classifyCombinedRetryExhaustionSeverity(2, 0)).toBe("ok");
  });

  it("buckets retry attempts for metric cardinality without raw ids", () => {
    expect(autopayRetryAttemptMetricBucket(0)).toBe("attempt_0");
    expect(autopayRetryAttemptMetricBucket(2)).toBe("attempt_2");
    expect(autopayRetryAttemptMetricBucket(3)).toBe("retry_cap");
  });
});
