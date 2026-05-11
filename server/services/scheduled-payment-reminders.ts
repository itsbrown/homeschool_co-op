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
import { sendScheduledPaymentReminder, sendOverduePaymentNotice } from '../lib/email-service';
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
  reason?: 'retry_cap_reached' | 'stale_attempt';
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

function resolveEnrollmentIdsForScheduledRow(row: { enrollmentId: number; metadata: unknown }): number[] {
  const meta = row.metadata as Record<string, unknown> | null | undefined;
  const fromMeta = meta?.enrollmentIds;
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
  }
  return [row.enrollmentId];
}

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

/**
 * When reconciliation marks a scheduled payment completed from Stripe truth but no `payments` row exists yet
 * (missed webhook), apply the same enrollment split and ledger row the webhook would have created.
 * Skips if a completed payment already exists for the PI (idempotent with webhook).
 */
async function applyReconciliationLedgerSideEffectsIfNeeded(scheduledPaymentId: number): Promise<void> {
  const db = await getDb();
  const [row] = await db.select().from(scheduledPayments).where(eq(scheduledPayments.id, scheduledPaymentId));
  if (!row?.stripePaymentIntentId) {
    return;
  }

  const existing = await storage.getPaymentByStripeId(row.stripePaymentIntentId);
  if (existing?.status === 'completed') {
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
  if (racing?.status === 'completed') {
    return;
  }
  if (racing) {
    console.warn(
      `[autopay-reconciliation] skip ledger backfill for payment ${scheduledPaymentId}: concurrent payments row appeared (status=${racing.status})`,
    );
    return;
  }

  const enrollmentIds = resolveEnrollmentIdsForScheduledRow(row);
  if (enrollmentIds.length === 0) {
    console.error(`[autopay-reconciliation] no enrollment ids for scheduled payment ${scheduledPaymentId}`);
    return;
  }

  const shareCents = Math.round(Number(pi.amount) / enrollmentIds.length);

  for (const enrollmentId of enrollmentIds) {
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
      });
      continue;
    }

    // Runtime processing path can proceed to actual charge execution.
    // We explicitly avoid mutating retry/status here unless policy transitions it terminal.
    results.push({
      scheduledPaymentId: candidate.id,
      action: 'process',
    });
  }

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
function shouldSendReminder(daysUntil: number, reminderCount: number): boolean {
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

/**
 * Get reminder message based on days until due
 */
function getReminderMessage(daysUntil: number, amount: number, childName: string, className: string): {
  subject: string;
  message: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
} {
  const formattedAmount = `$${(amount / 100).toFixed(2)}`;
  
  if (daysUntil >= 7) {
    return {
      subject: `Upcoming Payment Reminder - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due in 7 days.`,
      urgency: 'low'
    };
  } else if (daysUntil >= 3) {
    return {
      subject: `Payment Due Soon - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due in 3 days.`,
      urgency: 'medium'
    };
  } else if (daysUntil === 1) {
    return {
      subject: `Payment Due Tomorrow - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due tomorrow.`,
      urgency: 'medium'
    };
  } else if (daysUntil === 0) {
    return {
      subject: `Payment Due Today - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due today.`,
      urgency: 'high'
    };
  } else if (daysUntil === -1) {
    return {
      subject: `Payment Overdue - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} was due yesterday. Please make your payment as soon as possible.`,
      urgency: 'high'
    };
  } else {
    return {
      subject: `FINAL NOTICE: Payment Overdue - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is ${Math.abs(daysUntil)} days overdue. Please make your payment immediately to avoid enrollment suspension.`,
      urgency: 'critical'
    };
  }
}

/**
 * Process and send reminders for all pending scheduled payments
 */
export async function processScheduledPaymentReminders(): Promise<ReminderResult[]> {
  console.log('📧 Processing scheduled payment reminders...');
  const results: ReminderResult[] = [];
  
  try {
    // Get all scheduled payments
    const allScheduledPayments = await storage.getAllScheduledPayments();
    
    // Filter to only pending payments
    const pendingPayments = allScheduledPayments.filter(p => 
      p.status === 'pending' || p.status === 'overdue'
    );
    
    console.log(`📋 Found ${pendingPayments.length} pending scheduled payments to check`);
    
    for (const payment of pendingPayments) {
      const daysUntil = daysUntilDue(new Date(payment.scheduledDate));
      const reminderCount = payment.reminderCount || 0;
      
      // Check if we should send a reminder
      if (!shouldSendReminder(daysUntil, reminderCount)) {
        continue;
      }
      
      // Get enrollment details for the reminder
      let childName = 'Student';
      let className = 'Class';
      let schoolName = 'School';
      
      if (payment.enrollmentId) {
        const enrollment = await storage.getProgramEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          childName = enrollment.childName || 'Student';
          className = enrollment.className || 'Class';
          
          // Get school name
          if (enrollment.schoolId) {
            const school = await storage.getSchool(enrollment.schoolId);
            if (school) {
              schoolName = school.name;
            }
          }
        }
      }
      
      const reminderInfo = getReminderMessage(daysUntil, payment.amount, childName, className);
      
      const result: ReminderResult = {
        scheduledPaymentId: payment.id,
        parentEmail: payment.parentEmail,
        reminderType: daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'due_today' : 'upcoming',
        daysUntilDue: daysUntil,
        sent: false
      };
      
      try {
        // Send the appropriate email
        if (daysUntil < 0) {
          await sendOverduePaymentNotice({
            parentEmail: payment.parentEmail,
            childName,
            className,
            schoolName,
            amount: payment.amount,
            daysOverdue: Math.abs(daysUntil),
            paymentId: payment.id,
            dueDate: new Date(payment.scheduledDate),
            installmentNumber: payment.installmentNumber,
            totalInstallments: payment.totalInstallments
          });
        } else {
          await sendScheduledPaymentReminder({
            parentEmail: payment.parentEmail,
            childName,
            className,
            schoolName,
            amount: payment.amount,
            dueDate: new Date(payment.scheduledDate),
            daysUntilDue: daysUntil,
            paymentId: payment.id,
            installmentNumber: payment.installmentNumber,
            totalInstallments: payment.totalInstallments,
            urgency: reminderInfo.urgency
          });
        }
        
        // Update reminder count
        await storage.updateScheduledPaymentReminderCount(payment.id, reminderCount + 1);
        
        // Mark as overdue if past due date
        if (daysUntil < 0 && payment.status !== 'overdue') {
          await storage.updateScheduledPaymentStatus(payment.id, 'overdue');
        }
        
        result.sent = true;
        console.log(`✅ Sent ${result.reminderType} reminder for payment ${payment.id} to ${payment.parentEmail}`);
        
        // Log the reminder to the database
        try {
          const enrollment = payment.enrollmentId ? await storage.getProgramEnrollmentById(payment.enrollmentId) : null;
          const reminderTypeMap: Record<number, string> = {
            7: '7_days_before',
            3: '3_days_before',
            1: '1_day_before',
            0: 'due_today',
            [-1]: '1_day_overdue',
            [-7]: '7_days_overdue'
          };
          const reminderLogType = reminderTypeMap[daysUntil] || (daysUntil < 0 ? '7_days_overdue' : '7_days_before');
          
          await storage.createPaymentReminderLog({
            schoolId: enrollment?.schoolId || 1,
            scheduledPaymentId: payment.id,
            parentEmail: payment.parentEmail,
            parentName: null,
            childName,
            className,
            amountCents: payment.amount,
            reminderType: reminderLogType as any,
            status: 'sent',
            isManual: false,
            sentBy: null,
            errorMessage: null
          });
        } catch (logError) {
          console.error(`⚠️ Failed to log reminder for payment ${payment.id}:`, logError);
        }
        
      } catch (emailError) {
        result.error = emailError instanceof Error ? emailError.message : String(emailError);
        console.error(`❌ Failed to send reminder for payment ${payment.id}:`, result.error);
        
        // Log the failed reminder attempt
        try {
          const enrollment = payment.enrollmentId ? await storage.getProgramEnrollmentById(payment.enrollmentId) : null;
          await storage.createPaymentReminderLog({
            schoolId: enrollment?.schoolId || 1,
            scheduledPaymentId: payment.id,
            parentEmail: payment.parentEmail,
            parentName: null,
            childName,
            className,
            amountCents: payment.amount,
            reminderType: daysUntil < 0 ? '1_day_overdue' : 'due_today',
            status: 'failed',
            isManual: false,
            sentBy: null,
            errorMessage: result.error || null
          });
        } catch (logError) {
          console.error(`⚠️ Failed to log failed reminder:`, logError);
        }
      }
      
      results.push(result);
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
  processAutoPayExecutionPath().then(results => {
    if (results.length > 0) {
      const skipped = results.filter(r => r.action === 'skip').length;
      const processable = results.filter(r => r.action === 'process').length;
      console.log(`💳 Initial AutoPay execution check: ${processable} processable, ${skipped} terminal-skipped`);
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
    processAutoPayExecutionPath().then(results => {
      if (results.length > 0) {
        const skipped = results.filter(r => r.action === 'skip').length;
        const processable = results.filter(r => r.action === 'process').length;
        console.log(`💳 Scheduled AutoPay execution check: ${processable} processable, ${skipped} terminal-skipped`);
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
