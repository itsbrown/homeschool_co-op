import { describe, expect, it } from "@jest/globals";
import {
  enrollmentHasActivePaymentSchedule,
  enrollmentShouldExcludeFromCart,
} from "@shared/enrollment-cart-eligibility";
import { filterEnrollmentsToCartLineItems } from "../../client/src/utils/parentEnrollmentLineItems";

describe("enrollment-cart-eligibility", () => {
  it("excludes when pending scheduled payments exist for enrollment", () => {
    expect(
      enrollmentShouldExcludeFromCart(
        { id: 10, paymentPlan: null, totalPaid: 0 },
        [{ enrollmentId: 10, status: "pending" }],
      ),
    ).toBe(true);
  });

  it("excludes biweekly v2_stripe with deposit paid", () => {
    expect(
      enrollmentShouldExcludeFromCart({
        id: 11,
        paymentPlan: "biweekly",
        paymentSystemVersion: "v2_stripe",
        totalPaid: 50000,
        status: "deposit_paid",
      }),
    ).toBe(true);
  });

  it("allows pending_payment with no plan and no schedule", () => {
    expect(
      enrollmentShouldExcludeFromCart(
        {
          id: 12,
          status: "pending_payment",
          paymentPlan: null,
          totalCost: 100000,
          totalPaid: 0,
          effectiveBalance: 100000,
        },
        [],
      ),
    ).toBe(false);
  });

  it("filterEnrollmentsToCartLineItems omits payment-plan rows", () => {
    const rows = filterEnrollmentsToCartLineItems([
      {
        id: 1,
        childId: 5,
        enrollmentDate: "2026-05-21",
        status: "enrolled",
        paymentPlan: "biweekly",
        paymentSystemVersion: "v2_stripe",
        totalPaid: 50000,
        totalCost: 142500,
        effectiveBalance: 137500,
        managedByPaymentPlan: true,
        checkoutExcluded: true,
      },
      {
        id: 2,
        childId: 5,
        enrollmentDate: "2026-05-20",
        status: "pending_payment",
        totalCost: 50000,
        totalPaid: 0,
        effectiveBalance: 50000,
      },
    ]);
    expect(rows.map((r) => r.id)).toEqual([2]);
  });

  it("enrollmentHasActivePaymentSchedule ignores completed rows", () => {
    expect(
      enrollmentHasActivePaymentSchedule(10, [
        { enrollmentId: 10, status: "completed" },
      ]),
    ).toBe(false);
  });
});
