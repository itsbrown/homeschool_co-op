import {
  MAX_CLAIM_RECOVERIES,
  SENDING_STUCK_AFTER_MS,
  decideClaimFailure,
  decideStuckSending,
  runScheduledNotificationPass,
  type ScheduledPassDeps,
  type ScheduledPassRow,
} from "../scheduled-notification-recovery";

const NOW = new Date("2026-10-06T16:00:00.000Z");

function row(partial: Partial<ScheduledPassRow> & Pick<ScheduledPassRow, "id">): ScheduledPassRow {
  return {
    deliveryStats: { totalRecipients: 4 },
    updatedAt: NOW,
    ...partial,
  };
}

function harness(overrides: Partial<ScheduledPassDeps> = {}) {
  const calls: string[] = [];
  const deps: ScheduledPassDeps = {
    listDue: async () => [],
    claim: async (id) => row({ id, updatedAt: NOW }),
    deliver: async () => {
      calls.push("deliver");
    },
    readStatus: async () => "sent",
    countRecipients: async () => 0,
    markFailed: async (id) => {
      calls.push(`fail:${id}`);
    },
    requeue: async (id, stats) => {
      calls.push(`requeue:${id}:${stats.claimRecoveries}`);
    },
    listStuckSending: async () => [],
    ...overrides,
  };
  return { deps, calls };
}

describe("scheduled notification claim recovery", () => {
  it("retries a thrown delivery with no recipients, and still delivers the next row", async () => {
    const delivered: number[] = [];
    const { deps, calls } = harness({
      listDue: async () => [row({ id: 1 }), row({ id: 2 })],
      claim: async (id) => row({ id, deliveryStats: { totalRecipients: 4 } }),
      deliver: async (claimed) => {
        delivered.push(claimed.id);
        if (claimed.id === 1) throw new Error("smtp down");
      },
      countRecipients: async () => 0,
    });

    const result = await runScheduledNotificationPass(NOW, deps);

    expect(delivered).toEqual([1, 2]);
    expect(calls).toEqual(["requeue:1:1"]);
    expect(result).toEqual({ delivered: 1, failed: 0, requeued: 1 });
  });

  it("marks a thrown delivery failed when recipient rows already exist, and continues", async () => {
    const { deps, calls } = harness({
      listDue: async () => [row({ id: 7 }), row({ id: 8 })],
      deliver: async (claimed) => {
        if (claimed.id === 7) throw new Error("status update failed after insert");
      },
      countRecipients: async (id) => (id === 7 ? 12 : 0),
    });

    const result = await runScheduledNotificationPass(NOW, deps);

    expect(calls).toEqual(["fail:7"]);
    expect(result).toEqual({ delivered: 1, failed: 1, requeued: 0 });
  });

  it("keeps going when recording the failure also throws", async () => {
    const { deps } = harness({
      listDue: async () => [row({ id: 3 }), row({ id: 4 })],
      deliver: async (claimed) => {
        if (claimed.id === 3) throw new Error("boom");
      },
      markFailed: async () => {
        throw new Error("db down");
      },
      countRecipients: async () => 2,
    });

    const result = await runScheduledNotificationPass(NOW, deps);
    expect(result).toEqual({ delivered: 1, failed: 0, requeued: 0 });
  });

  it("stops requeueing after the retry budget and does not deliver again", () => {
    const decision = decideClaimFailure({
      recipientCount: 0,
      deliveryStats: { totalRecipients: 4, claimRecoveries: MAX_CLAIM_RECOVERIES },
    });
    expect(decision.outcome).toBe("fail");
    expect(decision.reason).toBe("retry_limit");
    expect(decision.deliveryStats.totalRecipients).toBe(4);
    expect(decision.deliveryStats.claimRecoveries).toBe(MAX_CLAIM_RECOVERIES);
  });

  it("requeues a swallowed failure when the row is failed and nobody was notified", async () => {
    const { deps, calls } = harness({
      listDue: async () => [row({ id: 11, deliveryStats: { totalRecipients: 56 } }), row({ id: 12 })],
      deliver: async () => {
        // processNotification catches, sets failed, and does not throw.
      },
      readStatus: async (id) => (id === 11 ? "failed" : "sent"),
      countRecipients: async (id) => (id === 11 ? 0 : 0),
    });

    const result = await runScheduledNotificationPass(NOW, deps);

    expect(calls).toEqual(["requeue:11:1"]);
    expect(result).toEqual({ delivered: 1, failed: 0, requeued: 1 });
  });

  it("counts a swallowed failure as failed when recipient rows already exist", async () => {
    const { deps, calls } = harness({
      listDue: async () => [row({ id: 13 })],
      readStatus: async () => "failed",
      countRecipients: async () => 8,
    });

    const result = await runScheduledNotificationPass(NOW, deps);

    expect(calls).toEqual(["deliver", "fail:13"]);
    expect(result).toEqual({ delivered: 0, failed: 1, requeued: 0 });
  });

  it("does not requeue a swallowed failure that already used the retry budget", async () => {
    const { deps, calls } = harness({
      listDue: async () => [row({ id: 14 })],
      claim: async (id) =>
        row({ id, deliveryStats: { totalRecipients: 4, claimRecoveries: MAX_CLAIM_RECOVERIES } }),
      readStatus: async () => "failed",
      countRecipients: async () => 0,
    });

    const result = await runScheduledNotificationPass(NOW, deps);

    expect(calls).toEqual(["deliver", "fail:14"]);
    expect(result.delivered).toBe(0);
    expect(result.requeued).toBe(0);
  });

  it("does not count a delivery as delivered when the status read fails", async () => {
    const { deps, calls } = harness({
      listDue: async () => [row({ id: 15 })],
      readStatus: async () => {
        throw new Error("read failed");
      },
    });

    const result = await runScheduledNotificationPass(NOW, deps);

    expect(calls).toEqual(["deliver"]);
    expect(result).toEqual({ delivered: 0, failed: 0, requeued: 0 });
  });

  it("fails closed when the recipient lookup throws, so a partial send is not repeated", async () => {
    const { deps, calls } = harness({
      listDue: async () => [row({ id: 9, deliveryStats: { totalRecipients: 56 } })],
      deliver: async () => {
        throw new Error("worker crashed after inserts");
      },
      countRecipients: async () => {
        throw new Error("connection reset");
      },
    });

    const result = await runScheduledNotificationPass(NOW, deps);
    expect(calls).toEqual(["fail:9"]);
    expect(result.requeued).toBe(0);
    expect(result.failed).toBe(1);
  });
});

