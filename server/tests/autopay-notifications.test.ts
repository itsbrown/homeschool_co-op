import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetNotificationsByUserId = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("../storage", () => ({
  storage: {
    getNotificationsByUserId: (...a: unknown[]) => mockGetNotificationsByUserId(...a),
    createNotification: (...a: unknown[]) => mockCreateNotification(...a),
  },
}));

jest.mock("../lib/consolidated-family-reminder", () => ({
  queuePreChargeEmailCandidate: jest.fn(),
  flushPreChargeEmailBatch: jest.fn(async () => undefined),
  clearPreChargeEmailBatchForTests: jest.fn(),
  groupReminderItemsByParent: jest.fn(),
  sendConsolidatedFamilyPaymentReminderEmail: jest.fn(async () => true),
}));

describe("autopay-notifications", () => {
  beforeEach(() => {
    mockGetNotificationsByUserId.mockReset();
    mockCreateNotification.mockReset();
    mockGetNotificationsByUserId.mockResolvedValue([]);
    mockCreateNotification.mockResolvedValue({ id: 1 });
  });

  it("sends pre-charge when inside window and dedupes on repeat", async () => {
    const { maybeEmitPreChargeNotification } = await import("../services/autopay-notifications");
    const dueAt = new Date("2026-05-11T18:00:00.000Z");
    const now = new Date("2026-05-11T04:00:00.000Z"); // 14h before

    const first = await maybeEmitPreChargeNotification({
      scheduledPaymentId: 42,
      parentId: 9,
      parentEmail: "parent@test.com",
      amountCents: 5000,
      dueAt,
      installmentNumber: 2,
      totalInstallments: 4,
      now,
    });
    expect(first.sent).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);

    mockGetNotificationsByUserId.mockResolvedValue([
      { content: "[[AUTOPAY_DEDUPE:pre_charge:42:2026-05-11]]" },
    ] as any);
    const second = await maybeEmitPreChargeNotification({
      scheduledPaymentId: 42,
      parentId: 9,
      parentEmail: "parent@test.com",
      amountCents: 5000,
      dueAt,
      now,
    });
    expect(second.sent).toBe(false);
    expect(second.reason).toBe("duplicate");
  });

  it("does not send pre-charge outside window", async () => {
    const { maybeEmitPreChargeNotification } = await import("../services/autopay-notifications");
    const dueAt = new Date("2026-05-11T18:00:00.000Z");
    const now = new Date("2026-05-10T04:00:00.000Z"); // > 20h before

    const r = await maybeEmitPreChargeNotification({
      scheduledPaymentId: 43,
      parentId: 9,
      parentEmail: "parent@test.com",
      amountCents: 5000,
      dueAt,
      now,
    });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe("outside_window");
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("emits credit-covered skip once", async () => {
    const { maybeEmitCreditCoveredSkipNotification } = await import("../services/autopay-notifications");
    const dueAt = new Date("2026-05-11T12:00:00.000Z");
    const r = await maybeEmitCreditCoveredSkipNotification({
      scheduledPaymentId: 7,
      parentId: 3,
      parentEmail: "a@b.com",
      amountCents: 1000,
      dueAt,
    });
    expect(r.sent).toBe(true);
    mockGetNotificationsByUserId.mockResolvedValue([
      { content: "[[AUTOPAY_DEDUPE:credit_covered_skip:7:2026-05-11]]" },
    ] as any);
    const r2 = await maybeEmitCreditCoveredSkipNotification({
      scheduledPaymentId: 7,
      parentId: 3,
      parentEmail: "a@b.com",
      amountCents: 1000,
      dueAt,
    });
    expect(r2.reason).toBe("duplicate");
  });
});
