# Slice: P1-B-06 / P1-B-07 — Explicit AutoPay notifications

## Shipped behavior

| Item | Behavior |
|------|-----------|
| **Pre-charge (B-06)** | `maybeEmitPreChargeNotification` when due time is in **(0, 20h]** from `now`. In-app notification + optional email via `sendScheduledPaymentReminder`. Dedupe: marker in notification body + `getNotificationsByUserId`. |
| **Credit-covered skip (B-07)** | If `getProgramEnrollmentById` shows `remainingBalance <= 0` and installment `amount > 0`, skip charge, `updateScheduledPaymentStatus(..., 'cancelled')`, `maybeEmitCreditCoveredSkipNotification`. |

## Files

- `server/services/autopay-notifications.ts`
- `server/services/scheduled-payment-reminders.ts` (`processAutoPayExecutionPath`, wider DB select)
- `server/services/autopay-observability.ts` (`autopay_notifications_total` labels)
- Tests: `server/tests/autopay-notifications.test.ts`, `server/tests/integration/phase2/autopay-runtime-policy.test.ts`

## Follow-ups (not in this slice)

- Richer “credits ledger” definition when P1-C allocator lands.
- External metrics sink (Prometheus) instead of structured `console.log` only.
