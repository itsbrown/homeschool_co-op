import { describe, expect, it, jest } from "@jest/globals";
import { classifyProcessingBacklogSeverity } from "../services/autopay-observability";
import {
  buildAutoPayReconciliationCriteria,
  buildAutoPayReconciliationLabels,
  mapStripePaymentIntentStatusString,
  reconcileStuckAutoPayProcessingAttempts,
} from "../services/autopay-reconciliation";

describe("autopay reconciliation", () => {
  it("maps Stripe PaymentIntent status strings to reconciliation truth", () => {
    expect(mapStripePaymentIntentStatusString("succeeded")).toBe("succeeded");
    expect(mapStripePaymentIntentStatusString("processing")).toBe("processing");
    expect(mapStripePaymentIntentStatusString("requires_capture")).toBe("processing");
    expect(mapStripePaymentIntentStatusString("canceled")).toBe("canceled");
    expect(mapStripePaymentIntentStatusString("requires_confirmation")).toBe("requires_confirmation");
    expect(mapStripePaymentIntentStatusString("requires_action")).toBe("requires_action");
    expect(mapStripePaymentIntentStatusString("unknown_future_status")).toBe("requires_payment_method");
  });

  it("builds deterministic stuck-processing query criteria", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const criteria = buildAutoPayReconciliationCriteria(now);

    expect(criteria.status).toBe("processing");
    expect(criteria.updatedBefore.toISOString()).toBe("2026-05-08T11:30:00.000Z");
  });

  it("maps reconciliation results to low-cardinality metric labels", () => {
    const labels = buildAutoPayReconciliationLabels("moved_to_pending_for_retry", "requires_payment_method");
    expect(labels.autopay_subsystem).toBe("reconciliation");
    expect(labels.reconcile_action).toBe("moved_to_pending_for_retry");
    expect(labels.stripe_truth).toBe("requires_payment_method");
  });

  it("derives backlog alert tier from query cardinality (stuck rows)", () => {
    expect(classifyProcessingBacklogSeverity(4)).toBe("ok");
    expect(classifyProcessingBacklogSeverity(5)).toBe("warning");
  });

  it("marks succeeded processing attempts as completed from Stripe truth", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 10, amount: 2000, status: "processing", retryCount: 1, stripePaymentIntentId: "pi_ok" },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async () => "succeeded" as const),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(
      repository,
      stripeGateway,
      new Date("2026-05-08T12:00:00.000Z"),
    );

    expect(result).toEqual([{ paymentId: 10, action: "completed_from_stripe_truth" }]);
    expect(repository.markScheduledPaymentCompleted).toHaveBeenCalledTimes(1);
    expect(repository.markScheduledPaymentFailed).not.toHaveBeenCalled();
  });

  it("moves failed Stripe truth attempts back to pending when below retry cap", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 11, amount: 2000, status: "processing", retryCount: 1, stripePaymentIntentId: "pi_fail" },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async () => "requires_payment_method" as const),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(
      repository,
      stripeGateway,
      new Date("2026-05-08T12:00:00.000Z"),
    );

    expect(result).toEqual([{ paymentId: 11, action: "moved_to_pending_for_retry" }]);
    expect(repository.markScheduledPaymentPending).toHaveBeenCalledWith(11, {
      reason: "stripe_requires_payment_method",
      retryCount: 2,
    });
  });

  it("marks as failed at retry cap and avoids further retry loops", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 12, amount: 2000, status: "processing", retryCount: 2, stripePaymentIntentId: "pi_fail" },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async () => "canceled" as const),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(repository, stripeGateway);

    expect(result).toEqual([{ paymentId: 12, action: "failed_retry_cap_reached" }]);
    expect(repository.markScheduledPaymentFailed).toHaveBeenCalledWith(12, {
      reason: "stripe_canceled",
      retryCount: 3,
    });
    expect(repository.markScheduledPaymentPending).not.toHaveBeenCalled();
  });

  it("handles missing payment intent deterministically", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 13, amount: 2000, status: "processing", retryCount: 0, stripePaymentIntentId: null },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async () => "processing" as const),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(repository, stripeGateway);

    expect(result).toEqual([{ paymentId: 13, action: "failed_missing_payment_intent" }]);
    expect(repository.markScheduledPaymentPending).toHaveBeenCalledWith(13, {
      reason: "missing_payment_intent",
      retryCount: 1,
    });
    expect(stripeGateway.getPaymentIntentStatus).not.toHaveBeenCalled();
  });

  it("terminal-fails dev fixture PaymentIntent ids without calling Stripe", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 327, amount: 2000, status: "processing", retryCount: 0, stripePaymentIntentId: "pi_multi_1" },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async () => "succeeded" as const),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(repository, stripeGateway);

    expect(result).toEqual([{ paymentId: 327, action: "failed_dev_fixture_stripe_intent" }]);
    expect(repository.markScheduledPaymentFailed).toHaveBeenCalledWith(327, {
      reason: "dev_fixture_stripe_payment_intent_id",
      retryCount: 3,
    });
    expect(stripeGateway.getPaymentIntentStatus).not.toHaveBeenCalled();
  });

  it("continues reconciling other rows when Stripe lookup throws for one payment", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 20, amount: 1000, status: "processing", retryCount: 0, stripePaymentIntentId: "pi_err" },
        { id: 21, amount: 1000, status: "processing", retryCount: 0, stripePaymentIntentId: "pi_ok" },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async (pi: string) => {
        if (pi === "pi_err") {
          throw new Error("stripe_timeout");
        }
        return "succeeded" as const;
      }),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(
      repository,
      stripeGateway,
      new Date("2026-05-08T12:00:00.000Z"),
    );

    expect(result).toEqual([{ paymentId: 21, action: "completed_from_stripe_truth" }]);
    expect(repository.markScheduledPaymentCompleted).toHaveBeenCalledWith(21, expect.any(Date));
  });

  it("leaves in-database processing rows alone when Stripe still reports processing", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 30, amount: 1000, status: "processing", retryCount: 0, stripePaymentIntentId: "pi_processing" },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async () => "processing" as const),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(
      repository,
      stripeGateway,
      new Date("2026-05-08T12:00:00.000Z"),
    );

    expect(result).toEqual([{ paymentId: 30, action: "left_processing" }]);
    expect(repository.markScheduledPaymentCompleted).not.toHaveBeenCalled();
    expect(repository.markScheduledPaymentFailed).not.toHaveBeenCalled();
    expect(repository.markScheduledPaymentPending).not.toHaveBeenCalled();
  });

  it("moves requires_confirmation Stripe truth back to pending with a bounded reason label", async () => {
    const repository = {
      queryProcessingScheduledPayments: jest.fn(async () => [
        { id: 31, amount: 1000, status: "processing", retryCount: 0, stripePaymentIntentId: "pi_confirm" },
      ]),
      markScheduledPaymentCompleted: jest.fn(async () => undefined),
      markScheduledPaymentFailed: jest.fn(async () => undefined),
      markScheduledPaymentPending: jest.fn(async () => undefined),
    };
    const stripeGateway = {
      getPaymentIntentStatus: jest.fn(async () => "requires_confirmation" as const),
    };

    const result = await reconcileStuckAutoPayProcessingAttempts(
      repository,
      stripeGateway,
      new Date("2026-05-08T12:00:00.000Z"),
    );

    expect(result).toEqual([{ paymentId: 31, action: "moved_to_pending_for_retry" }]);
    expect(repository.markScheduledPaymentPending).toHaveBeenCalledWith(31, {
      reason: "stripe_requires_confirmation",
      retryCount: 1,
    });
  });
});
