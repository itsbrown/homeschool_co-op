/**
 * Pure decisions for the scheduled-notification worker.
 *
 * A claimed row is `sending`. If delivery throws, or a row stays `sending`
 * longer than SENDING_STUCK_AFTER_MS, we either put it back to `scheduled`
 * or mark it `failed`. Retry state lives in `delivery_stats.claimRecoveries`
 * (jsonb already on the row — no new column).
 *
 * Double-send rule: never call delivery again once any notification_recipients
 * row exists. In-app rows are inserted as delivered before email/SMS, so a
 * second pass would notify those people twice. Zero recipient rows means
 * nothing was handed out, so a bounded requeue is safe. An unknown count
 * fails closed (mark failed, do not deliver).
 */

export const SENDING_STUCK_AFTER_MS = 15 * 60 * 1000;
export const MAX_CLAIM_RECOVERIES = 3;

export type ClaimSettlement = "requeue" | "fail" | "leave";

export type ClaimDecision = {
  outcome: ClaimSettlement;
  deliveryStats: Record<string, unknown>;
  reason: string;
};

export function claimRecoveryCount(deliveryStats: unknown): number {
  if (!deliveryStats || typeof deliveryStats !== "object" || Array.isArray(deliveryStats)) {
    return 0;
  }
  const raw = (deliveryStats as { claimRecoveries?: unknown }).claimRecoveries;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

function statsRecord(deliveryStats: unknown): Record<string, unknown> {
  if (!deliveryStats || typeof deliveryStats !== "object" || Array.isArray(deliveryStats)) {
    return {};
  }
  return { ...(deliveryStats as Record<string, unknown>) };
}

/**
 * What to do with a row whose delivery just threw, or that has already been
 * `sending` longer than the stuck timeout. `recipientCount === null` means
 * the lookup failed — treat that as "maybe already sent".
 */
export function decideClaimFailure(input: {
  recipientCount: number | null;
  deliveryStats: unknown;
}): ClaimDecision {
  const count = claimRecoveryCount(input.deliveryStats);
  const base = statsRecord(input.deliveryStats);

  if (input.recipientCount === null || input.recipientCount > 0) {
    const reason = input.recipientCount === null ? "recipient_count_unknown" : "recipients_already_created";
    return {
      outcome: "fail",
      reason,
      deliveryStats: { ...base, claimRecoveries: count, lastClaimFailure: reason },
    };
  }

  if (count >= MAX_CLAIM_RECOVERIES) {
    return {
      outcome: "fail",
      reason: "retry_limit",
      deliveryStats: { ...base, claimRecoveries: count, lastClaimFailure: "retry_limit" },
    };
  }

  return {
    outcome: "requeue",
    reason: "no_recipients",
    deliveryStats: { ...base, claimRecoveries: count + 1, lastClaimFailure: "no_recipients" },
  };
}

export function decideStuckSending(input: {
  updatedAt: Date | string | null;
  now: Date;
  recipientCount: number | null;
  deliveryStats: unknown;
}): ClaimDecision {
  const updated = input.updatedAt instanceof Date ? input.updatedAt : input.updatedAt ? new Date(input.updatedAt) : null;
  const updatedMs = updated && !Number.isNaN(updated.getTime()) ? updated.getTime() : null;
  if (updatedMs === null || input.now.getTime() - updatedMs < SENDING_STUCK_AFTER_MS) {
    return {
      outcome: "leave",
      reason: "still_fresh",
      deliveryStats: statsRecord(input.deliveryStats),
    };
  }
  return decideClaimFailure(input);
}

export type ScheduledPassRow = {
  id: number;
  deliveryStats: unknown;
  updatedAt: Date | string | null;
};

export type ScheduledPassDeps = {
  listDue: (now: Date) => Promise<ScheduledPassRow[]>;
  claim: (id: number, now: Date) => Promise<ScheduledPassRow | null>;
  deliver: (row: ScheduledPassRow) => Promise<void>;
  countRecipients: (id: number) => Promise<number>;
  markFailed: (id: number, deliveryStats: Record<string, unknown>, now: Date) => Promise<void>;
  requeue: (id: number, deliveryStats: Record<string, unknown>, now: Date) => Promise<void>;
  listStuckSending: (cutoff: Date) => Promise<ScheduledPassRow[]>;
};

export type ScheduledPassResult = {
  delivered: number;
  failed: number;
  requeued: number;
};

async function settleClaimFailure(
  row: ScheduledPassRow,
  deps: ScheduledPassDeps,
  now: Date,
): Promise<"fail" | "requeue"> {
  let recipientCount: number | null;
  try {
    recipientCount = await deps.countRecipients(row.id);
  } catch (error) {
    console.error(
      `[ScheduledNotifications] Could not count recipients for notification ${row.id}; marking failed so it is not sent twice:`,
      error,
    );
    recipientCount = null;
  }

  const decision = decideClaimFailure({
    recipientCount,
    deliveryStats: row.deliveryStats,
  });
  if (decision.outcome === "requeue") {
    await deps.requeue(row.id, decision.deliveryStats, now);
    return "requeue";
  }
  await deps.markFailed(row.id, decision.deliveryStats, now);
  return "fail";
}

/**
 * One worker tick. A throw from one row does not stop the rest of the batch.
 * Stuck `sending` rows are settled here and are not delivered in this pass —
 * a requeue is picked up on a later tick, after we know the previous attempt
 * did not create recipient rows.
 */
export async function runScheduledNotificationPass(
  now: Date,
  deps: ScheduledPassDeps,
): Promise<ScheduledPassResult> {
  const result: ScheduledPassResult = { delivered: 0, failed: 0, requeued: 0 };

  let due: ScheduledPassRow[] = [];
  try {
    due = await deps.listDue(now);
  } catch (error) {
    console.error("[ScheduledNotifications] Could not list due notifications:", error);
  }

  for (const row of due) {
    let claimed: ScheduledPassRow | null = null;
    try {
      claimed = await deps.claim(row.id, now);
    } catch (error) {
      console.error(`[ScheduledNotifications] Could not claim notification ${row.id}:`, error);
      continue;
    }
    if (!claimed) continue;

    try {
      await deps.deliver(claimed);
      result.delivered += 1;
    } catch (error) {
      console.error(`[ScheduledNotifications] Delivery failed for notification ${claimed.id}:`, error);
      try {
        const settled = await settleClaimFailure(claimed, deps, now);
        result[settled === "requeue" ? "requeued" : "failed"] += 1;
      } catch (settleError) {
        console.error(
          `[ScheduledNotifications] Could not record failure for notification ${claimed.id}; leaving it for stuck-sending recovery:`,
          settleError,
        );
      }
    }
  }

  const cutoff = new Date(now.getTime() - SENDING_STUCK_AFTER_MS);
  let stuck: ScheduledPassRow[] = [];
  try {
    stuck = await deps.listStuckSending(cutoff);
  } catch (error) {
    console.error("[ScheduledNotifications] Could not list stuck sending notifications:", error);
    return result;
  }

  for (const row of stuck) {
    const age = decideStuckSending({
      updatedAt: row.updatedAt,
      now,
      recipientCount: 0,
      deliveryStats: row.deliveryStats,
    });
    if (age.outcome === "leave") continue;

    try {
      const settled = await settleClaimFailure(row, deps, now);
      result[settled === "requeue" ? "requeued" : "failed"] += 1;
    } catch (error) {
      console.error(
        `[ScheduledNotifications] Could not recover stuck notification ${row.id}:`,
        error,
      );
    }
  }

  return result;
}
