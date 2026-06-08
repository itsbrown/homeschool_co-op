/**
 * Scheduled Payment Reminder Service
 * 
 * Sends automatic email reminders when scheduled payments are upcoming or overdue.
 * 
 * Reminder Schedule:
 * - 7 days before due date
 * - 3 days before due date
 * - 1 day before due date
 * - On due date (morning)
 * - 1 day overdue
 * - 7 days overdue (final notice)
 */

import { storage } from '../storage';
import {
  groupReminderItemsByParent,
  sendConsolidatedFamilyPaymentReminderEmail,
  type FamilyReminderLineItem,
} from '../lib/consolidated-family-reminder';
import { getDb } from '../db';
import { getStripeClient } from '../config/stripe';
import { scheduledPayments, type InsertPayment } from '../../shared/schema';
import { and, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import {
  type AutoPayCandidateLike,
  type DueAutoPayQueryCriteria,
  evaluateAutoPayPolicy,
  getDueAutoPayCandidates,
} from './autopay-policy';
import {
  mapStripePaymentIntentStatusString,
  reconcileStuckAutoPayProcessingAttempts,
  type AutoPayReconciliationRepository,
  type AutoPayReconciliationResult,
  type ProcessingScheduledPaymentLike,
} from './autopay-reconciliation';
import {
  maybeEmitCreditCoveredSkipNotification,
  maybeEmitPreChargeNotification,
  flushPreChargeEmailBatch,
} from "./autopay-notifications";
import { resolveScheduledPaymentEnrollmentIds } from "../lib/scheduled-payment-intent-metadata";
import { splitCentsEvenly } from "../api/billing";
import { runAutoPayOffSessionChargesForResults } from "./autopay-off-session-charge";

export interface ReminderResult {
  scheduledPaymentId: number;
  parentEmail: string;
  reminderType: 'upcoming' | 'due_today' | 'overdue';
  daysUntilDue: number;
  sent: boolean;
  error?: string;
}

export interface AutoPayExecutionResult {
  scheduledPaymentId: number;
  action: 'process' | 'skip';
  reason?: 'retry_cap_reached' | 'stale_attempt' | 'credit_covered';
  /** Present for `process` rows so the singleton worker can run off-session charges. */
  parentId?: number;
  parentEmail?: string;
  amountCents?: number;
  enrollmentId?: number;
  installmentNumber?: number;
  totalInstallments?: number;
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;
let autopayReconciliationInterval: ReturnType<typeof setInterval> | null = null;

const DEFAULT_AUTOPAY_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1000;
const MIN_AUTOPAY_RECONCILIATION_INTERVAL_MS = 60 * 1000;

/**
 * Stuck `processing` row age uses `AUTOPAY_PROCESSING_STUCK_MINUTES` (see `autopay-observability`).
 * Tick cadence is read once at module load from `AUTOPAY_RECONCILIATION_INTERVAL_MS` (milliseconds);
 * invalid or below one minute falls back to the default (1 hour).
 */
function resolveAutopayReconciliationIntervalMs(): number {
  const raw = process.env.AUTOPAY_RECONCILIATION_INTERVAL_MS;
  if (raw === undefined || raw === "") {
    return DEFAULT_AUTOPAY_RECONCILIATION_INTERVAL_MS;
  }
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < MIN_AUTOPAY_RECONCILIATION_INTERVAL_MS) {
    return DEFAULT_AUTOPAY_RECONCILIATION_INTERVAL_MS;
  }
  return parsed;
}

export const AUTOPAY_RECONCILIATION_INTERVAL_MS = resolveAutopayReconciliationIntervalMs();

async function resolvePaymentLabelsForEnrollment(enrollmentId: number): Promise<{ childName: string; className: string }> {
  const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
  if (!enrollment) {
    return { childName: 'Student', className: 'Class' };
  }
  let childName = 'Student';
  let className = 'Class';
  if (enrollment.childId) {
    const child = await storage.getChildById(enrollment.childId);
    if (child) {
      childName = `${child.firstName} ${child.lastName}`.trim();
    }
  }
  if (enrollment.classId) {
    const cls = await storage.getClassById(enrollment.classId);
    if (cls) {
      className = cls.title || cls.description || 'Class';
    }
  }
  return { childName, className };
}

/** @internal Exported for reconciliation idempotency tests. */
export function isWebhookScheduledPaymentCompletionSource(
  completionSource: string | null | undefined,
): boolean {
  return completionSource === 'stripe_autopay' || completionSource === 'stripe_checkout';
}

/** @internal Exported for reconciliation idempotency tests. */
export function paymentRowBlocksReconciliationBackfill(status: string | undefined): boolean {
  return status === 'completed' || status === 'succeeded' || status === 'pending';
}

/**
 * When reconciliation marks a scheduled payment completed from Stripe truth but no `payments` row exists yet
 * (missed webhook), apply the same enrollment split and ledger row the webhook would have created.
 * Skips enrollment mutation if the webhook already completed the SP or any payments row exists for the PI.
 */
async function applyReconciliationLedgerSideEffectsIfNeeded(scheduledPaymentId: number): Promise<void> {
  const db = await getDb();
  const [row] = await db.select().from(scheduledPayments).where(eq(scheduledPayments.id, scheduledPaymentId));
  if (!row?.stripePaymentIntentId) {
    return;
  }

  const existing = await storage.getPaymentByStripeId(row.stripePaymentIntentId);
  if (paymentRowBlocksReconciliationBackfill(existing?.status)) {
    return;
  }
  if (existing) {
    console.warn(
      `[autopay-reconciliation] skip ledger backfill for payment ${scheduledPaymentId}: PI ${row.stripePaymentIntentId} already has payments row (status=${existing.status})`,
    );
    return;
  }

  const stripe = await getStripeClient();
  const pi = await stripe.paymentIntents.retrieve(row.stripePaymentIntentId);
  if (pi.status !== 'succeeded') {
    return;
  }

  const racing = await storage.getPaymentByStripeId(row.stripePaymentIntentId);
  if (paymentRowBlocksReconciliationBackfill(racing?.status)) {
    return;
  }
  if (racing) {
    console.warn(
      `[autopay-reconciliation] skip ledger backfill for payment ${scheduledPaymentId}: concurrent payments row appeared (status=${racing.status})`,
    );
    return;
  }

  const [freshRow] = await db
    .select()
    .from(scheduledPayments)
    .where(eq(scheduledPayments.id, scheduledPaymentId));
  const webhookAlreadyAppliedLedger =
    freshRow?.status === 'completed' &&
    isWebhookScheduledPaymentCompletionSource(freshRow.completionSource);

  const enrollmentIds = resolveScheduledPaymentEnrollmentIds(
    freshRow ?? row,
    pi.metadata as Record<string, string | undefined>,
  );
  if (enrollmentIds.length === 0) {
    console.error(`[autopay-reconciliation] no enrollment ids for scheduled payment ${scheduledPaymentId}`);
    return;
  }

  const amountCents = typeof pi.amount === "number" ? pi.amount : 0;
  const shares = splitCentsEvenly(amountCents, enrollmentIds.length);

  if (!webhookAlreadyAppliedLedger) {
    for (let i = 0; i < enrollmentIds.length; i++) {
      const enrollmentId = enrollmentIds[i]!;
      const shareCents = shares[i] ?? 0;
      const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      if (!enrollment) {
        console.error(`[autopay-reconciliation] enrollment ${enrollmentId} not found (scheduled ${scheduledPaymentId})`);
        continue;
      }
      const newPaid = (enrollment.totalPaid || 0) + shareCents;
      const newBal = Math.max(0, (enrollment.totalCost || 0) - newPaid);
      await storage.updateProgramEnrollment(enrollmentId, {
        totalPaid: newPaid,
        remainingBalance: newBal,
        paymentStatus: newBal <= 0 ? 'completed' : 'partial_payment',
      });
    }
  } else {
    console.log(
      `[autopay-reconciliation] scheduled payment ${scheduledPaymentId} already completed by webhook (${freshRow?.completionSource}); creating payments row only for PI ${row.stripePaymentIntentId}`,
    );
  }

  const { childName, className } = await resolvePaymentLabelsForEnrollment(enrollmentIds[0]!);
  const parentUser = await storage.getUserByEmail(row.parentEmail);
  const paymentPayload: InsertPayment = {
    schoolId: row.schoolId,
    parentId: parentUser?.id ?? null,
    parentEmail: row.parentEmail,
    childName,
    className,
    description: `Scheduled payment ${row.installmentNumber} of ${row.totalInstallments} (reconciliation)`,
    amount: pi.amount,
    currency: pi.currency || 'usd',
    status: 'completed',
    stripePaymentIntentId: pi.id,
    stripeChargeId: null,
    stripeRefundId: null,
    originalPaymentId: null,
    paymentMethod: 'stripe',
    enrollmentIds,
    metadata: {
      scheduledPaymentId: String(scheduledPaymentId),
      reconciliation: true,
    },
    paymentDate: new Date(),
  };

  await storage.createPayment(paymentPayload);
  console.log(`[autopay-reconciliation] ledger backfill created for scheduled payment ${scheduledPaymentId}, PI ${pi.id}`);
}

function buildAutoPayReconciliationRepository(
  db: Awaited<ReturnType<typeof getDb>>,
): AutoPayReconciliationRepository<ProcessingScheduledPaymentLike> {
  return {
    async queryProcessingScheduledPayments(criteria) {
      return await db
        .select({
          id: scheduledPayments.id,
          amount: scheduledPayments.amount,
          retryCount: scheduledPayments.retryCount,
          status: scheduledPayments.status,
          stripePaymentIntentId: scheduledPayments.stripePaymentIntentId,
          updatedAt: scheduledPayments.updatedAt,
        })
        .from(scheduledPayments)
        .where(
          and(eq(scheduledPayments.status, criteria.status), lt(scheduledPayments.updatedAt, criteria.updatedBefore)),
        );
    },
    async markScheduledPaymentCompleted(id, processedAt) {
      await db
        .update(scheduledPayments)
        .set({
          status: 'completed',
          processedAt,
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPayments.id, id));
    },
    async markScheduledPaymentFailed(id, params) {
      await db
        .update(scheduledPayments)
        .set({
          status: 'failed',
          failureReason: params.reason,
          retryCount: params.retryCount,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPayments.id, id));
    },
    async markScheduledPaymentPending(id, params) {
      await db
        .update(scheduledPayments)
        .set({
          status: 'pending',
          failureReason: params.reason,
          retryCount: params.retryCount,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPayments.id, id));
    },
  };
}

/**
 * Reconcile scheduled_payments stuck in `processing` against Stripe PaymentIntent status.
 * Runs only from the singleton background worker (`ENABLE_BACKGROUND_JOBS=true`), same as reminder timers.
 */
export async function runAutoPayStuckProcessingReconciliation(now: Date = new Date()): Promise<AutoPayReconciliationResult[]> {
  const db = await getDb();
  const repository = buildAutoPayReconciliationRepository(db);
  const stripeGateway = {
    async getPaymentIntentStatus(paymentIntentId: string) {
      const stripe = await getStripeClient();
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      return mapStripePaymentIntentStatusString(pi.status);
    },
  };

  const results = await reconcileStuckAutoPayProcessingAttempts(repository, stripeGateway, now);

  const succeeded = results.filter((r) => r.action === 'completed_from_stripe_truth');
  for (const r of succeeded) {
    try {
      await applyReconciliationLedgerSideEffectsIfNeeded(r.paymentId);
    } catch (err) {
      console.error(`[autopay-reconciliation] ledger side effects failed for scheduled payment ${r.paymentId}:`, err);
    }
  }

  if (results.length > 0) {
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[autopay-reconciliation] run complete (${results.length} rows):`, summary);
  }

  return results;
}

async function tickAutoPayReconciliation(): Promise<void> {
  try {
    await runAutoPayStuckProcessingReconciliation();
  } catch (err) {
    console.error('[autopay-reconciliation] scheduled tick failed:', err);
  }
}

function startAutoPayReconciliationScheduler(): void {
  if (autopayReconciliationInterval) {
    console.log('ℹ️ AutoPay reconciliation scheduler already running; skipping duplicate start');
    return;
  }
  console.log(
    `🔁 Starting AutoPay stuck-processing reconciliation (every ${AUTOPAY_RECONCILIATION_INTERVAL_MS / 60_000} min, singleton in-process guard)`,
  );
  void tickAutoPayReconciliation();
  autopayReconciliationInterval = setInterval(tickAutoPayReconciliation, AUTOPAY_RECONCILIATION_INTERVAL_MS);
  autopayReconciliationInterval.unref?.();
}

// Days before/after due date to send reminders
const REMINDER_DAYS = {
  SEVEN_DAYS_BEFORE: 7,
  THREE_DAYS_BEFORE: 3,
  ONE_DAY_BEFORE: 1,
  DUE_TODAY: 0,
  ONE_DAY_OVERDUE: -1,
  SEVEN_DAYS_OVERDUE: -7
};

async function queryDueScheduledPayments(criteria: DueAutoPayQueryCriteria): Promise<AutoPayCandidateLike[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: scheduledPayments.id,
      scheduledDate: scheduledPayments.scheduledDate,
      retryCount: scheduledPayments.retryCount,
      status: scheduledPayments.status,
      enrollmentId: scheduledPayments.enrollmentId,
      parentId: scheduledPayments.parentId,
      parentEmail: scheduledPayments.parentEmail,
      amount: scheduledPayments.amount,
      installmentNumber: scheduledPayments.installmentNumber,
      totalInstallments: scheduledPayments.totalInstallments,
    })
    .from(scheduledPayments)
    .where(
      and(
        inArray(scheduledPayments.status, criteria.statuses),
        lte(scheduledPayments.scheduledDate, criteria.dueOnOrBefore),
        gte(scheduledPayments.scheduledDate, criteria.dueOnOrAfter),
        lt(scheduledPayments.retryCount, criteria.retryCountLessThan),
      )
    );

  return rows;
}

/**
 * Live AutoPay execution path. Uses DB-query criteria as source-of-truth for due candidates,
 * then applies policy guards deterministically.
 */
export async function processAutoPayExecutionPath(now: Date = new Date()): Promise<AutoPayExecutionResult[]> {
  const results: AutoPayExecutionResult[] = [];

  const dueCandidates = await getDueAutoPayCandidates(
    { queryDueScheduledPayments },
    now
  );

  for (const candidate of dueCandidates) {
    const decision = evaluateAutoPayPolicy(candidate, now);
    if (decision.action === 'skip') {
      await storage.updateScheduledPaymentStatus(candidate.id, 'cancelled');
      results.push({
        scheduledPaymentId: candidate.id,
        action: 'skip',
        reason: decision.reason,
        parentId: candidate.parentId ?? undefined,
        parentEmail: candidate.parentEmail ?? undefined,
      });
      continue;
    }

    const enrollmentId = candidate.enrollmentId ?? undefined;
    const parentId = candidate.parentId ?? undefined;
    const parentEmail = candidate.parentEmail ?? undefined;
    const amountCents = candidate.amount ?? undefined;

    if (
      enrollmentId != null &&
      parentId != null &&
      parentEmail &&
      amountCents != null &&
      amountCents > 0
    ) {
      const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      const remaining = enrollment?.remainingBalance != null ? Number(enrollment.remainingBalance) : null;
      if (remaining != null && Number.isFinite(remaining) && remaining <= 0) {
        const dueAt = new Date(candidate.scheduledDate ?? candidate.dueDate ?? now);
        await maybeEmitCreditCoveredSkipNotification({
          scheduledPaymentId: candidate.id,
          parentId,
          parentEmail,
          amountCents,
          dueAt,
          now,
        });
        await storage.updateScheduledPaymentStatus(candidate.id, 'cancelled');
        results.push({
          scheduledPaymentId: candidate.id,
          action: 'skip',
          reason: 'credit_covered',
          parentId,
          parentEmail,
        });
        continue;
      }
    }

    if (
      parentId != null &&
      parentEmail &&
      amountCents != null &&
      candidate.scheduledDate
    ) {
      const dueAt = new Date(candidate.scheduledDate);
      let childName: string | undefined;
      let className: string | undefined;
      let schoolName: string | undefined;
      let schoolId: number | undefined;
      if (enrollmentId != null) {
        const labels = await resolvePaymentLabelsForEnrollment(enrollmentId);
        childName = labels.childName;
        className = labels.className;
        const enr = await storage.getProgramEnrollmentById(enrollmentId);
        if (enr?.schoolId) {
          schoolId = enr.schoolId;
          const school = await storage.getSchool(enr.schoolId);
          schoolName = school?.name ?? undefined;
        }
      }
      await maybeEmitPreChargeNotification({
        scheduledPaymentId: candidate.id,
        parentId,
        parentEmail,
        amountCents,
        dueAt,
        childName,
        className,
        schoolName,
        schoolId,
        installmentNumber: candidate.installmentNumber ?? undefined,
        totalInstallments: candidate.totalInstallments ?? undefined,
        now,
      });
    }

    // Runtime processing path can proceed to actual charge execution.
    // We explicitly avoid mutating retry/status here unless policy transitions it terminal.
    results.push({
      scheduledPaymentId: candidate.id,
      action: 'process',
      parentId: parentId ?? undefined,
      parentEmail: parentEmail ?? undefined,
      amountCents: amountCents ?? undefined,
      enrollmentId: enrollmentId ?? undefined,
      installmentNumber: candidate.installmentNumber ?? undefined,
      totalInstallments: candidate.totalInstallments ?? undefined,
    });
  }

  await flushPreChargeEmailBatch();

  return results;
}

/**
 * Calculate days until a payment is due (negative if overdue)
 */
function daysUntilDue(dueDate: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Determine if a reminder should be sent based on days until due and reminder count
 */
export function shouldSendReminder(daysUntil: number, reminderCount: number): boolean {
  // Map days to expected reminder count to prevent duplicate sends
  const reminderSchedule: Record<number, number> = {
    7: 0,  // 7 days before = first reminder (count 0)
    3: 1,  // 3 days before = second reminder (count 1)
    1: 2,  // 1 day before = third reminder (count 2)
    0: 3,  // Due today = fourth reminder (count 3)
    [-1]: 4,  // 1 day overdue = fifth reminder (count 4)
    [-7]: 5   // 7 days overdue = final notice (count 5)
  };
  
  const expectedReminders = reminderSchedule[daysUntil];
  return expectedReminders !== undefined && reminderCount === expectedReminders;
}

type ScheduledReminderCandidate = FamilyReminderLineItem & {
  parentEmail: string;
  daysUntil: number;
  reminderCount: number;
  status: string;
};

/**
 * Process and send reminders for all pending scheduled payments.
 * One consolidated email per parent per reminder tier (not one per enrollment).
 */
export async function processScheduledPaymentReminders(): Promise<ReminderResult[]> {
  console.log('📧 Processing scheduled payment reminders...');
  const results: ReminderResult[] = [];
  
  try {
    const allScheduledPayments = await storage.getAllScheduledPayments();
    const pendingPayments = allScheduledPayments.filter(p => 
      p.status === 'pending' || p.status === 'overdue'
    );
    
    console.log(`📋 Found ${pendingPayments.length} pending scheduled payments to check`);

    const candidates: ScheduledReminderCandidate[] = [];

    for (const payment of pendingPayments) {
      const daysUntil = daysUntilDue(new Date(payment.scheduledDate));
      const reminderCount = payment.reminderCount || 0;

      if (!shouldSendReminder(daysUntil, reminderCount)) {
        continue;
      }

      let childName = 'Student';
      let className = 'Class';
      let schoolName = 'American Seekers Academy';
      let schoolId = payment.schoolId ?? 1;

      if (payment.enrollmentId) {
        const enrollment = await storage.getEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          childName = enrollment.childName || 'Student';
          className = enrollment.className || 'Class';
          if (enrollment.schoolId) {
            schoolId = enrollment.schoolId;
            const school = await storage.getSchool(enrollment.schoolId);
            if (school) {
              schoolName = school.name;
            }
          }
        }
      }

      candidates.push({
        parentEmail: payment.parentEmail,
        scheduledPaymentId: payment.id,
        childName,
        className,
        amountCents: payment.amount,
        dueDate: new Date(payment.scheduledDate),
        schoolId,
        schoolName,
        daysUntil,
        reminderCount,
        status: payment.status,
      });
    }

    const groups = groupReminderItemsByParent(candidates, (c) => String(c.daysUntil));

    for (const group of groups.values()) {
      const daysUntil = group[0]!.daysUntil;
      const parentEmail = group[0]!.parentEmail;
      const reminderType: ReminderResult['reminderType'] =
        daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'due_today' : 'upcoming';

      const groupResults: ReminderResult[] = group.map((c) => ({
        scheduledPaymentId: c.scheduledPaymentId,
        parentEmail: c.parentEmail,
        reminderType,
        daysUntilDue: daysUntil,
        sent: false,
      }));

      try {
        const sent = await sendConsolidatedFamilyPaymentReminderEmail({
          parentEmail,
          lineItems: group,
          daysUntilDue: daysUntil,
          schoolName: group[0]!.schoolName,
        });

        if (sent) {
          for (const c of group) {
            await storage.updateScheduledPaymentReminderCount(c.scheduledPaymentId, c.reminderCount + 1);
            if (daysUntil < 0 && c.status !== 'overdue') {
              await storage.updateScheduledPaymentStatus(c.scheduledPaymentId, 'overdue');
            }
          }
          for (const r of groupResults) {
            r.sent = true;
          }
          console.log(
            `✅ Sent consolidated ${reminderType} reminder (${group.length} item(s)) to ${parentEmail}`,
          );
        }
      } catch (emailError) {
        const message = emailError instanceof Error ? emailError.message : String(emailError);
        for (const r of groupResults) {
          r.error = message;
        }
        console.error(`❌ Failed consolidated reminder for ${parentEmail}:`, message);
      }

      results.push(...groupResults);
    }
    
    console.log(`📧 Reminder processing complete: ${results.filter(r => r.sent).length} sent, ${results.filter(r => !r.sent).length} failed`);
    
  } catch (error) {
    console.error('❌ Error processing payment reminders:', error);
  }
  
  return results;
}

/**
 * Start the scheduled payment reminder job (6h) and AutoPay stuck-processing reconciliation (hourly).
 * In-process singleton guards prevent duplicate timers within one Node process; use ENABLE_BACKGROUND_JOBS on one worker only.
 *
 * Off-session installment charges run only when AUTOPAY_OFF_SESSION_CHARGES is truthy on this process
 * (same singleton as ENABLE_BACKGROUND_JOBS) so API replicas never initiate charges by default.
 */
export function startScheduledPaymentReminderJob(): void {
  if (reminderInterval) {
    console.log('ℹ️ Scheduled payment reminder job already running; skipping duplicate start');
    return;
  }
  console.log('🔔 Starting scheduled payment reminder job...');
  
  // Run immediately on startup
  processScheduledPaymentReminders().then(results => {
    if (results.length > 0) {
      console.log(`📧 Initial reminder check: ${results.filter(r => r.sent).length} reminders sent`);
    }
  });
  processAutoPayExecutionPath().then(async (results) => {
    if (results.length > 0) {
      const skipped = results.filter(r => r.action === 'skip').length;
      const processable = results.filter(r => r.action === 'process').length;
      console.log(`💳 Initial AutoPay execution check: ${processable} processable, ${skipped} terminal-skipped`);
    }
    try {
      await runAutoPayOffSessionChargesForResults(results);
    } catch (e) {
      console.error('❌ AutoPay off-session charge batch failed:', e);
    }
  }).catch(error => {
    console.error('❌ Error during initial AutoPay execution path:', error);
  });
  
  // Then run every 6 hours
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  reminderInterval = setInterval(() => {
    processScheduledPaymentReminders().then(results => {
      if (results.length > 0) {
        console.log(`📧 Scheduled reminder check: ${results.filter(r => r.sent).length} reminders sent`);
      }
    });
    processAutoPayExecutionPath().then(async (results) => {
      if (results.length > 0) {
        const skipped = results.filter(r => r.action === 'skip').length;
        const processable = results.filter(r => r.action === 'process').length;
        console.log(`💳 Scheduled AutoPay execution check: ${processable} processable, ${skipped} terminal-skipped`);
      }
      try {
        await runAutoPayOffSessionChargesForResults(results);
      } catch (e) {
        console.error('❌ AutoPay off-session charge batch failed:', e);
      }
    }).catch(error => {
      console.error('❌ Error during scheduled AutoPay execution path:', error);
    });
  }, SIX_HOURS_MS);
  reminderInterval.unref?.();

  startAutoPayReconciliationScheduler();

  console.log(
    `✅ Scheduled payment reminder job initialized - reminders every 6 hours; AutoPay reconciliation every ${AUTOPAY_RECONCILIATION_INTERVAL_MS / 60_000} min`,
  );
}

export function stopScheduledPaymentReminderJob(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
  if (autopayReconciliationInterval) {
    clearInterval(autopayReconciliationInterval);
    autopayReconciliationInterval = null;
  }
}
