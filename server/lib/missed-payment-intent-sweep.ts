/**
 * Layer 3 daily Stripe↔DB sweep: succeeded ASA checkout PaymentIntents
 * missing from `payments` / `stripe_payment_history`.
 *
 * Conversation nickname: "Phase C". Written plan: Phase D daily job.
 * Detect + alert only by default. Never creates Stripe charges.
 */

import Stripe from 'stripe';
import { inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { payments, stripePaymentHistory } from '@shared/schema';

export const MISSED_PI_SWEEP_LOG_PREFIX = '[missed-pi-sweep]';

export const DEFAULT_LOOKBACK_DAYS = 30;
export const DEFAULT_MAX_PAGES = 20;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_MAX_PAYMENT_INTENTS = 2000;
export const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_INITIAL_DELAY_MS = 180 * 1000;
export const MIN_INTERVAL_MS = 60 * 60 * 1000;

export type MissedPiClassification =
  | 'out_of_scope'
  | 'not_succeeded'
  | 'already_in_payments'
  | 'history_only'
  | 'missed';

export type MissedPiSeverity = 'critical' | 'warning' | 'info';

export type DbPresence = {
  inPayments: boolean;
  inHistory: boolean;
};

export type MissedPiFinding = {
  paymentIntentId: string;
  classification: MissedPiClassification;
  severity: MissedPiSeverity;
  autoFixEligible: boolean;
  skipAutoFixReason: string | null;
  amountCents: number;
  created: number | null;
  parentEmail: string | null;
  enrollmentIds: number[];
  paymentType: string | null;
  fullyRefunded: boolean;
  inPayments: boolean;
  inHistory: boolean;
};

export type MissedPiSweepConfig = {
  enabled: boolean;
  autoFix: boolean;
  lookbackDays: number;
  maxPages: number;
  maxPaymentIntents: number;
  pageSize: number;
  intervalMs: number;
  initialDelayMs: number;
};

export type StripePaymentIntentLister = {
  paymentIntents: {
    list: (
      params: Stripe.PaymentIntentListParams,
    ) => Promise<Pick<Stripe.ApiList<Stripe.PaymentIntent>, 'data' | 'has_more'>>;
  };
};

function envTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function envFalsy(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function parsePositiveInt(raw: string | undefined, fallback: number, min = 1): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.floor(parsed);
}

/** On in production when unset (detect + alert is cheap/safe). Off in dev unless explicitly enabled. */
export function isMissedPiSweepEnabled(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string = env.NODE_ENV || 'development',
): boolean {
  if (env.MISSED_PI_SWEEP_ENABLED !== undefined) {
    return envTruthy(env.MISSED_PI_SWEEP_ENABLED);
  }
  return nodeEnv === 'production' && !envFalsy(env.MISSED_PI_SWEEP_ENABLED);
}

/** Auto-fix is always off unless explicitly enabled. Never default on. */
export function isMissedPiSweepAutoFixEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envTruthy(env.MISSED_PI_SWEEP_AUTO_FIX);
}

export function resolveMissedPiSweepConfig(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string = env.NODE_ENV || 'development',
): MissedPiSweepConfig {
  const intervalMs = parsePositiveInt(env.MISSED_PI_SWEEP_INTERVAL_MS, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS);
  return {
    enabled: isMissedPiSweepEnabled(env, nodeEnv),
    autoFix: isMissedPiSweepAutoFixEnabled(env),
    lookbackDays: parsePositiveInt(env.MISSED_PI_SWEEP_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, 1),
    maxPages: parsePositiveInt(env.MISSED_PI_SWEEP_MAX_PAGES, DEFAULT_MAX_PAGES, 1),
    maxPaymentIntents: parsePositiveInt(
      env.MISSED_PI_SWEEP_MAX_PAYMENT_INTENTS,
      DEFAULT_MAX_PAYMENT_INTENTS,
      1,
    ),
    pageSize: Math.min(100, parsePositiveInt(env.MISSED_PI_SWEEP_PAGE_SIZE, DEFAULT_PAGE_SIZE, 1)),
    intervalMs,
    initialDelayMs: parsePositiveInt(env.MISSED_PI_SWEEP_INITIAL_DELAY_MS, DEFAULT_INITIAL_DELAY_MS, 0),
  };
}

