import { describe, expect, it } from "@jest/globals";
import {
  buildScheduledPaymentIntentMetadata,
  resolveEnrollmentIdsFromScheduledRow,
  resolveScheduledPaymentEnrollmentIds,
} from "../lib/scheduled-payment-intent-metadata";

describe("scheduled-payment-intent-metadata", () => {
  it("builds webhook-aligned string metadata for scheduled_payment", () => {
    const meta = buildScheduledPaymentIntentMetadata({
      scheduledPaymentId: 12,
      parentEmail: "parent@example.com",
      parentUserId: 99,
      installmentNumber: 2,
      totalInstallments: 5,
      enrollmentIds: [10, 11],
      autoPayInitiated: true,
      chargeAmountCents: 5000,
      description: "Test installment",
      creditsAppliedCents: 100,
      originalAmountCents: 5100,
      creditHoldSessionId: "hold_1",
    });

    expect(meta.paymentType).toBe("scheduled_payment");
    expect(meta.type).toBe("scheduled_payment");
    expect(meta.scheduledPaymentId).toBe("12");
    expect(meta.parentEmail).toBe("parent@example.com");
    expect(meta.userId).toBe("99");
    expect(meta.installmentNumber).toBe("2");
    expect(meta.totalInstallments).toBe("5");
    expect(meta.enrollmentIds).toBe("[10,11]");
    expect(meta.autoPayInitiated).toBe("true");
    expect(meta.amountCents).toBe("5000");
    expect(meta.creditsAppliedCents).toBe("100");
    expect(meta.originalAmountCents).toBe("5100");
    expect(meta.creditHoldSessionId).toBe("hold_1");
    expect(meta.holdSessionId).toBe("hold_1");
    expect(meta.description).toBe("Test installment");
  });

  it("resolves enrollment ids from row metadata when present", () => {
    expect(
      resolveEnrollmentIdsFromScheduledRow({
        enrollmentId: 1,
        metadata: { enrollmentIds: [2, 3] },
      }),
    ).toEqual([2, 3]);
  });

  it("resolves enrollment ids from PI metadata when JSON array present", () => {
    expect(
      resolveScheduledPaymentEnrollmentIds(
        { enrollmentId: 1, metadata: {} },
        { enrollmentIds: "[2,3]" },
      ),
    ).toEqual([2, 3]);
  });

  it("falls back to row when PI metadata enrollmentIds invalid", () => {
    expect(
      resolveScheduledPaymentEnrollmentIds(
        { enrollmentId: 9, metadata: {} },
        { enrollmentIds: "not-json" },
      ),
    ).toEqual([9]);
  });
});
