/**
 * Payment-Flow Health Monitor
 * ----------------------------
 * Aggregates live autopay / payment-plan health signals into a single snapshot,
 * performs SAFE auto-heal of the documented double-charge sync gap, and routes
 * warning/critical results to in-app admin notifications, the error_logs table,
 * and an optional outbound webhook (consumed by a Cursor webhook Automation that
 * investigates root cause and opens a fix PR).
 *
 * Design constraints (see asa-payment-patterns):
 *  - NEVER charge a card here. The only mutation is cancelling stale
 *    pending/overdue scheduled_payments for enrollments whose effective balance
 *    is already <= 0 (a missed charge is recoverable; a double-charge is not).
 *  - All amounts in cents. Outbound payloads carry counts/tiers only — no PII.
 *  - Reuses the existing severity classifiers in `autopay-observability.ts` so
 *    dashboards and alerts stay aligned with the rest of the autopay subsystem.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { scheduledPayments, programEnrollments } from "@shared/schema";
import { storage } from "../storage";
import {
  AUTOPAY_PROCESSING_STUCK_MINUTES,
  classifyProcessingBacklogSeverity,
  classifyRetryExhaustedBatchSeverity,
  type AutoPayAlertTier,
} from "./autopay-observability";
import { AUTOPAY_MAX_RETRY_ATTEMPTS } from "./autopay-policy";
import {
  findStuckParentManualInstallments,
  releaseAllStuckParentManualInstallments,
  PARENT_MANUAL_STUCK_MINUTES,
} from "../lib/stuck-parent-manual-installments";
import { errorNotificationService } from "./error-notification";

/** Look-back window for "recent" failed/error signals. */
const RECENT_WINDOW_MINUTES = 24 * 60;

/** Spike window for payment error_logs. */
const PAYMENT_ERROR_SPIKE_WINDOW_MINUTES = 60;

/** Hard cap on auto-heal cancellations per run (defensive — keeps one bad run bounded). */
const MAX_AUTO_HEAL_PER_RUN = 200;

const TIER_RANK: Record<AutoPayAlertTier, number> = { ok: 0, warning: 1, critical: 2 };

function maxTier(...tiers: AutoPayAlertTier[]): AutoPayAlertTier {
  return tiers.reduce<AutoPayAlertTier>(
    (acc, t) => (TIER_RANK[t] > TIER_RANK[acc] ? t : acc),
    "ok",
  );
}

/** Count-based spike classifier for bounded payment-error signal. */
function classifyCountSeverity(count: number, warnAt: number, criticalAt: number): AutoPayAlertTier {
  const n = Math.max(0, Math.floor(Number(count)));
  if (n >= criticalAt) return "critical";
  if (n >= warnAt) return "warning";
  return "ok";
}

export interface PaymentFlowHealthSignal {
  key:
    | "stuck_processing"
    | "stuck_parent_manual"
    | "retry_exhausted"
    | "balance_sync_gap"
    | "payment_error_spike"
    | "installment_not_available_spike";
  tier: AutoPayAlertTier;
  count: number;
  detail: string;
}

export interface PaymentFlowHealthSnapshot {
  generatedAt: string;
  overallTier: AutoPayAlertTier;
  signals: PaymentFlowHealthSignal[];
  autoHeal: {
    eligible: number;
    cancelled: number;
    capped: boolean;
    errors: number;
    parentManualEligible: number;
    parentManualReleased: number;
    parentManualErrors: number;
  };
  notified: boolean;
  webhookDispatched: boolean;
  durationMs: number;
}

let lastSnapshot: PaymentFlowHealthSnapshot | null = null;

/** Latest snapshot for the admin health endpoint (null until the first run). */
export function getLastPaymentFlowSnapshot(): PaymentFlowHealthSnapshot | null {
  return lastSnapshot;
}

interface StaleHealRow {
  id: number;
  enrollmentId: number;
  amount: number;
}

/**
 * Stale pending/overdue installments for enrollments whose effective balance is
 * already <= 0. These are the documented double-charge risk: scheduler may charge
 * a fully-paid enrollment. `status IN ('pending','overdue')` is expressed in raw
 * SQL because `overdue` is set at runtime by the reminder job and is not in the
 * Drizzle status enum.
 */
