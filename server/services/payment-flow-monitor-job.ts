/**
 * Payment-Flow Health Monitor Job
 * --------------------------------
 * Singleton background scheduler that runs `runPaymentFlowMonitor()` on a fixed
 * cadence. Like the other money-path jobs, it refuses to start unless
 * AUTO_PAY_SINGLE_INSTANCE=true so autoscaled web replicas never run it (which
 * would duplicate auto-heal writes / alerts).
 */

import { runPaymentFlowMonitor } from "./payment-flow-monitor";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_INTERVAL_MS = 60 * 1000;
const INITIAL_DELAY_MS = 90 * 1000; // let startup settle before first sweep

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let initialTimeout: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

function resolveIntervalMs(): number {
  const raw = process.env.PAYMENT_MONITOR_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MS) {
    console.warn(
      `[PaymentFlowMonitorJob] PAYMENT_MONITOR_INTERVAL_MS='${raw}' ignored (must be >= ${MIN_INTERVAL_MS}); using default.`,
    );
    return DEFAULT_INTERVAL_MS;
  }
  return parsed;
}

async function tick(): Promise<void> {
  if (isRunning) {
    console.log("[PaymentFlowMonitorJob] previous sweep still running, skipping...");
    return;
  }
  isRunning = true;
  try {
    await runPaymentFlowMonitor({ autoHeal: true, notify: true });
  } catch (err) {
    console.error("[PaymentFlowMonitorJob] sweep failed:", err);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the recurring monitor. Requires AUTO_PAY_SINGLE_INSTANCE=true (Reserved
 * VM / single worker) — mirrors startAutoPayJob/startReconciliationJob guards.
 */
export function startPaymentFlowMonitorJob(): void {
  if (process.env.AUTO_PAY_SINGLE_INSTANCE !== "true") {
    console.error(
      "CRITICAL: [PaymentFlowMonitorJob] blocked — requires AUTO_PAY_SINGLE_INSTANCE=true (Reserved VM only). Monitor will NOT start.",
    );
    return;
  }
  if (monitorInterval || initialTimeout) {
    console.log("[PaymentFlowMonitorJob] job already scheduled");
    return;
  }

  const intervalMs = resolveIntervalMs();
  console.log(
    `[PaymentFlowMonitorJob] scheduled every ${(intervalMs / 60000).toFixed(1)}m (first run in ${(INITIAL_DELAY_MS / 1000).toFixed(0)}s)`,
  );

  initialTimeout = setTimeout(() => {
    initialTimeout = null;
    void tick();
    monitorInterval = setInterval(() => void tick(), intervalMs);
  }, INITIAL_DELAY_MS);
}

export function stopPaymentFlowMonitorJob(): void {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[PaymentFlowMonitorJob] stopped");
  }
}
