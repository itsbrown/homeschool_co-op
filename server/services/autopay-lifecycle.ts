import { AUTOPAY_MAX_RETRY_ATTEMPTS } from "./autopay-policy";

export type AutoPayStartDecision =
  | { action: "start_new_attempt" }
  | { action: "replay_existing_attempt"; paymentIntentId: string }
  | { action: "skip_terminal"; reason: "completed" | "cancelled" | "retry_cap_reached" };

export interface ScheduledPaymentAttemptLike {
  id: number;
  amount: number;
  retryCount?: number | null;
  status?: string | null;
  stripePaymentIntentId?: string | null;
}

/**
 * Replay-safe attempt start guard:
 * - never starts a new attempt for completed/cancelled/terminal payments
 * - replays existing processing attempt when a Stripe payment intent already exists
 */
export function decideAutoPayAttemptStart(
  scheduledPayment: ScheduledPaymentAttemptLike,
): AutoPayStartDecision {
  const status = String(scheduledPayment.status ?? "").toLowerCase();
  const retryCount = Number.isFinite(scheduledPayment.retryCount)
    ? Math.max(0, Math.floor(Number(scheduledPayment.retryCount)))
    : 0;

  if (status === "completed") {
    return { action: "skip_terminal", reason: "completed" };
  }
  if (status === "cancelled") {
    return { action: "skip_terminal", reason: "cancelled" };
  }
  if (retryCount >= AUTOPAY_MAX_RETRY_ATTEMPTS) {
    return { action: "skip_terminal", reason: "retry_cap_reached" };
  }
  if (status === "processing" && scheduledPayment.stripePaymentIntentId) {
    return {
      action: "replay_existing_attempt",
      paymentIntentId: scheduledPayment.stripePaymentIntentId,
    };
  }

  return { action: "start_new_attempt" };
}

export function buildAutoPayAttemptKey(input: {
  scheduledPaymentId: number;
  retryCount: number;
}): string {
  return `autopay:${input.scheduledPaymentId}:retry:${input.retryCount}`;
}
