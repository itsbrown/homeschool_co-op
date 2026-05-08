export interface PaymentPlanPolicyFixture {
  name: string;
  totalCents: number;
  paymentPlan: "full" | "deposit" | "split" | "biweekly";
  paymentFrequency: "one_time" | "weekly" | "biweekly" | "monthly";
  expectedInstallmentCount: number;
  expectedFirstChargeCents?: number;
}

/**
 * Regression matrix substrate for payment plan policy tests.
 * Pure fixtures only; no route wiring.
 */
export function buildPaymentPlanPolicyMatrix(): PaymentPlanPolicyFixture[] {
  return [
    {
      name: "full one-time baseline",
      totalCents: 10000,
      paymentPlan: "full",
      paymentFrequency: "one_time",
      expectedInstallmentCount: 1,
      expectedFirstChargeCents: 10000,
    },
    {
      name: "deposit baseline",
      totalCents: 10000,
      paymentPlan: "deposit",
      paymentFrequency: "one_time",
      expectedInstallmentCount: 2,
      expectedFirstChargeCents: 1000,
    },
    {
      name: "split baseline",
      totalCents: 10001,
      paymentPlan: "split",
      paymentFrequency: "one_time",
      expectedInstallmentCount: 2,
      expectedFirstChargeCents: 5001,
    },
    {
      name: "biweekly baseline",
      totalCents: 10003,
      paymentPlan: "biweekly",
      paymentFrequency: "biweekly",
      expectedInstallmentCount: 4,
      expectedFirstChargeCents: 2501,
    },
  ];
}

export function buildEquivalentIdempotencyInputs() {
  return [
    {
      parentEmail: "parent@test.com",
      enrollmentIds: [11, 22, 33],
      amountCents: 12000,
      operation: "pay_all",
      schoolId: 3,
    },
    {
      parentEmail: " parent@test.com ",
      enrollmentIds: [33, 11, 22],
      amountCents: 12000,
      operation: "pay_all",
      schoolId: 3,
    },
  ];
}
