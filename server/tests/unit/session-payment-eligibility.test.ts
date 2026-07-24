import { hasPaidTowardSession, isGradePlacementEnrollment } from "../../../shared/session-payment-eligibility";

describe("session-payment-eligibility", () => {
  const base = {
    sessionId: 10,
    status: "pending_payment",
    totalCost: 100000,
    totalPaid: 0,
    compAmountCents: 0,
  };

  it("rejects null session", () => {
    expect(hasPaidTowardSession({ ...base, sessionId: null })).toBe(false);
  });

  it("rejects terminal and wishlist statuses", () => {
    expect(hasPaidTowardSession({ ...base, status: "cancelled" })).toBe(false);
    expect(hasPaidTowardSession({ ...base, status: "location_wishlist" })).toBe(false);
    expect(hasPaidTowardSession({ ...base, status: "waitlist" })).toBe(false);
  });

  it("accepts first payment / plan installment via totalPaid > 0", () => {
    expect(hasPaidTowardSession({ ...base, totalPaid: 5000, status: "enrolled" })).toBe(true);
    expect(
      hasPaidTowardSession({ ...base, totalPaid: 5000, status: "pending_payment" }),
    ).toBe(true);
  });

  it("accepts credits applied (totalPaid bump)", () => {
    expect(hasPaidTowardSession({ ...base, totalPaid: 100000, status: "enrolled" })).toBe(true);
  });

  it("accepts full comp / $0 when enrolled", () => {
    expect(
      hasPaidTowardSession({
        ...base,
        totalCost: 100000,
        totalPaid: 0,
        compAmountCents: 100000,
        status: "enrolled",
      }),
    ).toBe(true);
    expect(
      hasPaidTowardSession({
        ...base,
        totalCost: 0,
        totalPaid: 0,
        status: "enrolled",
      }),
    ).toBe(true);
  });

  it("rejects $0 still pending_payment", () => {
    expect(
      hasPaidTowardSession({
        ...base,
        totalCost: 0,
        totalPaid: 0,
        status: "pending_payment",
      }),
    ).toBe(false);
  });

  it("rejects unpaid pending session (membership-only case)", () => {
    expect(hasPaidTowardSession(base)).toBe(false);
  });

  it("isGradePlacementEnrollment", () => {
    expect(isGradePlacementEnrollment({ placementSource: "grade" })).toBe(true);
    expect(isGradePlacementEnrollment({ placement_source: "grade" })).toBe(true);
    expect(isGradePlacementEnrollment({})).toBe(false);
  });
});
