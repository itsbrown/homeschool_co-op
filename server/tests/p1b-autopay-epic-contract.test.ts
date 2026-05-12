import { describe, expect, it } from "@jest/globals";
import {
  AUTOPAY_METRIC_NOTIFICATIONS_TOTAL,
  AUTOPAY_PROCESSING_STUCK_MINUTES,
  classifyRetryExhaustedBatchSeverity,
} from "../services/autopay-observability";
import {
  AUTOPAY_MAX_RETRY_ATTEMPTS,
  AUTOPAY_STALE_ATTEMPT_DAYS,
  buildDueAutoPayQueryCriteria,
  evaluateAutoPayPolicy,
  getDueAutoPayCandidates,
} from "../services/autopay-policy";
import {
  mapStripePaymentIntentStatusString,
  reconcileStuckAutoPayProcessingAttempts,
} from "../services/autopay-reconciliation";

describe("P1-B autopay epic contract (smoke)", () => {
  it("exports autopay-policy building blocks", () => {
    expect(typeof AUTOPAY_MAX_RETRY_ATTEMPTS).toBe("number");
    expect(typeof AUTOPAY_STALE_ATTEMPT_DAYS).toBe("number");
    expect(typeof evaluateAutoPayPolicy).toBe("function");
    expect(typeof buildDueAutoPayQueryCriteria).toBe("function");
    expect(typeof getDueAutoPayCandidates).toBe("function");
  });

  it("exports autopay-reconciliation building blocks", () => {
    expect(typeof reconcileStuckAutoPayProcessingAttempts).toBe("function");
    expect(typeof mapStripePaymentIntentStatusString).toBe("function");
  });

  it("exports autopay-observability threshold and classifier", () => {
    expect(typeof AUTOPAY_PROCESSING_STUCK_MINUTES).toBe("number");
    expect(typeof classifyRetryExhaustedBatchSeverity).toBe("function");
  });

  it("exports notification metric name for dashboards", () => {
    expect(AUTOPAY_METRIC_NOTIFICATIONS_TOTAL).toBe("autopay_notifications_total");
  });
});
