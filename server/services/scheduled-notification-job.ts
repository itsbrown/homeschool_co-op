/**
 * Delivers notifications whose `scheduled_for` time has arrived.
 *
 * Runs in-process with the other background jobs (`server/index.ts`,
 * `ENABLE_BACKGROUND_JOBS=true` on the production VM). There is no separate
 * Replit cron. A one-minute tick is enough for "send at 8:00 AM".
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { notifications } from "@shared/schema";
import { getDb } from "../db";
import { deliverNotification } from "../api/notifications";

const INTERVAL_MS = 60_000;
const BATCH_LIMIT = 100;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export async function deliverDueScheduledNotifications(
  now: Date = new Date(),
): Promise<{ delivered: number }> {
  const db = await getDb();
  const due = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "scheduled"), lte(notifications.scheduledFor, now)))
    .orderBy(asc(notifications.scheduledFor))
    .limit(BATCH_LIMIT);

  let delivered = 0;
  for (const row of due) {
    const claimed = await db
      .update(notifications)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(notifications.id, row.id), eq(notifications.status, "scheduled")))
      .returning();
    if (claimed.length === 0) continue;

    await deliverNotification(claimed[0]);
    delivered += 1;
  }

  if (delivered > 0) {
    console.log(`[ScheduledNotifications] Delivered ${delivered} due notification(s)`);
  }
  return { delivered };
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

  console.log("[ScheduledNotifications] Starting (every 60s)");
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
