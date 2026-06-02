import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { getStripeClient } from '../config/stripe';
import { parseBalanceIntentCredits } from './balance-payment-metadata';
import { consumeCreditsFromPaymentIntentMetadata } from './fulfill-balance-payment-intent';
import {
  ensureScheduledPaymentCreditsConsumed,
  scheduledPaymentCreditUsageDescription,
} from './ensure-scheduled-payment-credits-consumed';
import { storage } from '../storage';

/** Raw SQL row columns may be snake_case or camelCase depending on driver/drizzle version. */
function sqlRowValue(row: Record<string, unknown>, snakeKey: string): unknown {
  if (row[snakeKey] !== undefined && row[snakeKey] !== null) {
    return row[snakeKey];
  }
  const camelKey = snakeKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return row[camelKey];
}

/** postgres.js returns an array; some drivers wrap rows in `{ rows }`. */
function rowsFromExecute(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }
  if (
    result &&
    typeof result === 'object' &&
    'rows' in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

export type MissingCreditLedgerKind = 'scheduled_payment' | 'payment_record' | 'stripe_payment_intent';

export interface MissingCreditLedgerEntry {
  kind: MissingCreditLedgerKind;
  userId: number;
  parentEmail: string | null;
  creditsAppliedCents: number;
  scheduledPaymentId?: number;
  paymentId?: number;
  paymentIntentId?: string | null;
  installmentNumber?: string;
  totalInstallments?: string;
  creditHoldSessionId?: string;
  completionSource?: string | null;
  processedAt?: Date | null;
}

export interface CreditLedgerRepairResult {
  entry: MissingCreditLedgerEntry;
  dryRun: boolean;
  repaired: boolean;
  consumedCents?: number;
  skippedAlreadyApplied?: boolean;
  error?: string;
}

/**
 * Find completed payments where credits were expected but no usage log exists.
 */
export async function findMissingCreditLedgerEntries(
  schoolId?: number,
): Promise<MissingCreditLedgerEntry[]> {
  const db = await getDb();
  const schoolClause =
    schoolId != null ? sql`AND sp.school_id = ${schoolId}` : sql``;
  const schoolClausePayments =
    schoolId != null ? sql`AND p.school_id = ${schoolId}` : sql``;

  const scheduledRows = await db.execute(sql`
    SELECT
      sp.id AS scheduled_payment_id,
      sp.parent_id AS user_id,
      sp.parent_email,
      sp.amount,
      sp.completion_source,
      sp.installment_number,
      sp.total_installments,
      sp.stripe_payment_intent_id,
      sp.processed_at
    FROM scheduled_payments sp
    WHERE sp.status = 'completed'
      ${schoolClause}
      AND (
        sp.completion_source IN (
          'credits_only',
          'parent_manual_credits_only',
          'stripe_autopay_partial_credits'
        )
        OR sp.stripe_payment_intent_id LIKE 'credit_%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unified_credit_usage_logs u
        WHERE u.description LIKE '%Scheduled payment ' || sp.id::text || '%'
      )
  `);

  const paymentRows = await db.execute(sql`
    SELECT
      p.id AS payment_id,
      p.parent_id AS user_id,
      p.parent_email,
      p.stripe_payment_intent_id,
      COALESCE(
        NULLIF(p.metadata->>'creditsAppliedCents', '')::int,
        0
      ) AS credits_applied_cents,
      (p.metadata->>'scheduledPaymentId')::int AS scheduled_payment_id,
      (p.metadata->>'creditOnlyCheckout')::boolean AS credit_only_checkout
    FROM payments p
    WHERE p.status = 'completed'
      AND p.parent_id IS NOT NULL
      ${schoolClausePayments}
      AND (
        COALESCE(NULLIF(p.metadata->>'creditsAppliedCents', '')::int, 0) > 0
        OR COALESCE(p.metadata->>'creditOnlyCheckout', 'false') = 'true'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unified_credit_usage_logs u
        JOIN credits c ON c.id = u.credit_id
        WHERE c.user_id = p.parent_id
          AND (
            (p.stripe_payment_intent_id IS NOT NULL
              AND u.description = 'Checkout ' || p.stripe_payment_intent_id)
            OR (
              p.metadata->>'scheduledPaymentId' IS NOT NULL
              AND u.description LIKE '%Scheduled payment '
                || (p.metadata->>'scheduledPaymentId') || '%'
            )
          )
      )
  `);

  const entries: MissingCreditLedgerEntry[] = [];

  for (const row of rowsFromExecute(scheduledRows)) {
    const scheduledPaymentId = Number(sqlRowValue(row, 'scheduled_payment_id'));
    const userId = Number(sqlRowValue(row, 'user_id'));
    const amount = Number(sqlRowValue(row, 'amount')) || 0;
    const completionSource = sqlRowValue(row, 'completion_source') as string | null;
    const stripePiId = sqlRowValue(row, 'stripe_payment_intent_id');
    let creditsAppliedCents = amount;

    if (
      completionSource === 'stripe_autopay_partial_credits' ||
      (stripePiId && !String(stripePiId).startsWith('credit_'))
    ) {
      const piId = String(stripePiId || '');
      if (piId.startsWith('pi_')) {
        try {
          const stripe = await getStripeClient();
          const pi = await stripe.paymentIntents.retrieve(piId);
          const parsed = parseBalanceIntentCredits(
            pi.metadata as Record<string, string | undefined>,
          );
          if (parsed.creditsAppliedCents > 0) {
            creditsAppliedCents = parsed.creditsAppliedCents;
          }
        } catch {
          /* keep installment amount as fallback */
        }
      }
    }

    if (creditsAppliedCents <= 0 || !Number.isFinite(userId) || !Number.isFinite(scheduledPaymentId)) {
      continue;
    }

    entries.push({
      kind: 'scheduled_payment',
      userId,
      parentEmail: (sqlRowValue(row, 'parent_email') as string) ?? null,
      creditsAppliedCents,
      scheduledPaymentId,
      paymentIntentId: (stripePiId as string) ?? null,
      installmentNumber: String(sqlRowValue(row, 'installment_number') ?? '?'),
      totalInstallments: String(sqlRowValue(row, 'total_installments') ?? '?'),
      completionSource,
      processedAt: sqlRowValue(row, 'processed_at')
        ? new Date(String(sqlRowValue(row, 'processed_at')))
        : null,
    });
  }

  for (const row of rowsFromExecute(paymentRows)) {
    const userId = Number(sqlRowValue(row, 'user_id'));
    let creditsAppliedCents = Number(sqlRowValue(row, 'credits_applied_cents')) || 0;
    const scheduledPaymentIdRaw = sqlRowValue(row, 'scheduled_payment_id');
    const scheduledPaymentId = scheduledPaymentIdRaw
      ? Number(scheduledPaymentIdRaw)
      : undefined;
    const paymentIntentId = (sqlRowValue(row, 'stripe_payment_intent_id') as string) ?? null;
    const creditOnlyCheckout = sqlRowValue(row, 'credit_only_checkout');

    if (creditsAppliedCents <= 0 && creditOnlyCheckout && paymentIntentId) {
      const pay = await storage.getPaymentByStripeId(paymentIntentId);
      const meta = pay?.metadata as Record<string, unknown> | undefined;
      creditsAppliedCents =
        Number(meta?.creditsAppliedCents ?? meta?.totalWithMembershipCents ?? 0) || 0;
    }

    if (creditsAppliedCents <= 0 || !Number.isFinite(userId)) continue;

    if (
      scheduledPaymentId &&
      entries.some((e) => e.scheduledPaymentId === scheduledPaymentId)
    ) {
      continue;
    }

    entries.push({
      kind: scheduledPaymentId ? 'scheduled_payment' : 'payment_record',
      userId,
      parentEmail: (sqlRowValue(row, 'parent_email') as string) ?? null,
      creditsAppliedCents,
      paymentId: Number(sqlRowValue(row, 'payment_id')),
      scheduledPaymentId,
      paymentIntentId,
    });
  }

  return entries;
}

export async function repairMissingCreditLedgerEntry(
  entry: MissingCreditLedgerEntry,
  options?: { dryRun?: boolean },
): Promise<CreditLedgerRepairResult> {
  const dryRun = options?.dryRun ?? true;

  if (dryRun) {
    return { entry, dryRun: true, repaired: false };
  }

  try {
    if (entry.kind === 'scheduled_payment' && entry.scheduledPaymentId) {
      const result = await ensureScheduledPaymentCreditsConsumed({
        scheduledPaymentId: entry.scheduledPaymentId,
        userId: entry.userId,
        creditsAppliedCents: entry.creditsAppliedCents,
        creditHoldSessionId: entry.creditHoldSessionId,
        installmentNumber: entry.installmentNumber,
        totalInstallments: entry.totalInstallments,
      });
      if (result.consumedCents < entry.creditsAppliedCents && !result.skippedAlreadyApplied) {
        return {
          entry,
          dryRun: false,
          repaired: false,
          consumedCents: result.consumedCents,
          skippedAlreadyApplied: result.skippedAlreadyApplied,
          error: `Incomplete consumption: expected ${entry.creditsAppliedCents}, got ${result.consumedCents}`,
        };
      }
      return {
        entry,
        dryRun: false,
        repaired: true,
        consumedCents: result.consumedCents,
        skippedAlreadyApplied: result.skippedAlreadyApplied,
      };
    }

    if (entry.paymentIntentId?.startsWith('pi_')) {
      const stripe = await getStripeClient();
      const pi = await stripe.paymentIntents.retrieve(entry.paymentIntentId);
      const result = await consumeCreditsFromPaymentIntentMetadata(pi);
      return {
        entry,
        dryRun: false,
        repaired: result.creditsConsumedCents >= entry.creditsAppliedCents,
        consumedCents: result.creditsConsumedCents,
        skippedAlreadyApplied: result.creditsSkippedAlreadyApplied,
      };
    }

    if (entry.scheduledPaymentId) {
      const description = scheduledPaymentCreditUsageDescription(
        entry.scheduledPaymentId,
        entry.installmentNumber,
        entry.totalInstallments,
      );
      const { totalUsed } = await storage.useCredits(
        entry.userId,
        entry.creditsAppliedCents,
        undefined,
        description,
      );
      return {
        entry,
        dryRun: false,
        repaired: totalUsed > 0,
        consumedCents: totalUsed,
      };
    }

    return {
      entry,
      dryRun: false,
      repaired: false,
      error: 'No repair path for entry (missing payment intent / scheduled payment id)',
    };
  } catch (err) {
    return {
      entry,
      dryRun: false,
      repaired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function repairAllMissingCreditLedgerEntries(options?: {
  schoolId?: number;
  dryRun?: boolean;
  limit?: number;
}): Promise<{
  found: number;
  repaired: number;
  failed: number;
  results: CreditLedgerRepairResult[];
}> {
  const dryRun = options?.dryRun ?? true;
  const limit = options?.limit ?? 500;
  const entries = (await findMissingCreditLedgerEntries(options?.schoolId)).slice(0, limit);

  const results: CreditLedgerRepairResult[] = [];
  let repaired = 0;
  let failed = 0;

  for (const entry of entries) {
    const result = await repairMissingCreditLedgerEntry(entry, { dryRun });
    results.push(result);
    if (!dryRun) {
      if (result.repaired) repaired++;
      else if (result.error) failed++;
    }
  }

  return { found: entries.length, repaired, failed, results };
}
