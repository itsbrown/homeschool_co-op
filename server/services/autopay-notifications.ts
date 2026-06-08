/**
 * Explicit AutoPay parent notifications (P1-B-06 / P1-B-07 slice).
 *
 * Dedupe: embed `AUTOPAY_DEDUPE:{type}:{scheduledPaymentId}:{dueDay}` in notification content and
 * skip if `storage.getNotificationsByUserId` already contains that token (replay-safe across process restarts
 * when notifications persist).
 */

import { storage } from "../storage";
import { AUTOPAY_METRIC_NOTIFICATIONS_TOTAL, buildAutoPayNotificationLabels } from "./autopay-observability";
import {
  groupReminderItemsByParent,
  sendConsolidatedFamilyPaymentReminderEmail,
  type FamilyReminderLineItem,
} from "../lib/consolidated-family-reminder";

export const AUTOPAY_PRECHARGE_WINDOW_HOURS = 20;

export type AutoPayNotificationType = "pre_charge" | "credit_covered_skip";

export type AutoPayNotifyResult = { sent: boolean; reason: string };

type PreChargeEmailCandidate = FamilyReminderLineItem & {
  parentEmail: string;
  parentId: number;
};

const preChargeEmailBatch: PreChargeEmailCandidate[] = [];

/** Queue pre-charge email line items; call flushPreChargeEmailBatch after the autopay scan. */
export function queuePreChargeEmailCandidate(candidate: PreChargeEmailCandidate): void {
  preChargeEmailBatch.push(candidate);
}

/** Send one consolidated pre-charge email per parent for queued items. */
export async function flushPreChargeEmailBatch(): Promise<void> {
  if (preChargeEmailBatch.length === 0) return;

  const batch = preChargeEmailBatch.splice(0, preChargeEmailBatch.length);
  const groups = groupReminderItemsByParent(batch);

  for (const group of groups.values()) {
    try {
      await sendConsolidatedFamilyPaymentReminderEmail({
        parentEmail: group[0]!.parentEmail,
        lineItems: group,
        daysUntilDue: 1,
        schoolName: group[0]!.schoolName,
      });
    } catch (e) {
      console.warn("[autopay-notifications] pre_charge consolidated email failed:", e);
    }
  }
}

/** @internal Test helper */
export function clearPreChargeEmailBatchForTests(): void {
  preChargeEmailBatch.length = 0;
}

function dedupeMarker(type: AutoPayNotificationType, scheduledPaymentId: number, dueAt: Date): string {
  const day = dueAt.toISOString().slice(0, 10);
  return `[[AUTOPAY_DEDUPE:${type}:${scheduledPaymentId}:${day}]]`;
}

async function hasExistingDedupe(parentId: number, marker: string): Promise<boolean> {
  try {
    const notes = await storage.getNotificationsByUserId(parentId);
    const needle = marker.replace(/\[\[|\]\]/g, "");
    return notes.some((n) => String(n.content ?? "").includes(needle));
  } catch {
    return false;
  }
}

function hoursUntilDue(dueAt: Date, now: Date): number {
  return (dueAt.getTime() - now.getTime()) / 3_600_000;
}

function logMetric(kind: AutoPayNotificationType, outcome: "sent" | "duplicate" | "skipped"): void {
  const labels = buildAutoPayNotificationLabels(kind, outcome);
  console.log(`[${AUTOPAY_METRIC_NOTIFICATIONS_TOTAL}]`, labels);
}

async function createParentInAppNotification(params: {
  parentId: number;
  subject: string;
  content: string;
}): Promise<void> {
  await storage.createNotification({
    senderId: 1,
    type: "in_app",
    priority: "normal",
    subject: params.subject,
    content: params.content,
    targetType: "individual",
    targetData: { userIds: [params.parentId] } as Record<string, unknown>,
    status: "pending",
  } as any);
}

/**
 * Heads-up before an AutoPay charge: inside `(0, AUTOPAY_PRECHARGE_WINDOW_HOURS]` hours of due time.
 */
export async function maybeEmitPreChargeNotification(params: {
  scheduledPaymentId: number;
  parentId: number;
  parentEmail: string;
  amountCents: number;
  dueAt: Date;
  childName?: string;
  className?: string;
  schoolName?: string;
  schoolId?: number;
  installmentNumber?: number;
  totalInstallments?: number;
  now?: Date;
}): Promise<AutoPayNotifyResult> {
  const now = params.now ?? new Date();
  const email = String(params.parentEmail ?? "").trim();
  if (!email) {
    return { sent: false, reason: "missing_email" };
  }

  const h = hoursUntilDue(params.dueAt, now);
  if (h <= 0 || h > AUTOPAY_PRECHARGE_WINDOW_HOURS) {
    return { sent: false, reason: "outside_window" };
  }

  const marker = dedupeMarker("pre_charge", params.scheduledPaymentId, params.dueAt);
  if (await hasExistingDedupe(params.parentId, marker)) {
    logMetric("pre_charge", "duplicate");
    return { sent: false, reason: "duplicate" };
  }

  const amount = `$${(params.amountCents / 100).toFixed(2)}`;
  const subject = `AutoPay charge coming soon — installment ${params.installmentNumber ?? "?"} of ${params.totalInstallments ?? "?"}`;
  const body = `${marker}\nYour scheduled payment of ${amount} will be charged automatically within about ${Math.ceil(h)} hours (due ${params.dueAt.toDateString()}). No action needed if your payment method is up to date.`;

  try {
    await createParentInAppNotification({
      parentId: params.parentId,
      subject,
      content: body,
    });
  } catch (e) {
    console.error("[autopay-notifications] pre_charge in_app failed:", e);
    return { sent: false, reason: "error" };
  }

  queuePreChargeEmailCandidate({
    parentEmail: email,
    parentId: params.parentId,
    scheduledPaymentId: params.scheduledPaymentId,
    childName: params.childName ?? "Student",
    className: params.className ?? "Class",
    amountCents: params.amountCents,
    dueDate: params.dueAt,
    schoolId: params.schoolId ?? 1,
    schoolName: params.schoolName ?? "American Seekers Academy",
  });

  logMetric("pre_charge", "sent");
  return { sent: true, reason: "sent" };
}

/**
 * Parent-visible notice when a due installment is satisfied without a new card charge (balance already cleared).
 */
export async function maybeEmitCreditCoveredSkipNotification(params: {
  scheduledPaymentId: number;
  parentId: number;
  parentEmail: string;
  amountCents: number;
  dueAt: Date;
  now?: Date;
}): Promise<AutoPayNotifyResult> {
  const email = String(params.parentEmail ?? "").trim();
  if (!email) {
    return { sent: false, reason: "missing_email" };
  }

  const marker = dedupeMarker("credit_covered_skip", params.scheduledPaymentId, params.dueAt);
  if (await hasExistingDedupe(params.parentId, marker)) {
    logMetric("credit_covered_skip", "duplicate");
    return { sent: false, reason: "duplicate" };
  }

  const amount = `$${(params.amountCents / 100).toFixed(2)}`;
  const subject = "Scheduled payment skipped — balance already covered";
  const body = `${marker}\nYour installment of ${amount} due ${params.dueAt.toDateString()} was skipped for automatic billing because your enrollment balance is already paid (credits or prior payments).`;

  try {
    await createParentInAppNotification({
      parentId: params.parentId,
      subject,
      content: body,
    });
  } catch (e) {
    console.error("[autopay-notifications] credit_covered in_app failed:", e);
    return { sent: false, reason: "error" };
  }

  logMetric("credit_covered_skip", "sent");
  return { sent: true, reason: "sent" };
}
