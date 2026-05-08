export type AutoPayMetricName =
  | "autopay_transition_total"
  | "autopay_failure_total"
  | "autopay_backlog_total"
  | "autopay_divergence_total";

export type AutoPayReasonCode =
  | "completed"
  | "cancelled"
  | "retry_cap_reached"
  | "retry_exhausted"
  | "stale_attempt"
  | "missing_payment_intent"
  | "stuck_processing_backlog"
  | "stripe_succeeded"
  | "stripe_processing"
  | "stripe_requires_payment_method"
  | "stripe_requires_action"
  | "stripe_requires_confirmation"
  | "stripe_canceled";

export interface AutoPayMetricEvent {
  metric: AutoPayMetricName;
  labels: Record<string, string | number>;
}

export interface AutoPayMetricsSink {
  emit(event: AutoPayMetricEvent): void;
}

export function emitAutoPayMetric(
  sink: AutoPayMetricsSink | undefined,
  event: AutoPayMetricEvent,
): void {
  sink?.emit(event);
}
