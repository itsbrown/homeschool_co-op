import { describe, expect, it } from "@jest/globals";
import {
  calculateCanonicalAmounts,
  type CanonicalAmountCalculationRequest,
} from "../services/canonical-amount-calculator";

describe("calculateCanonicalAmounts", () => {
  it("calculates checkout totals from canonical line amounts and membership", () => {
    const result = calculateCanonicalAmounts({
      mode: "checkout",
      items: [
        { id: "enrollment-1", totalCostCents: 130000, totalPaidCents: 0 },
        { id: "enrollment-2", totalCostCents: 90000, totalPaidCents: 10000 },
      ],
      membershipAmountCents: 17500,
    });

    expect(result.enrollmentSubtotalCents).toBe(210000);
    expect(result.membershipAmountCents).toBe(17500);
    expect(result.totalAmountCents).toBe(227500);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0].selectedChargeCents).toBe(130000);
    expect(result.breakdown[1].selectedChargeCents).toBe(80000);
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.errors).toEqual([]);
  });

  it("calculates billing totals from remaining balance cents when provided", () => {
    const result = calculateCanonicalAmounts({
      mode: "billing",
      items: [
        {
          id: "enrollment-1",
          totalCostCents: 130000,
          totalPaidCents: 10000,
          remainingBalanceCents: 120000,
        },
        {
          id: "enrollment-2",
          totalCostCents: 90000,
          totalPaidCents: 50000,
          remainingBalanceCents: 40000,
        },
      ],
    });

    expect(result.enrollmentSubtotalCents).toBe(160000);
    expect(result.totalAmountCents).toBe(160000);
    expect(result.breakdown[0].flags.usedProvidedRemainingBalance).toBe(true);
    expect(result.breakdown[1].flags.usedProvidedRemainingBalance).toBe(true);
    expect(result.validation.isValid).toBe(true);
  });

  it("checkout uses remainingBalance when lower than totalCost (cart discounts)", () => {
    const result = calculateCanonicalAmounts({
      mode: "checkout",
      items: [
        {
          id: "enrollment-a",
          totalCostCents: 200000,
          totalPaidCents: 0,
          remainingBalanceCents: 158631,
        },
      ],
    });

    expect(result.enrollmentSubtotalCents).toBe(158631);
    expect(result.breakdown[0].selectedChargeCents).toBe(158631);
    expect(result.breakdown[0].source).toBe("remaining_balance");
    expect(result.validation.isValid).toBe(true);
  });

  it("falls back to computed remaining balance for billing when remaining is not provided", () => {
    const result = calculateCanonicalAmounts({
      mode: "billing",
      items: [{ id: "enrollment-1", totalCostCents: 90000, totalPaidCents: 25000 }],
    });

    expect(result.enrollmentSubtotalCents).toBe(65000);
    expect(result.breakdown[0].computedRemainingBalanceCents).toBe(65000);
    expect(result.breakdown[0].flags.usedProvidedRemainingBalance).toBe(false);
    expect(result.validation.isValid).toBe(true);
  });

  it("returns deterministic output for the same input", () => {
    const input: CanonicalAmountCalculationRequest = {
      mode: "billing",
      items: [
        {
          id: "line-1",
          totalCostCents: 10000,
          totalPaidCents: 2500,
          remainingBalanceCents: 7500,
        },
        {
          id: "line-2",
          totalCostCents: 20000,
          totalPaidCents: 0,
        },
      ],
    };

    const first = calculateCanonicalAmounts(input);
    const second = calculateCanonicalAmounts(input);

    expect(second).toEqual(first);
  });

  it("surfaces validation errors for malformed/non-integer input and duplicate ids", () => {
    const result = calculateCanonicalAmounts({
      mode: "billing",
      items: [
        { id: "dup", totalCostCents: "12.34", totalPaidCents: 0 },
        { id: "dup", totalCostCents: 2000, totalPaidCents: 0 },
      ],
    });

    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Line "dup" has malformed totalCostCents'),
        'Duplicate line id "dup"',
      ]),
    );
    expect(result.breakdown).toHaveLength(1);
  });

  it("returns warning flags for overpayment and remaining mismatch", () => {
    const result = calculateCanonicalAmounts({
      mode: "billing",
      items: [
        {
          id: "line-1",
          totalCostCents: 10000,
          totalPaidCents: 12000,
          remainingBalanceCents: 1000,
        },
      ],
    });

    expect(result.validation.hasWarnings).toBe(true);
    expect(result.validation.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("totalPaidCents greater than totalCostCents"),
        expect.stringContaining("provided remainingBalanceCents differs from computed balance"),
      ]),
    );
    expect(result.breakdown[0].flags.overpaidAgainstTotalCost).toBe(true);
  });

  it("handles empty items deterministically", () => {
    const result = calculateCanonicalAmounts({
      mode: "checkout",
      items: [],
      membershipAmountCents: 0,
    });

    expect(result.lineCount).toBe(0);
    expect(result.enrollmentSubtotalCents).toBe(0);
    expect(result.totalAmountCents).toBe(0);
    expect(result.validation.isValid).toBe(true);
  });

  it("never trusts client-provided aggregate for canonical total", () => {
    const result = calculateCanonicalAmounts({
      mode: "checkout",
      items: [{ id: "line-1", totalCostCents: 10000, totalPaidCents: 0 }],
      membershipAmountCents: 500,
      clientProvidedTotalAmountCents: 1,
    });

    expect(result.totalAmountCents).toBe(10500);
    expect(result.mismatch.clientProvidedTotalAmountCents).toBe(1);
    expect(result.mismatch.clientTotalMismatchCents).toBe(-10499);
    expect(result.mismatch.hadClientTotalMismatch).toBe(true);
    expect(result.validation.hasWarnings).toBe(true);
  });

  it("treats malformed client-provided aggregate as warning-only and ignores it", () => {
    const result = calculateCanonicalAmounts({
      mode: "checkout",
      items: [{ id: "line-1", totalCostCents: 10000, totalPaidCents: 0 }],
      membershipAmountCents: 500,
      clientProvidedTotalAmountCents: "10.50",
    });

    expect(result.totalAmountCents).toBe(10500);
    expect(result.mismatch.clientProvidedTotalAmountCents).toBeNull();
    expect(result.mismatch.clientTotalMismatchCents).toBe(0);
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.warnings).toEqual(
      expect.arrayContaining([
        "Client-provided total is malformed and was ignored",
      ]),
    );
  });

  it("enforces integer cents invariants for negative and fractional membership values", () => {
    const result = calculateCanonicalAmounts({
      mode: "checkout",
      items: [{ id: "line-1", totalCostCents: 10000, totalPaidCents: 0 }],
      membershipAmountCents: -10.5,
    });

    expect(result.membershipAmountCents).toBe(0);
    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("non-integer membershipAmountCents"),
      ]),
    );
  });
});