async function findStaleZeroBalanceInstallments(): Promise<StaleHealRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: scheduledPayments.id,
      enrollmentId: scheduledPayments.enrollmentId,
      amount: scheduledPayments.amount,
    })
    .from(scheduledPayments)
    .innerJoin(programEnrollments, sql`${programEnrollments.id} = ${scheduledPayments.enrollmentId}`)
    .where(
      sql`${scheduledPayments.status} IN ('pending','overdue')
        AND GREATEST(0, ${programEnrollments.totalCost} - ${programEnrollments.totalPaid} - COALESCE(${programEnrollments.compAmountCents}, 0)) <= 0
        AND ${programEnrollments.status} NOT IN ('cancelled','waitlist','location_wishlist','withdrawn','failed')`,
    )
    .limit(MAX_AUTO_HEAL_PER_RUN + 1);
  return rows as StaleHealRow[];
}

async function countStuckProcessing(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - AUTOPAY_PROCESSING_STUCK_MINUTES * 60_000);
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(scheduledPayments)
    .where(sql`${scheduledPayments.status} = 'processing' AND ${scheduledPayments.updatedAt} < ${cutoff}`);
  return Number(row?.n ?? 0);
}

async function countRecentRetryExhausted(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - RECENT_WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(scheduledPayments)
    .where(
      sql`${scheduledPayments.status} = 'failed'
        AND ${scheduledPayments.retryCount} >= ${AUTOPAY_MAX_RETRY_ATTEMPTS}
        AND ${scheduledPayments.updatedAt} >= ${cutoff}`,
    );
  return Number(row?.n ?? 0);
}

async function countRecentPaymentErrors(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - PAYMENT_ERROR_SPIKE_WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(sql`error_logs`)
    .where(
      sql`error_type = 'payment' AND severity IN ('high','critical') AND created_at >= ${cutoff}`,
    );
  return Number(row?.n ?? 0);
}

async function countRecentInstallmentNotAvailable(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - PAYMENT_ERROR_SPIKE_WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(sql`error_logs`)
    .where(
      sql`error_type = 'payment'
        AND error_code = 'INSTALLMENT_NOT_AVAILABLE'
        AND created_at >= ${cutoff}`,
    );
  return Number(row?.n ?? 0);
}

/** Cancel stale pending/overdue installments for already-paid enrollments. */
async function autoHealStaleInstallments(rows: StaleHealRow[]): Promise<{
  cancelled: number;
  errors: number;
}> {
  let cancelled = 0;
  let errors = 0;
  const toHeal = rows.slice(0, MAX_AUTO_HEAL_PER_RUN);
  for (const row of toHeal) {
    try {
      await storage.updateScheduledPaymentStatus(row.id, "cancelled");
      cancelled += 1;
      console.log(
        `[payment-flow-monitor] auto-heal: cancelled scheduled_payment ${row.id} ` +
          `(enrollment ${row.enrollmentId}, ${row.amount}c) — enrollment effective balance is $0`,
      );
    } catch (err) {
      errors += 1;
      console.error(`[payment-flow-monitor] auto-heal failed for scheduled_payment ${row.id}:`, err);
    }
  }
  return { cancelled, errors };
}

async function notifyAdmins(snapshot: PaymentFlowHealthSnapshot): Promise<boolean> {
  try {
    const allUsers = await storage.getAllUsers();
    const adminUserIds = new Set<number>();
    for (const user of allUsers) {
      if (user.role === "admin" || user.role === "schoolAdmin" || user.role === "superAdmin") {
        adminUserIds.add(user.id);
        continue;
      }
      const roles = await storage.getUserRolesByUserId(user.id);
      if (roles.some((ur) => ur.role === "admin" || ur.role === "schoolAdmin" || ur.role === "superAdmin")) {
        adminUserIds.add(user.id);
      }
    }
    const adminUsers = allUsers.filter((u) => adminUserIds.has(u.id));
    if (adminUsers.length === 0) {
      console.warn("[payment-flow-monitor] no admin users found to notify");
      return false;
    }

    const senderId = adminUsers[0].id;
    const flagged = snapshot.signals.filter((s) => s.tier !== "ok");
    const summary = flagged.map((s) => `${s.key}: ${s.detail}`).join(" | ");
    const healLine = snapshot.autoHeal.cancelled > 0
      ? ` Auto-healed ${snapshot.autoHeal.cancelled} stale installment(s).`
      : "";
    const parentManualLine = snapshot.autoHeal.parentManualReleased > 0
      ? ` Released ${snapshot.autoHeal.parentManualReleased} stuck parent Pay Now installment(s).`
      : "";

    const notification = await storage.createNotification({
      senderId,
      type: "in_app",
      priority: snapshot.overallTier === "critical" ? "high" : "normal",
      subject: `Payment flow health: ${snapshot.overallTier.toUpperCase()}`,
      content: `${summary}.${healLine}${parentManualLine}`.slice(0, 1000),
      targetType: "role",
      targetData: { role: "schoolAdmin", overallTier: snapshot.overallTier },
      scheduledFor: null,
    });

    for (const admin of adminUsers) {
      try {
        await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId: admin.id,
          deliveryType: "in_app",
          status: "pending",
        });
      } catch (recipientErr) {
        console.error(`[payment-flow-monitor] failed to create recipient for admin ${admin.id}:`, recipientErr);
      }
    }
    return true;
  } catch (err) {
    console.error("[payment-flow-monitor] notifyAdmins failed:", err);
    return false;
  }
}

