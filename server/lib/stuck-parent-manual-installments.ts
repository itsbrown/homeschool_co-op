/**
 * Detect and release scheduled_payments stuck after abandoned parent Pay Now attempts.
 * Safe auto-heal: resets row state and cancels stale Stripe PIs — never charges a card.
 */

import { and, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getDb } from '../db';
import { getStripeClient } from '../config/stripe';
import { scheduledPayments, programEnrollments, users } from '../../shared/schema';
import { storage } from '../storage';
import { computeEffectiveBalance } from '@shared/schema';
import { shouldClearStaleScheduledPaymentIntent } from './scheduled-payment-parent-pay';
import { resolveStripeCustomerIdsForParentEmail } from './stripe-search-helpers';

/** Abandoned Pay Now checkout — release sooner than autopay processing staleness (30m). */
export const PARENT_MANUAL_STUCK_MINUTES = 15;

export type StuckParentManualRow = {
  id: number;
  parentId: number;
  parentEmail: string;
  parentName: string | null;
  enrollmentId: number;
  childName: string | null;
  className: string | null;
  amount: number;
  status: string;
  chargedBy: string | null;
  stripePaymentIntentId: string | null;
  failureReason: string | null;
  updatedAt: Date;
  minutesStuck: number;
  enrollmentBalanceCents: number;
};

export type FindStuckOptions = {
  /** Only `processing` rows older than this many minutes. Default PARENT_MANUAL_STUCK_MINUTES. */
  processingOlderThanMinutes?: number;
  /** Include `failed` + parent_manual rows that still hold a Stripe PI id. Default true. */
  includeFailedWithPi?: boolean;
  /** Only rows where enrollment still owes money. Default true. */
  onlyOwingEnrollments?: boolean;
};

async function cancelPiIfNeeded(stripe: Stripe, piId: string | null | undefined): Promise<void> {
  if (!piId) return;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status === 'succeeded' || pi.status === 'canceled') return;
    await stripe.paymentIntents.cancel(piId);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') return;
    throw err;
  }
}

/**
 * Rows that block Pay Now retries (`INSTALLMENT_NOT_AVAILABLE`) or hide from Upcoming.
 */
export async function findStuckParentManualInstallments(
  opts: FindStuckOptions = {},
): Promise<StuckParentManualRow[]> {
  const processingMinutes = opts.processingOlderThanMinutes ?? PARENT_MANUAL_STUCK_MINUTES;
  const includeFailedWithPi = opts.includeFailedWithPi !== false;
  const onlyOwing = opts.onlyOwingEnrollments !== false;
  const processingCutoff = new Date(Date.now() - processingMinutes * 60_000);

  const statusClause = includeFailedWithPi
    ? or(
        and(
          eq(scheduledPayments.status, 'processing'),
          lt(scheduledPayments.updatedAt, processingCutoff),
        ),
        and(
          eq(scheduledPayments.status, 'failed'),
          isNotNull(scheduledPayments.stripePaymentIntentId),
        ),
      )
    : and(
        eq(scheduledPayments.status, 'processing'),
        lt(scheduledPayments.updatedAt, processingCutoff),
      );

  const db = await getDb();
  const rows = await db
    .select({
      id: scheduledPayments.id,
      parentId: scheduledPayments.parentId,
      parentEmail: scheduledPayments.parentEmail,
      parentFirstName: users.firstName,
      parentLastName: users.lastName,
      enrollmentId: scheduledPayments.enrollmentId,
      childName: programEnrollments.childName,
      className: programEnrollments.className,
      amount: scheduledPayments.amount,
      status: scheduledPayments.status,
      chargedBy: scheduledPayments.chargedBy,
      stripePaymentIntentId: scheduledPayments.stripePaymentIntentId,
      failureReason: scheduledPayments.failureReason,
      updatedAt: scheduledPayments.updatedAt,
      totalCost: programEnrollments.totalCost,
      totalPaid: programEnrollments.totalPaid,
      compAmountCents: programEnrollments.compAmountCents,
    })
    .from(scheduledPayments)
    .innerJoin(programEnrollments, sql`${programEnrollments.id} = ${scheduledPayments.enrollmentId}`)
    .leftJoin(users, sql`${users.id} = ${scheduledPayments.parentId}`)
    .where(and(eq(scheduledPayments.chargedBy, 'parent_manual'), statusClause))
    .orderBy(scheduledPayments.updatedAt);

  const now = Date.now();
  const out: StuckParentManualRow[] = [];

  for (const row of rows) {
    const balance = computeEffectiveBalance(
      row.totalCost ?? 0,
      row.totalPaid ?? 0,
      row.compAmountCents ?? 0,
    );
    if (onlyOwing && balance <= 0) continue;

    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
    out.push({
      id: row.id,
      parentId: row.parentId,
      parentEmail: row.parentEmail,
      parentName:
        [row.parentFirstName, row.parentLastName].filter(Boolean).join(' ').trim() || null,
      enrollmentId: row.enrollmentId,
      childName: row.childName,
      className: row.className,
      amount: row.amount,
      status: String(row.status),
      chargedBy: row.chargedBy,
      stripePaymentIntentId: row.stripePaymentIntentId,
      failureReason: row.failureReason,
      updatedAt,
      minutesStuck: Math.max(0, Math.round((now - updatedAt.getTime()) / 60_000)),
      enrollmentBalanceCents: balance,
    });
  }

  return out;
}

