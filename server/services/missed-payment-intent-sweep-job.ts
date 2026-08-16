/**
 * Daily missed PaymentIntent sweep job.
 * Started from `server/index.ts` next to the payment-flow monitor.
 * Uses `canStartMissedPiSweep` (heal-capable guard) so it cannot stay off
 * while other money jobs still run.
 */

import { canStartMissedPiSweep } from '../lib/background-jobs-singleton';
import {
  MISSED_PI_SWEEP_LOG_PREFIX,
  isMissedPiSweepAutoFixEnabled,
  isMissedPiSweepEnabled,
  resolveMissedPiSweepConfig,
} from '../lib/missed-payment-intent-sweep';
import { runMissedPaymentIntentSweep } from './missed-payment-intent-sweep';

let sweepInterval: ReturnType<typeof setInterval> | null = null;
let initialTimeout: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  if (isRunning) {
    console.log(`${MISSED_PI_SWEEP_LOG_PREFIX} previous sweep still running, skipping...`);
    return;
  }
  if (!isMissedPiSweepEnabled()) {
    console.log(`${MISSED_PI_SWEEP_LOG_PREFIX} disabled (MISSED_PI_SWEEP_ENABLED)`);
    return;
  }
  isRunning = true;
  try {
    await runMissedPaymentIntentSweep({
      notify: true,
      autoFix: isMissedPiSweepAutoFixEnabled(),
    });
  } catch (err) {
    console.error(`${MISSED_PI_SWEEP_LOG_PREFIX} sweep failed:`, err);
  } finally {
    isRunning = false;
  }
}

export function isMissedPiSweepJobScheduled(): boolean {
  return sweepInterval != null || initialTimeout != null;
}

export function startMissedPiSweepJob(): void {
  if (!canStartMissedPiSweep()) {
    console.error(
      `CRITICAL: ${MISSED_PI_SWEEP_LOG_PREFIX} blocked — requires ENABLE_BACKGROUND_JOBS=true ` +
        'on the singleton worker (or AUTO_PAY_SINGLE_INSTANCE=true). Sweep will NOT start.',
    );
    return;
  }
  if (!isMissedPiSweepEnabled()) {
    console.log(
      `${MISSED_PI_SWEEP_LOG_PREFIX} not enabled (set MISSED_PI_SWEEP_ENABLED=true; ` +
        'defaults on in production when unset)',
    );
    return;
  }
  if (sweepInterval || initialTimeout) {
    console.log(`${MISSED_PI_SWEEP_LOG_PREFIX} job already scheduled`);
    return;
  }

  const config = resolveMissedPiSweepConfig();
  console.log(
    `${MISSED_PI_SWEEP_LOG_PREFIX} scheduled every ${(config.intervalMs / 3600000).toFixed(1)}h ` +
      `(lookback ${config.lookbackDays}d, first run in ${(config.initialDelayMs / 1000).toFixed(0)}s, ` +
      `autoFix=${config.autoFix})`,
  );

  initialTimeout = setTimeout(() => {
    initialTimeout = null;
    void tick();
    sweepInterval = setInterval(() => void tick(), config.intervalMs);
  }, config.initialDelayMs);
}

export function stopMissedPiSweepJob(): void {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    console.log(`${MISSED_PI_SWEEP_LOG_PREFIX} stopped`);
  }
}
