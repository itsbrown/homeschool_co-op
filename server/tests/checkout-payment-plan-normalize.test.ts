import { describe, expect, it } from "@jest/globals";
import {
  checkoutPlanUsesInstallmentPhases,
  normalizeCheckoutPaymentPlanRequest,
} from "@shared/checkout-payment-plan";

describe("normalizeCheckoutPaymentPlanRequest", () => {
  it("coerces orphan biweekly frequency when plan is full (repro: full_payment + biweekly PI)", () => {
    const out = normalizeCheckoutPaymentPlanRequest("full", "biweekly");
    expect(out.corrected).toBe(true);
    expect(out.paymentPlan).toBe("full");
    expect(out.paymentFrequency).toBe("one_time");
    expect(out.dbPaymentPlan).toBe("full_payment");
  });

  it("keeps biweekly plan and frequency aligned", () => {
    const out = normalizeCheckoutPaymentPlanRequest("biweekly", "biweekly");
    expect(out.corrected).toBe(false);
    expect(out.paymentPlan).toBe("biweekly");
    expect(out.paymentFrequency).toBe("biweekly");
    expect(out.dbPaymentPlan).toBe("biweekly");
  });

  it("coerces frequency to biweekly when plan is biweekly", () => {
    const out = normalizeCheckoutPaymentPlanRequest("biweekly", "one_time");
    expect(out.corrected).toBe(true);
    expect(out.paymentFrequency).toBe("biweekly");
  });

  it("coerces full plan to one_time frequency", () => {
    const out = normalizeCheckoutPaymentPlanRequest("full", "biweekly");
    expect(out.paymentPlan).toBe("full");
    expect(out.paymentFrequency).toBe("one_time");
  });
});

describe("checkoutPlanUsesInstallmentPhases", () => {
  it("biweekly plan uses installments", () => {
    expect(checkoutPlanUsesInstallmentPhases("biweekly", "biweekly")).toBe(true);
  });

  it("full plan does not", () => {
    expect(checkoutPlanUsesInstallmentPhases("full", "one_time")).toBe(false);
  });
});