export type ReleaseStuckResult = {
  released: number;
  skipped: number;
  errors: number;
  rows: Array<{ id: number; parentEmail: string; action: 'released' | 'skipped' | 'error'; detail?: string }>;
};

/**
 * Reset a stuck parent_manual row to `pending` and cancel any stale Stripe PI.
 */
export async function releaseStuckParentManualInstallment(
  row: Pick<StuckParentManualRow, 'id' | 'parentId' | 'parentEmail' | 'stripePaymentIntentId' | 'status'>,
  stripe?: Stripe,
): Promise<void> {
  const client = stripe ?? (await getStripeClient());
  const status = String(row.status);

  if (row.stripePaymentIntentId) {
    const resolvedCustomerIds = await resolveStripeCustomerIdsForParentEmail(
      storage,
      client,
      row.parentEmail,
    );
    const ctx = { parentEmail: row.parentEmail, customerIds: resolvedCustomerIds };
    const shouldClear = await shouldClearStaleScheduledPaymentIntent(
      {
        id: row.id,
        status,
        stripePaymentIntentId: row.stripePaymentIntentId,
      },
      client,
      ctx,
    );
    if (shouldClear) {
      await cancelPiIfNeeded(client, row.stripePaymentIntentId);
    }
  }

  if (status === 'processing') {
    const released = await storage.releaseScheduledPaymentParentClaim(row.id, row.parentId);
    if (released) return;
  }

  await storage.updateScheduledPayment(row.id, {
    status: 'pending',
    chargedBy: null,
    stripePaymentIntentId: null,
    failureReason: null,
    retryCount: 0,
  });
}

export async function releaseAllStuckParentManualInstallments(
  opts: FindStuckOptions & { maxRows?: number; stripe?: Stripe } = {},
): Promise<ReleaseStuckResult> {
  const maxRows = opts.maxRows ?? 100;
  const rows = (await findStuckParentManualInstallments(opts)).slice(0, maxRows);
  const stripe = opts.stripe ?? (await getStripeClient());
  const result: ReleaseStuckResult = { released: 0, skipped: 0, errors: 0, rows: [] };

  for (const row of rows) {
    try {
      await releaseStuckParentManualInstallment(row, stripe);
      result.released += 1;
      result.rows.push({ id: row.id, parentEmail: row.parentEmail, action: 'released' });
    } catch (err) {
      result.errors += 1;
      result.rows.push({
        id: row.id,
        parentEmail: row.parentEmail,
        action: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/** Row blocks Pay Now retry until released (processing claim or failed + stale PI). */
export function isRecoverableStuckParentManualRow(row: {
  status?: string | null;
  chargedBy?: string | null;
  stripePaymentIntentId?: string | null;
}): boolean {
  if (row.chargedBy !== 'parent_manual') return false;
  const status = String(row.status ?? '');
  if (status === 'processing') return true;
  if (status === 'failed' && row.stripePaymentIntentId) return true;
  return false;
}

/** Best-effort unblock before returning INSTALLMENT_NOT_AVAILABLE. */
export async function recoverParentManualClaimForPay(
  row: Pick<
    StuckParentManualRow,
    'id' | 'parentId' | 'parentEmail' | 'stripePaymentIntentId' | 'status'
  >,
  stripe?: Stripe,
): Promise<void> {
  await releaseStuckParentManualInstallment(row, stripe);
}
