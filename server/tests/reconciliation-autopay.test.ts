import { describe, expect, it, jest } from "@jest/globals";
import {
  buildAutoPayReconciliationCriteria,
  reconcileStuckAutoPayProcessingAttempts,
} from "../services/autopay-reconciliation";

describe("autopay reconciliation", () => {
  it("builds deterministic stuck-processing query criteria", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const criteria = buildAutoPayReconciliationCriteria(now);

    expect(criteria.status).toBe("processing");
    expect(criteria.updatedBefore.toISOString()).toBe("2026-05-08T11:30:00.000Z");
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
});