export function parseEnrollmentIdsFromMetadata(
  metadata: Record<string, string | undefined> | Stripe.Metadata | null | undefined,
): number[] {
  const ids = new Set<number>();
  try {
    const parsed = JSON.parse(String(metadata?.enrollmentIds ?? '[]')) as unknown;
    if (Array.isArray(parsed)) {
      for (const id of parsed) {
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) ids.add(n);
      }
    }
  } catch {
    /* ignore */
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * In-scope when this app created the PI or checkout metadata is present.
 * Matches cart PIs (`createdBy=asa_payment_system`) and scheduled/Pay Now PIs
 * that only set `parentEmail` / `enrollmentIds`.
 */
export function isAsaCheckoutPaymentIntent(
  pi: Pick<Stripe.PaymentIntent, 'metadata'>,
): boolean {
  const meta = (pi.metadata ?? {}) as Record<string, string | undefined>;
  if (meta.createdBy === 'asa_payment_system') return true;
  if ((meta.parentEmail || '').trim().length > 0) return true;
  if (parseEnrollmentIdsFromMetadata(meta).length > 0) return true;
  return false;
}

function chargeLooksFullyRefunded(charge: unknown, amountCents: number): boolean {
  if (!charge || typeof charge !== 'object') return false;
  const c = charge as { refunded?: boolean; amount_refunded?: number };
  if (c.refunded === true) return true;
  if (typeof c.amount_refunded === 'number' && amountCents > 0 && c.amount_refunded >= amountCents) {
    return true;
  }
  return false;
}

export function isPaymentIntentFullyRefunded(
  pi: Pick<Stripe.PaymentIntent, 'amount' | 'latest_charge'> & {
    charges?: { data?: unknown[] };
  },
): boolean {
  const amount = typeof pi.amount === 'number' ? pi.amount : 0;
  if (chargeLooksFullyRefunded(pi.latest_charge, amount)) return true;
  const firstCharge = pi.charges?.data?.[0];
  return chargeLooksFullyRefunded(firstCharge, amount);
}

export function classifyMissedPaymentIntent(
  pi: Stripe.PaymentIntent,
  presence: DbPresence,
): MissedPiFinding {
  const meta = (pi.metadata ?? {}) as Record<string, string | undefined>;
  const enrollmentIds = parseEnrollmentIdsFromMetadata(meta);
  const parentEmail = (meta.parentEmail || '').trim() || null;
  const paymentType = (meta.paymentType || meta.type || '').trim() || null;
  const fullyRefunded = isPaymentIntentFullyRefunded(pi);
  const base = {
    paymentIntentId: pi.id,
    amountCents: typeof pi.amount === 'number' ? pi.amount : 0,
    created: typeof pi.created === 'number' ? pi.created : null,
    parentEmail,
    enrollmentIds,
    paymentType,
    fullyRefunded,
    inPayments: presence.inPayments,
    inHistory: presence.inHistory,
  };

  if (!isAsaCheckoutPaymentIntent(pi)) {
    return {
      ...base,
      classification: 'out_of_scope',
      severity: 'info',
      autoFixEligible: false,
      skipAutoFixReason: 'not_asa_checkout',
    };
  }

  if (pi.status !== 'succeeded') {
    return {
      ...base,
      classification: 'not_succeeded',
      severity: 'info',
      autoFixEligible: false,
      skipAutoFixReason: `status_${pi.status || 'unknown'}`,
    };
  }

  if (presence.inPayments) {
    return {
      ...base,
      classification: 'already_in_payments',
      severity: 'info',
      autoFixEligible: false,
      skipAutoFixReason: 'already_in_payments',
    };
  }

  if (presence.inHistory) {
    return {
      ...base,
      classification: 'history_only',
      severity: 'warning',
      autoFixEligible: false,
      skipAutoFixReason: 'history_only_needs_review',
    };
  }

  let skipAutoFixReason: string | null = null;
  if (fullyRefunded) skipAutoFixReason = 'fully_refunded';
  else if (enrollmentIds.length === 0 && paymentType !== 'scheduled_payment') {
    skipAutoFixReason = 'no_enrollment_ids';
  } else if (paymentType === 'scheduled_payment' && !meta.scheduledPaymentId) {
    skipAutoFixReason = 'scheduled_missing_id';
  }

  return {
    ...base,
    classification: 'missed',
    severity: 'critical',
    autoFixEligible: skipAutoFixReason == null,
    skipAutoFixReason,
  };
}

export function collectSweepFindings(
  paymentIntents: Stripe.PaymentIntent[],
  presenceById: Map<string, DbPresence>,
): MissedPiFinding[] {
  const findings: MissedPiFinding[] = [];
  for (const pi of paymentIntents) {
    if (!pi?.id) continue;
    const presence = presenceById.get(pi.id) ?? { inPayments: false, inHistory: false };
    const finding = classifyMissedPaymentIntent(pi, presence);
    if (finding.classification === 'out_of_scope' || finding.classification === 'not_succeeded') {
      continue;
    }
    if (finding.classification === 'already_in_payments') continue;
    findings.push(finding);
  }
  return findings;
}

export async function listSucceededAsaPaymentIntents(
  stripe: StripePaymentIntentLister,
  options: {
    lookbackDays: number;
    maxPages: number;
    maxPaymentIntents: number;
    pageSize: number;
    nowMs?: number;
  },
): Promise<{ paymentIntents: Stripe.PaymentIntent[]; pagesFetched: number; truncated: boolean }> {
  const nowMs = options.nowMs ?? Date.now();
  const createdGte = Math.floor((nowMs - options.lookbackDays * 24 * 60 * 60 * 1000) / 1000);
  const collected: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  let pagesFetched = 0;
  let truncated = false;

  for (let page = 0; page < options.maxPages; page++) {
    const listed = await stripe.paymentIntents.list({
      created: { gte: createdGte },
      limit: options.pageSize,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    pagesFetched += 1;
    const batch = listed.data ?? [];
    for (const pi of batch) {
      if (pi.status !== 'succeeded') continue;
      if (!isAsaCheckoutPaymentIntent(pi)) continue;
      collected.push(pi);
      if (collected.length >= options.maxPaymentIntents) {
        truncated = true;
        return { paymentIntents: collected, pagesFetched, truncated };
      }
    }
    if (!listed.has_more || batch.length === 0) {
      return { paymentIntents: collected, pagesFetched, truncated };
    }
    startingAfter = batch[batch.length - 1]?.id;
    if (!startingAfter) break;
  }

  truncated = true;
  return { paymentIntents: collected, pagesFetched, truncated };
}

export async function lookupDbPresence(paymentIntentIds: string[]): Promise<Map<string, DbPresence>> {
  const result = new Map<string, DbPresence>();
  for (const id of paymentIntentIds) {
    result.set(id, { inPayments: false, inHistory: false });
  }
  if (paymentIntentIds.length === 0) return result;

  const db = await getDb();
  const payRows = await db
    .select({ id: payments.stripePaymentIntentId })
    .from(payments)
    .where(inArray(payments.stripePaymentIntentId, paymentIntentIds));
  for (const row of payRows) {
    if (!row.id) continue;
    const current = result.get(row.id) ?? { inPayments: false, inHistory: false };
    current.inPayments = true;
    result.set(row.id, current);
  }

  const histRows = await db
    .select({ id: stripePaymentHistory.paymentIntentId })
    .from(stripePaymentHistory)
    .where(inArray(stripePaymentHistory.paymentIntentId, paymentIntentIds));
  for (const row of histRows) {
    if (!row.id) continue;
    const current = result.get(row.id) ?? { inPayments: false, inHistory: false };
    current.inHistory = true;
    result.set(row.id, current);
  }

  return result;
}

/** Env-key Stripe client. Avoids Replit connector hang from `getStripeClient()`. */
export function createSweepStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe {
  const key = (env.STRIPE_SECRET_KEY || '').trim();
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is required for the missed-PI sweep. ' +
        'Use node scripts/with-prod-env.mjs (do not use getStripeClient / Replit connector).',
    );
  }
  return new Stripe(key, {
    apiVersion: '2025-11-17.clover' as any,
    typescript: true,
  });
}

export function redactFindingForLog(finding: MissedPiFinding): Record<string, unknown> {
  return {
    piId: finding.paymentIntentId,
    classification: finding.classification,
    severity: finding.severity,
    amountCents: finding.amountCents,
    parentEmail: finding.parentEmail,
    enrollmentIds: finding.enrollmentIds,
    paymentType: finding.paymentType,
    fullyRefunded: finding.fullyRefunded,
    autoFixEligible: finding.autoFixEligible,
    skipAutoFixReason: finding.skipAutoFixReason,
  };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
