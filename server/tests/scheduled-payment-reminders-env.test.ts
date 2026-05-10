import { afterEach, describe, expect, it } from "@jest/globals";

describe("scheduled-payment-reminders env", () => {
  const prev = process.env.AUTOPAY_RECONCILIATION_INTERVAL_MS;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.AUTOPAY_RECONCILIATION_INTERVAL_MS;
    } else {
      process.env.AUTOPAY_RECONCILIATION_INTERVAL_MS = prev;
    }
    jest.resetModules();
  });

  it("parses AUTOPAY_RECONCILIATION_INTERVAL_MS at minimum 60000", async () => {
    process.env.AUTOPAY_RECONCILIATION_INTERVAL_MS = "60000";
    const mod = await import("../services/scheduled-payment-reminders");
    expect(mod.AUTOPAY_RECONCILIATION_INTERVAL_MS).toBe(60_000);
  });

  it("falls back to default hour when value is below minimum", async () => {
    process.env.AUTOPAY_RECONCILIATION_INTERVAL_MS = "59999";
    const mod = await import("../services/scheduled-payment-reminders");
    expect(mod.AUTOPAY_RECONCILIATION_INTERVAL_MS).toBe(60 * 60 * 1000);
  });
});
