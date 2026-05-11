import { describe, expect, it } from "@jest/globals";
import {
  SUPPORTED_PAYMENT_PLANS,
  buildPaymentPlanPolicyMatrix,
} from "./helpers/paymentPlanPolicyFixtures";

describe("payment plan policy matrix invariants", () => {
  it("is deterministic across calls", () => {
    const first = buildPaymentPlanPolicyMatrix();
    const second = buildPaymentPlanPolicyMatrix();
    expect(second).toEqual(first);
  });

  it("covers all currently supported plan modes exactly once", () => {
    const matrix = buildPaymentPlanPolicyMatrix();
    expect(matrix.map((entry) => entry.paymentPlan)).toEqual([...SUPPORTED_PAYMENT_PLANS]);
  });

  it("uses valid cents and installment expectations per plan policy", () => {
    const matrix = buildPaymentPlanPolicyMatrix();
    const expectedInstallments = {
      full: 1,
      deposit: 2,
      split: 2,
      biweekly: 4,
    } as const;

    for (const row of matrix) {
      expect(Number.isInteger(row.totalCents)).toBe(true);
      expect(row.totalCents).toBeGreaterThan(0);
      expect(row.expectedInstallmentCount).toBe(expectedInstallments[row.paymentPlan]);
      if (row.expectedFirstChargeCents !== undefined) {
        expect(Number.isInteger(row.expectedFirstChargeCents)).toBe(true);
        expect(row.expectedFirstChargeCents).toBeGreaterThan(0);
        expect(row.expectedFirstChargeCents).toBeLessThanOrEqual(row.totalCents);
      }
    }
  });

  it("locks odd-cent regression guard scenarios for split and biweekly", () => {
    const matrix = buildPaymentPlanPolicyMatrix();
    const split = matrix.find((entry) => entry.paymentPlan === "split");
    const biweekly = matrix.find((entry) => entry.paymentPlan === "biweekly");

    expect(split).toBeDefined();
    expect(biweekly).toBeDefined();

    expect(split?.policyIntent).toBe("odd_cent_regression_guard");
    expect(split?.totalCents).toBe(10001);
    expect(split?.expectedFirstChargeCents).toBe(5001);

    expect(biweekly?.policyIntent).toBe("odd_cent_regression_guard");
    expect(biweekly?.totalCents).toBe(10003);
    expect(biweekly?.expectedFirstChargeCents).toBe(2501);
  });
});
