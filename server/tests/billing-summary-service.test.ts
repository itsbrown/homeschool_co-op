import { describe, expect, it } from "@jest/globals";
import { computeBillingSummaryTotals } from "../services/billing-summary-service";

describe("billing summary service correctness", () => {
  it("includes marketplace and regular enrollments in canonical balance", () => {
    const result = computeBillingSummaryTotals(
      [
        {
          id: 1,
          classType: "regular",
          classId: 101,
          totalCost: 10000,
          totalPaid: 4000,
          remainingBalance: 6000,
          status: "enrolled",
        },
        {
          id: 2,
          classType: "marketplace",
          marketplaceClassId: 202,
          totalCost: 12000,
          totalPaid: 2000,
          remainingBalance: 10000,
          status: "pending_payment",
        },
      ],
      [],
    );

    expect(result.includedEnrollmentCount).toBe(2);
    expect(result.enrollmentBalanceCents).toBe(16000);
    expect(result.canonicalBalanceCents).toBe(16000);
  });

  it("does not double-count pending scheduled payments into canonical balance", () => {
    const result = computeBillingSummaryTotals(
      [
        {
          id: 10,
          totalCost: 30000,
          totalPaid: 10000,
          remainingBalance: 20000,
          status: "enrolled",
        },
      ],
      [
        { id: 50, amount: 5000, status: "pending" },
        { id: 51, amount: 5000, status: "pending" },
        { id: 52, amount: 5000, status: "paid" },
      ],
    );

    expect(result.enrollmentBalanceCents).toBe(20000);
    expect(result.scheduledPaymentsBalanceCents).toBe(10000);
    expect(result.pendingScheduledPaymentCount).toBe(2);
    // Canonical owed remains enrollment-based only.
    expect(result.canonicalBalanceCents).toBe(20000);
  });

  it("excludes cancelled/withdrawn enrollments from summary totals", () => {
    const result = computeBillingSummaryTotals(
      [
        { id: 1, remainingBalance: 5000, status: "cancelled" },
        { id: 2, remainingBalance: 3000, status: "withdrawn" },
        { id: 3, remainingBalance: 7000, status: "enrolled" },
      ],
      [],
    );

    expect(result.includedEnrollmentCount).toBe(1);
    expect(result.canonicalBalanceCents).toBe(7000);
  });
});
