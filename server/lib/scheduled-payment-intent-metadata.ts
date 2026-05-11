/**
 * Stripe PaymentIntent metadata for `payment_intent.*` handling in `server/webhook-handler.ts`
 * when `paymentType` / `type` is `scheduled_payment`.
 * All values are strings per Stripe metadata rules.
 */

export type ScheduledPaymentIntentMetadataInput = {
  scheduledPaymentId: number;
  parentEmail: string;
  parentUserId?: number | null;
  installmentNumber: number;
  totalInstallments: number;
  enrollmentIds: number[];
  autoPayInitiated: boolean;
  description?: string;
  creditsAppliedCents?: number;
  originalAmountCents?: number;
  creditHoldSessionId?: string;
  holdSessionId?: string;
  /** Installment charge amount in cents (mirrors legacy `amountCents` metadata). */
  chargeAmountCents?: number;
};

export function resolveEnrollmentIdsFromScheduledRow(row: {
  enrollmentId: number;
  metadata: unknown;
}): number[] {
  const meta = row.metadata as Record<string, unknown> | null | undefined;
  const fromMeta = meta?.enrollmentIds;
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
  }
  return [row.enrollmentId];
}

/**
 * Prefer `enrollmentIds` JSON on the PaymentIntent (authoritative at charge time); else scheduled row.
 * Used by `payment_intent.succeeded` scheduled_payment handling and reconciliation backfill.
 */
export function resolveScheduledPaymentEnrollmentIds(
  scheduledRow: { enrollmentId: number; metadata: unknown },
  paymentIntentMetadata?: Record<string, string | undefined> | null,
): number[] {
  const raw = paymentIntentMetadata?.enrollmentIds;
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ids = parsed.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
        if (ids.length > 0) return ids;
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return resolveEnrollmentIdsFromScheduledRow(scheduledRow);
}

export function buildScheduledPaymentIntentMetadata(
  input: ScheduledPaymentIntentMetadataInput,
): Record<string, string> {
  const meta: Record<string, string> = {
    paymentType: "scheduled_payment",
    type: "scheduled_payment",
    scheduledPaymentId: String(input.scheduledPaymentId),
    parentEmail: input.parentEmail,
    installmentNumber: String(input.installmentNumber),
    totalInstallments: String(input.totalInstallments),
    enrollmentIds: JSON.stringify(input.enrollmentIds),
    autoPayInitiated: input.autoPayInitiated ? "true" : "false",
  };
  if (input.parentUserId != null && Number.isFinite(input.parentUserId)) {
    meta.userId = String(Math.floor(Number(input.parentUserId)));
  }
  if (input.description) {
    meta.description = input.description;
  }
  if (input.creditsAppliedCents != null && input.creditsAppliedCents > 0) {
    meta.creditsAppliedCents = String(Math.floor(input.creditsAppliedCents));
  }
  if (input.originalAmountCents != null) {
    meta.originalAmountCents = String(Math.floor(input.originalAmountCents));
  }
  const hold = input.creditHoldSessionId ?? input.holdSessionId;
  if (hold) {
    meta.creditHoldSessionId = hold;
    meta.holdSessionId = hold;
  }
  if (input.chargeAmountCents != null && Number.isFinite(input.chargeAmountCents)) {
    meta.amountCents = String(Math.round(input.chargeAmountCents));
  }
  return meta;
}
