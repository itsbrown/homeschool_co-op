/**
 * Audits the unified credit ledger for impossible states.
 */

import { storage } from '../storage';
import type { Credit, ScheduledPayment } from '@shared/schema';

export interface CreditViolation {
  type: 'double_spend' | 'status_mismatch' | 'missing_usage_log';
  creditId?: number;
  scheduledPaymentId?: number;
  detail: string;
}

export interface CreditIntegrityReport {
  violations: CreditViolation[];
  counts: {
    doubleSpend: number;
    statusMismatch: number;
    missingLog: number;
  };
}

interface ScheduledPaymentMeta {
  pendingCreditsReservation?: number;
}

function parseScheduledPaymentMeta(metadata: unknown): ScheduledPaymentMeta {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const raw = metadata as Record<string, unknown>;
  const result: ScheduledPaymentMeta = {};
  if (typeof raw.pendingCreditsReservation === 'number') {
    result.pendingCreditsReservation = raw.pendingCreditsReservation;
  }
  return result;
}

function checkDoubleSpend(doubleSpentCredits: Credit[]): CreditViolation[] {
  return doubleSpentCredits.map((credit) => ({
    type: 'double_spend' as const,
    creditId: credit.id,
    detail: `Credit ${credit.id}: usedAmountCents=${credit.usedAmountCents} exceeds creditAmountCents=${credit.creditAmountCents}`,
  }));
}

function checkStatusMismatch(mismatchedCredits: Credit[]): CreditViolation[] {
  const violations: CreditViolation[] = [];
  for (const credit of mismatchedCredits) {
    const { status, usedAmountCents, creditAmountCents, id } = credit;
    if (status === 'used' && usedAmountCents !== creditAmountCents) {
      violations.push({
        type: 'status_mismatch',
        creditId: id,
        detail: `Credit ${id}: status='used' but usedAmountCents=${usedAmountCents} != creditAmountCents=${creditAmountCents}`,
      });
    } else if (
      status === 'partially_used' &&
      (usedAmountCents <= 0 || usedAmountCents >= creditAmountCents)
    ) {
      violations.push({
        type: 'status_mismatch',
        creditId: id,
        detail: `Credit ${id}: status='partially_used' but usedAmountCents=${usedAmountCents} is not a partial amount (creditAmountCents=${creditAmountCents})`,
      });
    } else if (status === 'approved' && usedAmountCents !== 0) {
      violations.push({
        type: 'status_mismatch',
        creditId: id,
        detail: `Credit ${id}: status='approved' but usedAmountCents=${usedAmountCents} is non-zero`,
      });
    }
  }
  return violations;
}

async function checkMissingUsageLogs(creditPayments: ScheduledPayment[]): Promise<CreditViolation[]> {
  const violations: CreditViolation[] = [];

  for (const sp of creditPayments) {
    const isCreditOnly = sp.stripePaymentIntentId?.startsWith('credit_') ?? false;
    const meta = parseScheduledPaymentMeta(sp.metadata);
    const reservedCents = meta.pendingCreditsReservation ?? 0;
    const isPartialCredit = !isCreditOnly && reservedCents > 0;

    let hasUsageLog = false;

    if (isCreditOnly) {
      const descriptionLogs = await storage.getUnifiedCreditUsageLogsByScheduledPaymentId(sp.id);
      if (descriptionLogs.length > 0) {
        hasUsageLog = true;
      } else if (sp.stripePaymentIntentId) {
        const paymentHistory = await storage.getStripePaymentByIntentId(sp.stripePaymentIntentId);
        if (paymentHistory) {
          const historyLogs = await storage.getUnifiedCreditUsageLogsByPaymentHistoryId(paymentHistory.id);
          hasUsageLog = historyLogs.length > 0;
        }
      }

      if (!hasUsageLog) {
        violations.push({
          type: 'missing_usage_log',
          scheduledPaymentId: sp.id,
          detail: `Scheduled payment ${sp.id}: credit-only payment (intentId=${sp.stripePaymentIntentId}) has no unified_credit_usage_logs entry`,
        });
      }
    } else if (isPartialCredit) {
      const descriptionLogs = await storage.getUnifiedCreditUsageLogsByScheduledPaymentId(sp.id);
      if (descriptionLogs.length > 0) {
        hasUsageLog = true;
      } else if (sp.stripePaymentIntentId) {
        const paymentHistory = await storage.getStripePaymentByIntentId(sp.stripePaymentIntentId);
        if (paymentHistory) {
          const historyLogs = await storage.getUnifiedCreditUsageLogsByPaymentHistoryId(paymentHistory.id);
          hasUsageLog = historyLogs.length > 0;
        }
      }

      if (!hasUsageLog) {
        violations.push({
          type: 'missing_usage_log',
          scheduledPaymentId: sp.id,
          detail: `Scheduled payment ${sp.id}: partial credit payment (reservedCents=${reservedCents}) has no unified_credit_usage_logs entry`,
        });
      }
    }
  }

  return violations;
}

export async function runCreditIntegrityCheck(schoolId?: number): Promise<CreditIntegrityReport> {
  const [doubleSpentCredits, mismatchedCredits, creditPayments] = await Promise.all([
    storage.getDoubleSpentCredits(schoolId),
    storage.getMismatchedStatusCredits(schoolId),
    storage.getCompletedScheduledPaymentsWithCreditSource(schoolId),
  ]);

  const doubleSpendViolations = checkDoubleSpend(doubleSpentCredits);
  const statusMismatchViolations = checkStatusMismatch(mismatchedCredits);
  const missingLogViolations = await checkMissingUsageLogs(creditPayments);

  const violations: CreditViolation[] = [
    ...doubleSpendViolations,
    ...statusMismatchViolations,
    ...missingLogViolations,
  ];

  if (doubleSpendViolations.length > 0) {
    console.error(`[CreditIntegrity] ${doubleSpendViolations.length} double-spend violation(s):`, doubleSpendViolations);
  }
  if (statusMismatchViolations.length > 0) {
    console.error(
      `[CreditIntegrity] ${statusMismatchViolations.length} status/amount mismatch violation(s):`,
      statusMismatchViolations
    );
  }
  if (missingLogViolations.length > 0) {
    console.error(`[CreditIntegrity] ${missingLogViolations.length} missing usage log violation(s):`, missingLogViolations);
  }

  return {
    violations,
    counts: {
      doubleSpend: doubleSpendViolations.length,
      statusMismatch: statusMismatchViolations.length,
      missingLog: missingLogViolations.length,
    },
  };
}
