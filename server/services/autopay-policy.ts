/**
 * P1-B-01 (retry cap): AUTOPAY_MAX_RETRY_ATTEMPTS; isRetryCapReached; retryCountLessThan in buildDueAutoPayQueryCriteria.
 * P1-B-02 (stale cutoff): AUTOPAY_STALE_ATTEMPT_DAYS; isStaleAttemptDate; dueOnOrAfter window in buildDueAutoPayQueryCriteria.
 * P1-B-03 (due criteria / DB): DueAutoPayQueryCriteria; DueAutoPayRepository; buildDueAutoPayQueryCriteria; getDueAutoPayCandidates.
 */

export const AUTOPAY_MAX_RETRY_ATTEMPTS = 3;
export const AUTOPAY_STALE_ATTEMPT_DAYS = 14;

export type AutoPayTerminalReason = "retry_cap_reached" | "stale_attempt";
export type AutoPayPolicyDecision =
  | { action: "process" }
  | { action: "skip"; reason: AutoPayTerminalReason };

export interface DueAutoPayQueryCriteria {
  dueOnOrBefore: Date;
  dueOnOrAfter: Date;
  statuses: Array<"pending" | "overdue">;
  retryCountLessThan: number;
}

export interface AutoPayCandidateLike {
  id: number;
  dueDate?: Date | string | null;
  scheduledDate?: Date | string | null;
  retryCount?: number | null;
  status?: string | null;
  /** Present when loaded from `scheduled_payments` for AutoPay execution + notifications */
  enrollmentId?: number | null;
  parentId?: number | null;
  parentEmail?: string | null;
  amount?: number | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
}

export interface DueAutoPayRepository<T extends AutoPayCandidateLike> {
  queryDueScheduledPayments(criteria: DueAutoPayQueryCriteria): Promise<T[]>;
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function buildDueAutoPayQueryCriteria(now: Date = new Date()): DueAutoPayQueryCriteria {
  const today = toUtcDateOnly(now);
  return {
    dueOnOrBefore: today,
    dueOnOrAfter: addDays(today, -AUTOPAY_STALE_ATTEMPT_DAYS),
    statuses: ["pending", "overdue"],
    retryCountLessThan: AUTOPAY_MAX_RETRY_ATTEMPTS,
  };
}

export function isRetryCapReached(retryCount: unknown): boolean {
  const parsed = typeof retryCount === "number" && Number.isFinite(retryCount)
    ? Math.floor(retryCount)
    : 0;
  return parsed >= AUTOPAY_MAX_RETRY_ATTEMPTS;
}

export function isStaleAttemptDate(
  dueDateInput: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dueDateInput) return false;
  const dueDate = new Date(dueDateInput);
  if (Number.isNaN(dueDate.getTime())) return false;

  const due = toUtcDateOnly(dueDate);
  const cutoff = addDays(toUtcDateOnly(now), -AUTOPAY_STALE_ATTEMPT_DAYS);
  return due < cutoff;
}

export function evaluateAutoPayPolicy(
  candidate: AutoPayCandidateLike,
  now: Date = new Date(),
): AutoPayPolicyDecision {
  if (isRetryCapReached(candidate.retryCount)) {
    return { action: "skip", reason: "retry_cap_reached" };
  }

  const dueDateInput = candidate.dueDate ?? candidate.scheduledDate;
  if (isStaleAttemptDate(dueDateInput ?? null, now)) {
    return { action: "skip", reason: "stale_attempt" };
  }

  return { action: "process" };
}

/**
 * Due-payment selection entrypoint.
 * Source of truth comes from repository DB query criteria (not in-memory filtering).
 */
export async function getDueAutoPayCandidates<T extends AutoPayCandidateLike>(
  repository: DueAutoPayRepository<T>,
  now: Date = new Date(),
): Promise<T[]> {
  const criteria = buildDueAutoPayQueryCriteria(now);
  return repository.queryDueScheduledPayments(criteria);
}
