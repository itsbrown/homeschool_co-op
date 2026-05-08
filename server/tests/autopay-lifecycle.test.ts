import { describe, expect, it } from "@jest/globals";
import { buildAutoPayAttemptKey, decideAutoPayAttemptStart } from "../services/autopay-lifecycle";

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
});
