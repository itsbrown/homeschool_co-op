import { describe, expect, it } from "@jest/globals";
import { type AutoPayMetricEvent } from "../services/autopay-observability";
import {
  AUTOPAY_MAX_RETRY_ATTEMPTS,
  AUTOPAY_STALE_ATTEMPT_DAYS,
  buildDueAutoPayQueryCriteria,
  evaluateAutoPayPolicy,
  isRetryCapReached,
  isStaleAttemptDate,
} from "../services/autopay-policy";

describe("autopay policy guards", () => {
  it("enforces retry cap at configured max attempts", () => {
    expect(isRetryCapReached(AUTOPAY_MAX_RETRY_ATTEMPTS - 1)).toBe(false);
    expect(isRetryCapReached(AUTOPAY_MAX_RETRY_ATTEMPTS)).toBe(true);
    expect(isRetryCapReached(AUTOPAY_MAX_RETRY_ATTEMPTS + 1)).toBe(true);
  });

  it("marks attempts older than stale cutoff as stale", () => {
    const now = new Date("2026-05-08T00:00:00.000Z");
    const stale = new Date("2026-04-23T00:00:00.000Z"); // 15 days old
    const boundary = new Date("2026-04-24T00:00:00.000Z"); // 14 days old

    expect(isStaleAttemptDate(stale, now)).toBe(true);
    expect(isStaleAttemptDate(boundary, now)).toBe(false);
  });

  it("returns deterministic terminal reason for retry cap", () => {
    const metrics: AutoPayMetricEvent[] = [];
    const decision = evaluateAutoPayPolicy({
      id: 1,
      retryCount: 3,
      dueDate: "2026-05-08T00:00:00.000Z",
      status: "pending",
    }, new Date("2026-05-08T00:00:00.000Z"), {
      emit: (event) => metrics.push(event),
    });
    expect(decision).toEqual({ action: "skip", reason: "retry_cap_reached" });
    expect(metrics).toContainEqual({
      metric: "autopay_failure_total",
      labels: {
        source: "policy",
        action: "skip",
        reason_code: "retry_cap_reached",
      },
    });
  });

  it("returns deterministic terminal reason for stale attempts", () => {
    const decision = evaluateAutoPayPolicy(
      {
        id: 2,
        retryCount: 0,
        dueDate: "2026-04-20T00:00:00.000Z",
        status: "overdue",
      },
      new Date("2026-05-08T00:00:00.000Z"),
    );
    expect(decision).toEqual({ action: "skip", reason: "stale_attempt" });
  });

  it("allows processing for within-window and below-cap candidates", () => {
    const decision = evaluateAutoPayPolicy(
      {
        id: 3,
        retryCount: 1,
        dueDate: "2026-05-01T00:00:00.000Z",
        status: "pending",
      },
      new Date("2026-05-08T00:00:00.000Z"),
    );
    expect(decision).toEqual({ action: "process" });
  });

  it("builds db query criteria with configured retry/stale policy", () => {
    const now = new Date("2026-05-08T12:34:56.000Z");
    const criteria = buildDueAutoPayQueryCriteria(now);

    expect(criteria.statuses).toEqual(["pending", "overdue"]);
    expect(criteria.retryCountLessThan).toBe(AUTOPAY_MAX_RETRY_ATTEMPTS);
    expect(criteria.dueOnOrBefore.toISOString()).toBe("2026-05-08T00:00:00.000Z");
    expect(criteria.dueOnOrAfter.toISOString()).toBe("2026-04-24T00:00:00.000Z");
    expect(AUTOPAY_STALE_ATTEMPT_DAYS).toBe(14);
  });
});
