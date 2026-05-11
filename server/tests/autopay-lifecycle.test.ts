import { describe, expect, it } from "@jest/globals";
import { LABEL_AUTOPAY_OUTCOME, LABEL_AUTOPAY_SUBSYSTEM, LABEL_AUTOPAY_TERMINAL_REASON } from "../services/autopay-observability";
import {
  buildAutoPayAttemptKey,
  buildAutoPayLifecycleLabels,
  decideAutoPayAttemptStart,
} from "../services/autopay-lifecycle";

describe("autopay lifecycle replay safety", () => {
  it("replays existing processing attempt instead of creating duplicate charge", () => {
    const decision = decideAutoPayAttemptStart({
      id: 1,
      amount: 5000,
      status: "processing",
      retryCount: 1,
      stripePaymentIntentId: "pi_existing",
    });

    expect(decision).toEqual({
      action: "replay_existing_attempt",
      paymentIntentId: "pi_existing",
    });
  });

  it("skips terminal completed/cancelled attempts", () => {
    expect(
      decideAutoPayAttemptStart({
        id: 1,
        amount: 5000,
        status: "completed",
        retryCount: 0,
      }),
    ).toEqual({ action: "skip_terminal", reason: "completed" });

    expect(
      decideAutoPayAttemptStart({
        id: 2,
        amount: 5000,
        status: "cancelled",
        retryCount: 0,
      }),
    ).toEqual({ action: "skip_terminal", reason: "cancelled" });
  });

  it("skips attempts at retry cap", () => {
    const decision = decideAutoPayAttemptStart({
      id: 3,
      amount: 5000,
      status: "pending",
      retryCount: 3,
    });

    expect(decision).toEqual({ action: "skip_terminal", reason: "retry_cap_reached" });
  });

  it("builds deterministic attempt key", () => {
    expect(buildAutoPayAttemptKey({ scheduledPaymentId: 77, retryCount: 2 })).toBe("autopay:77:retry:2");
  });

  it("emits dashboard-ready lifecycle labels without payment intent ids", () => {
    const replay = decideAutoPayAttemptStart({
      id: 1,
      amount: 5000,
      status: "processing",
      retryCount: 1,
      stripePaymentIntentId: "pi_test_secret",
    });
    expect(replay).toEqual({
      action: "replay_existing_attempt",
      paymentIntentId: "pi_test_secret",
    });
    const labels = buildAutoPayLifecycleLabels(replay);
    expect(labels[LABEL_AUTOPAY_SUBSYSTEM]).toBe("lifecycle");
    expect(labels[LABEL_AUTOPAY_OUTCOME]).toBe("replay_existing_attempt");
    expect(Object.values(labels).join(" ")).not.toMatch(/pi_/);
  });

  it("labels retry-cap terminal lifecycle skips with bounded terminal_reason", () => {
    const decision = decideAutoPayAttemptStart({
      id: 3,
      amount: 5000,
      status: "pending",
      retryCount: 3,
    });
    const labels = buildAutoPayLifecycleLabels(decision);
    expect(labels[LABEL_AUTOPAY_TERMINAL_REASON]).toBe("retry_cap_reached");
  });
});
