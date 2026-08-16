/**
 * Shared guards for in-process singleton background work.
 *
 * Production/staging: only the designated worker should set ENABLE_BACKGROUND_JOBS=true.
 * AUTO_PAY_SINGLE_INSTANCE remains an optional extra money-path flag (Reserved VM).
 * Development: background jobs run by default (same as server/index.ts).
 */

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

/** True when this process is the designated background-jobs worker (or local dev). */
export function isBackgroundJobsSingleton(env: string = process.env.NODE_ENV || 'development'): boolean {
  if (env === 'test') return false;
  if (process.env.PLAYWRIGHT_WEB_SERVER === 'true') return false;
  if (env === 'development') return true;
  return parseBooleanEnv(process.env.ENABLE_BACKGROUND_JOBS, false);
}

/**
 * True when payment-flow monitor (and similar non-charging heal jobs) may start.
 * Accepts either ENABLE_BACKGROUND_JOBS singleton or AUTO_PAY_SINGLE_INSTANCE so
 * heal cannot silently stay off while off-session charges still run.
 */
export function canStartPaymentFlowMonitor(
  env: string = process.env.NODE_ENV || 'development',
): boolean {
  if (env === 'test') return false;
  if (process.env.PLAYWRIGHT_WEB_SERVER === 'true') return false;
  if (env === 'development') return true;
  if (process.env.AUTO_PAY_SINGLE_INSTANCE === 'true') return true;
  return parseBooleanEnv(process.env.ENABLE_BACKGROUND_JOBS, false);
}

/**
 * Same heal-capable guard as the payment-flow monitor. The daily missed-PI
 * sweep must not stay off on a worker that still runs money jobs.
 */
export function canStartMissedPiSweep(
  env: string = process.env.NODE_ENV || 'development',
): boolean {
  return canStartPaymentFlowMonitor(env);
}