/**
 * POST a bounded, PII-free alert to the configured webhook. Consumed by a Cursor
 * webhook Automation that investigates root cause and may open a fix PR.
 */
async function dispatchAlertWebhook(snapshot: PaymentFlowHealthSnapshot): Promise<boolean> {
  const url = process.env.PAYMENT_MONITOR_ALERT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.PAYMENT_MONITOR_ALERT_WEBHOOK_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.PAYMENT_MONITOR_ALERT_WEBHOOK_TOKEN}`;
    }
    const body = {
      source: "asa-payment-flow-monitor",
      generatedAt: snapshot.generatedAt,
      overallTier: snapshot.overallTier,
      signals: snapshot.signals.map((s) => ({ key: s.key, tier: s.tier, count: s.count, detail: s.detail })),
      autoHeal: snapshot.autoHeal,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`[payment-flow-monitor] alert webhook returned ${res.status}`);
        return false;
      }
      return true;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("[payment-flow-monitor] alert webhook dispatch failed:", err);
    return false;
  }
}

export interface RunPaymentFlowMonitorOptions {
  /** Cancel stale installments for already-paid enrollments. Default true. */
  autoHeal?: boolean;
  /** Send admin notifications + webhook on warning/critical. Default true. */
  notify?: boolean;
}

/**
 * Run a full health sweep. Always returns a snapshot (never throws); individual
 * signal/heal/notify failures are logged and degrade gracefully.
 */
export async function runPaymentFlowMonitor(
  options: RunPaymentFlowMonitorOptions = {},
): Promise<PaymentFlowHealthSnapshot> {
  const { autoHeal = true, notify = true } = options;
  const startedAt = Date.now();

  let stuck = 0;
  let retryExhausted = 0;
  let paymentErrors = 0;
  let installmentNotAvailable = 0;
  let staleRows: StaleHealRow[] = [];
  let stuckParentManual = 0;

  try {
    const stuckParentManualRows = await findStuckParentManualInstallments().catch((e) => {
      console.error("[payment-flow-monitor] stuck-parent-manual query failed:", e);
      return [];
    });
    stuckParentManual = stuckParentManualRows.length;

    [stuck, retryExhausted, paymentErrors, installmentNotAvailable, staleRows] = await Promise.all([
      countStuckProcessing().catch((e) => {
        console.error("[payment-flow-monitor] stuck-processing query failed:", e);
        return 0;
      }),
      countRecentRetryExhausted().catch((e) => {
        console.error("[payment-flow-monitor] retry-exhausted query failed:", e);
        return 0;
      }),
      countRecentPaymentErrors().catch((e) => {
        console.error("[payment-flow-monitor] payment-error query failed:", e);
        return 0;
      }),
      countRecentInstallmentNotAvailable().catch((e) => {
        console.error("[payment-flow-monitor] installment-not-available query failed:", e);
        return 0;
      }),
      findStaleZeroBalanceInstallments().catch((e) => {
        console.error("[payment-flow-monitor] sync-gap query failed:", e);
        return [] as StaleHealRow[];
      }),
    ]);
  } catch (err) {
    console.error("[payment-flow-monitor] signal collection failed:", err);
  }

  const eligibleHeal = staleRows.length;
  const cappedHeal = eligibleHeal > MAX_AUTO_HEAL_PER_RUN;

  const stuckTier = classifyProcessingBacklogSeverity(stuck);
  const stuckParentManualTier = classifyCountSeverity(stuckParentManual, 1, 5);
  const retryTier = classifyRetryExhaustedBatchSeverity(retryExhausted);
  const errorTier = classifyCountSeverity(paymentErrors, 3, 10);
  const installmentNotAvailableTier = classifyCountSeverity(installmentNotAvailable, 2, 8);
  // Even one fully-paid enrollment with an open installment risks a double-charge.
  const syncGapTier = classifyCountSeverity(eligibleHeal, 1, 10);

  const heal = autoHeal && eligibleHeal > 0
    ? await autoHealStaleInstallments(staleRows)
    : { cancelled: 0, errors: 0 };

  const parentManualHeal =
    autoHeal && stuckParentManual > 0
      ? await releaseAllStuckParentManualInstallments({ maxRows: MAX_AUTO_HEAL_PER_RUN }).catch((e) => {
          console.error("[payment-flow-monitor] parent-manual auto-heal failed:", e);
          return { released: 0, skipped: 0, errors: stuckParentManual, rows: [] };
        })
      : { released: 0, skipped: 0, errors: 0, rows: [] };

  if (parentManualHeal.released > 0) {
    for (const row of parentManualHeal.rows.filter((r) => r.action === "released")) {
      console.log(
        `[payment-flow-monitor] auto-heal: released stuck parent_manual scheduled_payment ${row.id} (${row.parentEmail})`,
      );
    }
  }

  const signals: PaymentFlowHealthSignal[] = [
    {
      key: "stuck_processing",
      tier: stuckTier,
      count: stuck,
      detail: `${stuck} installment(s) stuck in 'processing' > ${AUTOPAY_PROCESSING_STUCK_MINUTES}m`,
    },
    {
      key: "stuck_parent_manual",
      tier: stuckParentManualTier,
      count: stuckParentManual,
      detail: `${stuckParentManual} parent Pay Now installment(s) stuck (processing > ${PARENT_MANUAL_STUCK_MINUTES}m or failed + stale PI)`,
    },
    {
      key: "retry_exhausted",
      tier: retryTier,
      count: retryExhausted,
      detail: `${retryExhausted} installment(s) failed at retry cap in last ${RECENT_WINDOW_MINUTES / 60}h`,
    },
    {
      key: "balance_sync_gap",
      tier: syncGapTier,
      count: eligibleHeal,
      detail: `${eligibleHeal} open installment(s) on $0-balance enrollments (double-charge risk)`,
    },
    {
      key: "payment_error_spike",
      tier: errorTier,
      count: paymentErrors,
      detail: `${paymentErrors} high/critical payment error(s) in last ${PAYMENT_ERROR_SPIKE_WINDOW_MINUTES}m`,
    },
    {
      key: "installment_not_available_spike",
      tier: installmentNotAvailableTier,
      count: installmentNotAvailable,
      detail: `${installmentNotAvailable} INSTALLMENT_NOT_AVAILABLE error(s) in last ${PAYMENT_ERROR_SPIKE_WINDOW_MINUTES}m`,
    },
  ];

  const overallTier = maxTier(...signals.map((s) => s.tier));

  const snapshot: PaymentFlowHealthSnapshot = {
    generatedAt: new Date().toISOString(),
    overallTier,
    signals,
    autoHeal: {
      eligible: eligibleHeal,
      cancelled: heal.cancelled,
      capped: cappedHeal,
      errors: heal.errors,
      parentManualEligible: stuckParentManual,
      parentManualReleased: parentManualHeal.released,
      parentManualErrors: parentManualHeal.errors,
    },
    notified: false,
    webhookDispatched: false,
    durationMs: Date.now() - startedAt,
  };

  if (overallTier !== "ok") {
    try {
      const errorLog = await storage.createErrorLog({
        errorType: "payment",
        severity: overallTier === "critical" ? "high" : "medium",
        message: `Payment-flow monitor: ${overallTier.toUpperCase()} — ${signals
          .filter((s) => s.tier !== "ok")
          .map((s) => s.detail)
          .join("; ")}`,
        route: "/scheduled-job/payment-flow-monitor",
        method: "CRON",
        userEmail: null,
        schoolId: null,
        stackTrace: null,
        metadata: {
          signals,
          autoHeal: snapshot.autoHeal,
          healthEndpoint: "/api/admin/payment-health",
        },
        notificationSent: false,
      } as any);
      await errorNotificationService.sendImmediateNotification(errorLog);
    } catch (logErr) {
      console.error("[payment-flow-monitor] failed to write error_log:", logErr);
    }

    if (notify) {
      snapshot.notified = await notifyAdmins(snapshot);
      snapshot.webhookDispatched = await dispatchAlertWebhook(snapshot);
    }
  }

  lastSnapshot = snapshot;

  console.log(
    `[payment-flow-monitor] tier=${overallTier} ` +
      `stuck=${stuck} parentManual=${stuckParentManual} retryCap=${retryExhausted} syncGap=${eligibleHeal} ` +
      `errors=${paymentErrors} ina=${installmentNotAvailable} healed=${heal.cancelled} parentManualReleased=${parentManualHeal.released} (${snapshot.durationMs}ms)`,
  );

  return snapshot;
}
