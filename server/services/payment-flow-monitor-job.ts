/**
 * Payment-Flow Health Monitor Job
 * --------------------------------
 * Singleton background scheduler that runs `runPaymentFlowMonitor()` on a fixed
 * cadence. Started from `server/index.ts` when background jobs are enabled
 * (`ENABLE_BACKGROUND_JOBS` in prod/staging; always in development).
 *
 * Also accepts `AUTO_PAY_SINGLE_INSTANCE=true` so Reserved VM money-path configs
 * still start the heal/alert loop even if the two flags diverge.
 */

import { canStartPaymentFlowMonitor } from '../lib/background-jobs-singleton';
import { runPaymentFlowMonitor } from './payment-flow-monitor';

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
    console.log('[PaymentFlowMonitorJob] previous sweep still running, skipping...');
    return;
  }
  isRunning = true;
  try {
    await runPaymentFlowMonitor({ autoHeal: true, notify: true });
  } catch (err) {
    console.error('[PaymentFlowMonitorJob] sweep failed:', err);
  } finally {
    isRunning = false;
  }
}

/** True when the interval (or initial timeout) is scheduled. Exported for tests/ops checks. */
export function isPaymentFlowMonitorJobScheduled(): boolean {
  return monitorInterval != null || initialTimeout != null;
}

/**
 * Start the recurring monitor on the singleton background worker.
 * Safe to call twice — second call is a no-op.
 */
export function startPaymentFlowMonitorJob(): void {
  if (!canStartPaymentFlowMonitor()) {
    console.error(
      'CRITICAL: [PaymentFlowMonitorJob] blocked — requires ENABLE_BACKGROUND_JOBS=true on the singleton worker ' +
        '(or AUTO_PAY_SINGLE_INSTANCE=true). Monitor will NOT start. Stuck parent_manual Pay Now rows will not auto-heal.',
    );
    return;
  }
  if (monitorInterval || initialTimeout) {
    console.log('[PaymentFlowMonitorJob] job already scheduled');
    return;
  }

  const intervalMs = resolveIntervalMs();
  console.log(
    `[PaymentFlowMonitorJob] scheduled every ${(intervalMs / 60000).toFixed(1)}m ` +
      `(first run in ${(INITIAL_DELAY_MS / 1000).toFixed(0)}s)`,
  );

  initialTimeout = setTimeout(() => {
    initialTimeout = null;
    void tick();
    monitorInterval = setInterval(() => void tick(), intervalMs);
    // Keep the timer referenced while the HTTP server is alive; unref on stop.
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
    console.log('[PaymentFlowMonitorJob] stopped');
  }
}
