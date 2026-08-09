import { describe, expect, it } from "@jest/globals";
import { formatSessionFillSummary } from "../lib/session-enrollment-counts";

describe("formatSessionFillSummary", () => {
  it("formats half/full fill against capacity", () => {
    expect(
      formatSessionFillSummary({
        halfDayEnrolled: 12,
        fullDayEnrolled: 18,
        halfDayCapacity: 20,
        fullDayCapacity: 25,
      }),
    ).toBe("12/20 half · 18/25 full");
  });

  it("uses em dash when capacity is null", () => {
    expect(
      formatSessionFillSummary({
        halfDayEnrolled: 1,
        fullDayEnrolled: 0,
        halfDayCapacity: null,
        fullDayCapacity: undefined,
      }),
    ).toBe("1/— half · 0/— full");
  });

  it("appends waitlist counts when present", () => {
    expect(
      formatSessionFillSummary({
        halfDayEnrolled: 20,
        fullDayEnrolled: 25,
        halfDayCapacity: 20,
        fullDayCapacity: 25,
        halfDayWaitlist: 3,
        fullDayWaitlist: 1,
      }),
    ).toBe("20/20 half · 25/25 full · 3 half waitlist · 1 full waitlist");
  });
});