describe("stuck sending recovery", () => {
  const stuckAt = new Date(NOW.getTime() - SENDING_STUCK_AFTER_MS - 60_000);

  it("requeues a stuck row with no recipients and does not deliver it on this pass", async () => {
    const { deps, calls } = harness({
      listStuckSending: async () => [
        row({ id: 20, updatedAt: stuckAt, deliveryStats: { totalRecipients: 56, claimRecoveries: 1 } }),
      ],
      countRecipients: async () => 0,
    });

    const result = await runScheduledNotificationPass(NOW, deps);

    expect(calls).toEqual(["requeue:20:2"]);
    expect(calls.some((call) => call === "deliver")).toBe(false);
    expect(result).toEqual({ delivered: 0, failed: 0, requeued: 1 });
  });

  it("marks a stuck row failed when anyone already has a recipient row, without delivering", async () => {
    const decision = decideStuckSending({
      updatedAt: stuckAt,
      now: NOW,
      recipientCount: 3,
      deliveryStats: { totalRecipients: 56 },
    });
    expect(decision.outcome).toBe("fail");
    expect(decision.reason).toBe("recipients_already_created");

    const { deps, calls } = harness({
      listStuckSending: async () => [row({ id: 21, updatedAt: stuckAt })],
      countRecipients: async () => 3,
    });
    const result = await runScheduledNotificationPass(NOW, deps);
    expect(calls).toEqual(["fail:21"]);
    expect(result.delivered).toBe(0);
  });

  it("leaves a sending row that is still inside the timeout", () => {
    const decision = decideStuckSending({
      updatedAt: new Date(NOW.getTime() - SENDING_STUCK_AFTER_MS + 1000),
      now: NOW,
      recipientCount: 0,
      deliveryStats: {},
    });
    expect(decision.outcome).toBe("leave");
  });

  it("does not recover a fresh sending row even if the query returns it", async () => {
    const { deps, calls } = harness({
      listStuckSending: async () => [row({ id: 22, updatedAt: NOW })],
      countRecipients: async () => 0,
    });
    const result = await runScheduledNotificationPass(NOW, deps);
    expect(calls).toEqual([]);
    expect(result).toEqual({ delivered: 0, failed: 0, requeued: 0 });
  });

  it("marks a stuck row failed when the recipient count is unknown", () => {
    const decision = decideStuckSending({
      updatedAt: stuckAt,
      now: NOW,
      recipientCount: null,
      deliveryStats: { claimRecoveries: 0 },
    });
    expect(decision.outcome).toBe("fail");
    expect(decision.reason).toBe("recipient_count_unknown");
  });
});
