/**
 * Delivers notifications whose `scheduled_for` time has arrived.
 *
 * Runs in-process with the other background jobs (`server/index.ts`,
 * `ENABLE_BACKGROUND_JOBS=true` on the production VM). There is no separate
 * Replit cron. A one-minute tick is enough for "send at 8:00 AM".
 *
 * Claimed rows (`sending`) that throw, or that sit in `sending` for 15
 * minutes, are requeued only when no recipient rows exist. Otherwise they
 * are marked failed so people who already have an in-app row are not sent
 * a second copy. Retry count is `delivery_stats.claimRecoveries`.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { notificationRecipients, notifications } from "@shared/schema";
import {
  SENDING_STUCK_AFTER_MS,
  runScheduledNotificationPass,
  type ScheduledPassResult,
} from "@shared/scheduled-notification-recovery";
import { getDb } from "../db";
import { deliverNotification } from "../api/notifications";

const INTERVAL_MS = 60_000;
const BATCH_LIMIT = 100;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export async function deliverDueScheduledNotifications(
  now: Date = new Date(),
): Promise<ScheduledPassResult> {
  const db = await getDb();
  const result = await runScheduledNotificationPass(now, {
    listDue: async (at) =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.status, "scheduled"), lte(notifications.scheduledFor, at)))
        .orderBy(asc(notifications.scheduledFor))
        .limit(BATCH_LIMIT),

    claim: async (id, at) => {
      const claimed = await db
        .update(notifications)
        .set({ status: "sending", updatedAt: at })
        .where(and(eq(notifications.id, id), eq(notifications.status, "scheduled")))
        .returning();
      return claimed[0] ?? null;
    },

    deliver: (row) => deliverNotification(row),

    countRecipients: async (id) => {
      const found = await db
        .select({ id: notificationRecipients.id })
        .from(notificationRecipients)
        .where(eq(notificationRecipients.notificationId, id))
        .limit(1);
      return found.length;
    },

    markFailed: async (id, deliveryStats, at) => {
      await db
        .update(notifications)
        .set({ status: "failed", deliveryStats, updatedAt: at })
        .where(and(eq(notifications.id, id), eq(notifications.status, "sending")));
    },

    requeue: async (id, deliveryStats, at) => {
      await db
        .update(notifications)
        .set({ status: "scheduled", deliveryStats, updatedAt: at })
        .where(and(eq(notifications.id, id), eq(notifications.status, "sending")));
    },

    listStuckSending: async (cutoff) =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.status, "sending"), lte(notifications.updatedAt, cutoff)))
        .orderBy(asc(notifications.updatedAt))
        .limit(BATCH_LIMIT),
  });

  if (result.delivered > 0 || result.failed > 0 || result.requeued > 0) {
    console.log(
      `[ScheduledNotifications] delivered=${result.delivered} failed=${result.failed} requeued=${result.requeued}`,
    );
  }
  return result;
}

export function startScheduledNotificationJob(): void {
  if (timer) {
    console.log("[ScheduledNotifications] Scheduler already running");
    return;
  }

  const run = () => {
    if (ticking) return;
    ticking = true;
    deliverDueScheduledNotifications()
      .catch((err) => {
        console.error("[ScheduledNotifications] Tick failed:", err);
      })
      .finally(() => {
        ticking = false;
      });
  };

  console.log(
    `[ScheduledNotifications] Starting (every 60s, recover sending rows after ${SENDING_STUCK_AFTER_MS / 60000}m)`,
  );
  run();
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
}

export function stopScheduledNotificationJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  console.log("[ScheduledNotifications] Stopped");
}
