import { storage } from "../storage";

const DEFAULT_PRECHARGE_WINDOW_DAYS = 0;

export interface AutoPayNotificationCandidate {
  id: number;
  parentId?: number | null;
  parentEmail?: string | null;
  amount?: number | null;
  retryCount?: number | null;
  scheduledDate?: Date | string | null;
  dueDate?: Date | string | null;
  metadata?: Record<string, unknown> | null;
}

function getDateOnlyUtc(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readPreChargeWindowDays(): number {
  const raw = process.env.AUTOPAY_PRECHARGE_NOTICE_WINDOW_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_PRECHARGE_WINDOW_DAYS;
  return Math.floor(parsed);
}

function normalizedRetryCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(Number(value)));
}

function buildPreChargeNoticeKey(candidate: AutoPayNotificationCandidate): string {
  const dueAt = parseDate(candidate.dueDate ?? candidate.scheduledDate);
  const dueIsoDate = dueAt ? dueAt.toISOString().slice(0, 10) : "unknown";
  return `autopay:precharge:scheduled_payment:${candidate.id}:due:${dueIsoDate}:retry:${normalizedRetryCount(candidate.retryCount)}`;
}

function buildCreditCoveredSkipKey(candidate: AutoPayNotificationCandidate): string {
  const dueAt = parseDate(candidate.dueDate ?? candidate.scheduledDate);
  const dueIsoDate = dueAt ? dueAt.toISOString().slice(0, 10) : "unknown";
  return `autopay:credit_covered_skip:scheduled_payment:${candidate.id}:due:${dueIsoDate}:retry:${normalizedRetryCount(candidate.retryCount)}`;
}

async function hasNotificationForEventKey(eventKey: string): Promise<boolean> {
  const existing = await storage.getAllNotifications();
  return existing.some((notification: any) => {
    const targetData = (notification?.targetData ?? {}) as Record<string, unknown>;
    return targetData.autopayEventKey === eventKey;
  });
}

function isPreChargeWindowCandidate(candidate: AutoPayNotificationCandidate, now: Date): boolean {
  const dueAt = parseDate(candidate.dueDate ?? candidate.scheduledDate);
  if (!dueAt) return false;

  const today = getDateOnlyUtc(now);
  const due = getDateOnlyUtc(dueAt);
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const maxWindowDays = readPreChargeWindowDays();
  return daysUntilDue >= 0 && daysUntilDue <= maxWindowDays;
}

export function isCreditCoveredAutoPayCandidate(candidate: AutoPayNotificationCandidate): boolean {
  const amount = Number(candidate.amount ?? NaN);
  if (Number.isFinite(amount) && amount <= 0) {
    return true;
  }

  const metadata = (candidate.metadata ?? {}) as Record<string, unknown>;
  return metadata.autopayCreditCovered === true;
}

export async function emitAutoPayPreChargeNotice(
  candidate: AutoPayNotificationCandidate,
  now: Date = new Date(),
): Promise<{ emitted: boolean; dedupeKey: string }> {
  const dedupeKey = buildPreChargeNoticeKey(candidate);
  if (!candidate.parentId || !isPreChargeWindowCandidate(candidate, now)) {
    return { emitted: false, dedupeKey };
  }
  if (await hasNotificationForEventKey(dedupeKey)) {
    return { emitted: false, dedupeKey };
  }

  await storage.createNotification({
    type: "in_app",
    priority: "normal",
    subject: "AutoPay charge scheduled",
    content: "An AutoPay charge is scheduled for your upcoming tuition payment.",
    targetType: "individual",
    targetData: {
      userIds: [candidate.parentId],
      scheduledPaymentId: candidate.id,
      autopayEventKey: dedupeKey,
      autopayEventType: "pre_charge_notice",
    } as any,
    status: "pending",
  } as any);

  return { emitted: true, dedupeKey };
}

export async function emitAutoPayCreditCoveredSkipNotice(
  candidate: AutoPayNotificationCandidate,
): Promise<{ emitted: boolean; dedupeKey: string }> {
  const dedupeKey = buildCreditCoveredSkipKey(candidate);
  if (!candidate.parentId || !isCreditCoveredAutoPayCandidate(candidate)) {
    return { emitted: false, dedupeKey };
  }
  if (await hasNotificationForEventKey(dedupeKey)) {
    return { emitted: false, dedupeKey };
  }

  await storage.createNotification({
    type: "in_app",
    priority: "normal",
    subject: "AutoPay skipped",
    content: "Your scheduled AutoPay charge was skipped because account credits covered this payment.",
    targetType: "individual",
    targetData: {
      userIds: [candidate.parentId],
      scheduledPaymentId: candidate.id,
      autopayEventKey: dedupeKey,
      autopayEventType: "credit_covered_skip_notice",
    } as any,
    status: "pending",
  } as any);

  return { emitted: true, dedupeKey };
}
